# 动态端口分配与自动发现实施计划

## 背景

当前架构中，服务端固定监听端口 `4000`。在多实例运行或端口被占用时，会导致启动失败。本方案实现：

1. **生产模式**：服务端使用操作系统动态分配端口（port `0`）
2. **开发模式**：保持固定端口 `4000` 便于调试
3. **Mobile/Watch 端**：仅需设置 IP 地址，通过端口发现 API 自动获取端口

---

## 架构概览

```
┌─────────────────────────────────────────────────────────────────────┐
│                          Electron App                                │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐  │
│  │  electron-main  │───▶│  server.js      │    │  client (React) │  │
│  │  (spawn server) │    │  (动态端口)      │◀───│  (前端)          │  │
│  └────────┬────────┘    └────────┬────────┘    └─────────────────┘  │
│           │                      │                                   │
│           │ stdout               │ /api/discover                     │
│           │ SERVER_PORT:xxxx     │                                   │
│           ▼                      ▼                                   │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │                    IPC Bridge (preload)                          ││
│  │                    window.__electron.API_BASE                    ││
│  │                    window.__electron.SERVER_PORT                 ││
│  └─────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   │ /api/discover (HTTP)
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Mobile / Watch App                                │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │  用户只需输入 IP 地址（如 192.168.1.100）                          ││
│  │  App 自动扫描常用端口 + 调用 /api/discover 确认                    ││
│  └─────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────┘
```

---

## 实施步骤

### 1. 服务端：动态端口 + 发现 API

#### 1.1 修改 `server/server.js`

```javascript
// 新增端口发现 API（放在所有路由之后，确保能响应）
app.get('/api/discover', (req, res) => {
  res.json({
    app: 'FilmGallery',
    version: require('./package.json').version,
    port: actualPort, // 实际监听的端口
    timestamp: Date.now()
  });
});

// 端口逻辑修改
const isDev = process.env.NODE_ENV === 'development' || process.env.ELECTRON_DEV === 'true';
const PORT = process.env.PORT || (isDev ? 4000 : 0); // 开发模式固定4000，生产模式动态

const server = app.listen(PORT, '0.0.0.0', () => {
  const actualPort = server.address().port;
  // 输出特殊标记供 electron-main 解析
  console.log(`SERVER_PORT:${actualPort}`);
  console.log(`Server running on http://0.0.0.0:${actualPort}`);
});
```

#### 1.2 新增 `server/constants/app-info.js`

```javascript
// 应用标识信息，用于端口发现验证
module.exports = {
  APP_IDENTIFIER: 'FilmGallery',
  DISCOVERY_ENDPOINT: '/api/discover',
  DEFAULT_PORT: 4000,
  PORT_SCAN_RANGE: [4000, 4001, 4002, 4003, 4004, 4005, 4010, 4020, 4100]
};
```

---

### 2. Electron Main：捕获动态端口

#### 2.1 修改 `electron-main.js`

```javascript
let actualServerPort = 4000; // 默认值

async function startServer(forceRestart = false) {
  // ... 现有逻辑 ...
  
  // 生产模式不再杀死 :4000，因为我们使用动态端口
  // 移除 taskkill 逻辑
  
  serverProcess = spawn(cmd, args, { ... });
  
  // 监听 stdout 捕获端口
  serverProcess.stdout.on('data', (data) => {
    const str = data.toString();
    fs.appendFileSync(outLog, str);
    
    // 解析端口标记
    const match = str.match(/SERVER_PORT:(\d+)/);
    if (match) {
      actualServerPort = parseInt(match[1], 10);
      LOG(`Captured server port: ${actualServerPort}`);
    }
  });
  
  // 等待端口就绪
  await waitForPort();
}

// 新增 IPC handler 供 preload 获取端口
ipcMain.on('get-server-port-sync', (event) => {
  event.returnValue = actualServerPort;
});

ipcMain.handle('get-server-port', () => actualServerPort);
```

---

### 3. Preload：暴露端口信息

#### 3.1 修改 `electron-preload.js`

```javascript
// 同步获取实际端口
let serverPort = 4000;
try {
  serverPort = ipcRenderer.sendSync('get-server-port-sync');
} catch (e) {
  console.warn('[Preload] Failed to get server port, using default');
}

