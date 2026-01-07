# API_BASE 使用规范 - Quick Reference

## 问题快速诊断

### 症状
- 远程连接时首页随机照片不显示
- Statistics 页面无数据
- 网络请求发送到 localhost 而不是配置的远程服务器

### 原因
组件直接使用 `process.env.REACT_APP_API_BASE`（构建时常量）而不是运行时配置的 `API_BASE`

## 正确用法

### ✅ 正确的方式
```javascript
// 从 api.js 导入 API_BASE
import { API_BASE } from '../api';

// 直接使用
fetch(`${API_BASE}/api/endpoint`);
```

### ❌ 错误的方式
```javascript
// 不要直接使用环境变量
const API = process.env.REACT_APP_API_BASE || 'http://127.0.0.1:4000';
fetch(`${API}/api/endpoint`);
```

## API_BASE 数据流

```
用户在 Settings 配置
    ↓
electron-main.js 保存到 config.json
    ↓
electron-preload.js 启动时读取（同步）
    ↓
暴露为 window.__electron.API_BASE
    ↓
client/src/api.js 导出 API_BASE
    ↓
组件导入并使用
```

## 检查清单

### 新组件开发
- [ ] 从 `../api` 导入 `API_BASE`
- [ ] 不使用 `process.env.REACT_APP_API_BASE`
- [ ] 使用 `buildUploadUrl()` 处理图片路径
- [ ] 测试本地和远程两种模式

### 代码审查
```bash
# 搜索潜在问题
grep -r "process.env.REACT_APP_API_BASE" client/src/components/
# 应该只在 api.js 中出现
```

### 浏览器调试
```javascript
// 在控制台检查当前配置
console.log('API_BASE:', window.__electron?.API_BASE);

// 检查 Network 标签
// 所有请求应该发往配置的服务器，不是 localhost
```

## 快速修复模板

### Before
```javascript
export default function MyComponent() {
  const API = process.env.REACT_APP_API_BASE || 'http://127.0.0.1:4000';
  
  const fetchData = async () => {
    const res = await fetch(`${API}/api/data`);
    return res.json();
  };
}
```

### After
```javascript
import { API_BASE } from '../api';

export default function MyComponent() {
  const fetchData = async () => {
    const res = await fetch(`${API_BASE}/api/data`);
    return res.json();
  };
}
```

## 已修复的组件

| 组件 | 文件路径 | 修复日期 |
|------|---------|---------|
| HeroRandomPhotos | `client/src/components/HeroRandomPhotos.jsx` | 2025-01-07 |
| Statistics | `client/src/components/Statistics.jsx` | 2025-01-07 |
| PhotoDetailsSidebar | `client/src/components/PhotoDetailsSidebar.jsx` | 2025-01-07 |
| PhotoCalendar | `client/src/components/PhotoCalendar.jsx` | 2025-01-07 |

## 相关文档

- [详细修复报告](./bugfix-2025-01-07-remote-api-base.md)
- [部署文档](../README-DEPLOY.md)
- [Settings 配置指南](../README-DEPLOY.md#client-configuration)