const API_BASE = `http://127.0.0.1:${serverPort}`;

contextBridge.exposeInMainWorld('__electron', {
  // ...现有属性...
  API_BASE,
  SERVER_PORT: serverPort,
  
  // 新增方法：获取最新端口
  getServerPort: () => ipcRenderer.invoke('get-server-port'),
});
```

---

### 4. Client 前端：展示端口信息

#### 4.1 在设置页面展示端口

在 `client/src/components/SettingsModal.jsx` 或类似组件中：

```jsx
function ServerInfo() {
  const port = window.__electron?.SERVER_PORT || 4000;
  const apiBase = window.__electron?.API_BASE || 'http://127.0.0.1:4000';
  
  return (
    <div className="server-info">
      <p>服务端口: <code>{port}</code></p>
      <p>API 地址: <code>{apiBase}</code></p>
      <p className="hint">Mobile/Watch 端连接时请使用此端口</p>
    </div>
  );
}
```

---

### 5. Mobile 端：自动端口发现

#### 5.1 新增 `mobile/src/utils/portDiscovery.js`

```javascript
const PORT_SCAN_RANGE = [4000, 4001, 4002, 4003, 4004, 4005, 4010, 4020, 4100];
const DISCOVERY_TIMEOUT = 2000;

/**
 * 通过 IP 地址自动发现 FilmGallery 服务端口
 * @param {string} ip - 服务器 IP 地址
 * @returns {Promise<{port: number, fullUrl: string} | null>}
 */
export async function discoverPort(ip) {
  const cleanIp = ip.replace(/^https?:\/\//, '').replace(/:\d+$/, '').replace(/\/$/, '');
  
  // 并行扫描所有候选端口
  const promises = PORT_SCAN_RANGE.map(async (port) => {
    try {
      const url = `http://${cleanIp}:${port}/api/discover`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), DISCOVERY_TIMEOUT);
      
      const response = await fetch(url, { 
        signal: controller.signal,
        headers: { 'Accept': 'application/json' }
      });
      clearTimeout(timeoutId);
      
      if (response.ok) {
        const data = await response.json();
        if (data.app === 'FilmGallery') {
          return { port: data.port || port, fullUrl: `http://${cleanIp}:${data.port || port}` };
        }
      }
    } catch (e) {
      // 端口不可达，静默忽略
    }
    return null;
  });
  
  const results = await Promise.all(promises);
  return results.find(r => r !== null) || null;
}

/**
 * 验证完整 URL 是否是 FilmGallery 服务
 */
export async function validateServer(url) {
  try {
    const cleanUrl = url.replace(/\/$/, '');
    const response = await fetch(`${cleanUrl}/api/discover`, { timeout: DISCOVERY_TIMEOUT });
    if (response.ok) {
      const data = await response.json();
      return data.app === 'FilmGallery';
    }
  } catch (e) {}
  return false;
}
```

#### 5.2 修改 `mobile/src/screens/SettingsScreen.js`

```javascript
import { discoverPort } from '../utils/portDiscovery';

// 在组件中
const [ip, setIp] = useState(''); // 只需输入 IP
const [discovering, setDiscovering] = useState(false);
const [discoveredUrl, setDiscoveredUrl] = useState('');

const handleDiscover = async () => {
  if (!ip.trim()) {
    Alert.alert('请输入服务器 IP 地址');
    return;
  }
  
  setDiscovering(true);
  try {
    const result = await discoverPort(ip);
    if (result) {
      setDiscoveredUrl(result.fullUrl);
      setUrl(result.fullUrl);
      Alert.alert('发现服务', `已找到 FilmGallery 服务: ${result.fullUrl}`);
    } else {
      Alert.alert('未找到服务', '在常用端口上未发现 FilmGallery 服务，请检查 IP 地址或手动输入完整 URL');
    }
  } finally {
    setDiscovering(false);
  }
};

// UI 部分
<TextInput
  label="服务器 IP"
  value={ip}
  onChangeText={setIp}
  placeholder="192.168.1.100"
  keyboardType="numeric"
/>
<Button onPress={handleDiscover} loading={discovering}>
  自动发现端口
</Button>
{discoveredUrl && <Text>发现的服务地址: {discoveredUrl}</Text>}
```

---

### 6. Watch 端：自动端口发现

#### 6.1 新增 `watch-app/src/utils/portDiscovery.ts`

```typescript
const PORT_SCAN_RANGE = [4000, 4001, 4002, 4003, 4004, 4005, 4010, 4020, 4100];
const DISCOVERY_TIMEOUT = 2000;

interface DiscoveryResult {
  port: number;
  fullUrl: string;
}

export async function discoverPort(ip: string): Promise<DiscoveryResult | null> {
  const cleanIp = ip.replace(/^https?:\/\//, '').replace(/:\d+$/, '').replace(/\/$/, '');
  
  const promises = PORT_SCAN_RANGE.map(async (port): Promise<DiscoveryResult | null> => {
    try {
      const url = `http://${cleanIp}:${port}/api/discover`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), DISCOVERY_TIMEOUT);
      
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      
      if (response.ok) {
        const data = await response.json();
        if (data.app === 'FilmGallery') {
          return { port: data.port || port, fullUrl: `http://${cleanIp}:${data.port || port}` };
        }
      }
    } catch (e) {}
    return null;
  });
  
  const results = await Promise.all(promises);
  return results.find(r => r !== null) || null;
}
```

#### 6.2 修改 `watch-app/src/screens/SettingsScreen.tsx`

类似 Mobile 端的修改，添加 IP 输入和自动发现按钮。

---

### 7. 共享常量模块

#### 7.1 新增 `packages/shared/portDiscovery.js`

```javascript
// 共享的端口发现配置，供 mobile/watch/client 复用
module.exports = {
  APP_IDENTIFIER: 'FilmGallery',
  DISCOVERY_ENDPOINT: '/api/discover',
  DEFAULT_PORT: 4000,
  PORT_SCAN_RANGE: [4000, 4001, 4002, 4003, 4004, 4005, 4010, 4020, 4100],
  DISCOVERY_TIMEOUT: 2000
};
```

---

## 兼容性考虑

| 场景 | 行为 |
|------|------|
| 开发模式 (`npm run dev`) | 固定端口 4000 |
| 生产模式 (Electron 打包) | 动态端口，通过 stdout 传递 |
| Mobile/Watch 旧版本 | 仍可手动输入完整 URL (含端口) |
| Mobile/Watch 新版本 | 只需输入 IP，自动发现端口 |
| 端口 4000 被占用 | 自动使用其他可用端口 |

---

## 测试清单

- [ ] 开发模式启动，确认使用端口 4000
- [ ] 生产模式启动（端口 4000 空闲），确认正常工作
- [ ] 生产模式启动（端口 4000 被占用），确认使用其他端口
- [ ] 前端设置页面正确显示当前端口
- [ ] Mobile 端仅输入 IP 可自动发现服务
- [ ] Watch 端仅输入 IP 可自动发现服务
- [ ] `/api/discover` 返回正确的应用标识和端口

---

## 已完成文件变更清单 (2026-01-18)

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `server/server.js` | ✅ 修改 | 动态端口监听 + `/api/discover` API |
| `server/constants/app-info.js` | ✅ 新增 | 应用标识常量 |
| `electron-main.js` | ✅ 修改 | 捕获动态端口 + IPC handlers |
| `electron-preload.js` | ✅ 修改 | 暴露 `SERVER_PORT` 和动态 `API_BASE` |
| `client/src/components/Settings.jsx` | ✅ 修改 | 展示服务器端口信息卡片 |
| `client/src/components/ConflictBanner.jsx` | ✅ 修改 | 使用动态 API_BASE |
| `packages/shared/portDiscovery.js` | ✅ 新增 | 共享端口发现配置常量 |
| `mobile/src/utils/portDiscovery.js` | ✅ 新增 | 端口发现工具函数 |
| `mobile/src/screens/SettingsScreen.js` | ✅ 修改 | IP 输入 + 自动发现按钮 |
| `watch-app/src/utils/portDiscovery.ts` | ✅ 新增 | 端口发现工具函数 (TypeScript) |
| `watch-app/src/screens/SettingsScreen.tsx` | ✅ 修改 | IP 输入 + 自动发现按钮 |
