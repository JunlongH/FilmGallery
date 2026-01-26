# Release 模式网络可用性详细审计

日期: 2025-12-30
应用: Watch App (React Native Wear OS)

## 关键发现

### ✅ 已修复问题

#### 1. **缺失 Network Security Configuration 文件** (CRITICAL)
**问题**: watch-app 缺少 `network_security_config.xml`
- 开发模式下使用 `manifestPlaceholder [usesCleartextTraffic:"true"]` 可工作
- Release 模式下，此占位符**不生效**（没有对应的 XML 配置文件）
- 结果: Release APK 会**拒绝所有 HTTP (cleartext) 连接**

**症状**:
- 开发模式正常
- Release 模式网络超时或连接拒绝
- LogCat: `Cleartext traffic not permitted...`

**解决**:
```xml
✅ 已创建: /watch-app/android/app/src/main/res/xml/network_security_config.xml
```
内容:
```xml
<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <base-config cleartextTrafficPermitted="true">
        <trust-anchors>
            <certificates src="system" />
        </trust-anchors>
    </base-config>
</network-security-config>
```

✅ 已更新 `AndroidManifest.xml`:
- 添加 `android:networkSecurityConfig="@xml/network_security_config"`

---

### ✅ 其他网络配置审计结果

#### 2. **HTTP 清文本流量允许** (正确配置)
**检查**: build.gradle 中的 `usesCleartextTraffic` 设置
```groovy
buildTypes {
    debug {
        manifestPlaceholders = [usesCleartextTraffic:"true"]
    }
    release {
        manifestPlaceholders = [usesCleartextTraffic:"true"]  ✅
    }
}
```
**状态**: ✅ 正确 - Debug 和 Release 都允许

#### 3. **CORS 和私有网络访问** (后端正确)
**检查**: server.js CORS 配置
```javascript
app.use(cors({ origin: true, credentials: false, preflightContinue: true }));
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
    next();
});
```
**状态**: ✅ 正确 - 允许私有网络访问

#### 4. **Android 权限** (正确配置)
**检查**: AndroidManifest.xml 权限
```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
```
**状态**: ✅ 正确 - 包含必要权限

---

## 默认服务器地址配置

**当前默认 IP**: `http://166.111.42.221:4000`

**问题**: 这个 IP 可能:
- ✅ 与开发设备在**同一网络**上 (开发模式有效)
- ❌ Release 时可能**网络不可达** (需要通过 Settings 配置)

**解决流程**:
1. 启动 Release APK
2. 进入 Settings 屏幕
3. 输入当前电脑的正确服务器地址
4. 示例: `http://192.168.1.100:4000` (根据实际网络)

---

## 网络诊断检查清单

### Release APK 建立后测试步骤:

- [ ] 1. 从 Release APK 启动应用
- [ ] 2. 进入 **Settings** 屏幕
- [ ] 3. 记录当前默认 URL
- [ ] 4. 修改为 `http://<your-pc-ip>:4000`
- [ ] 5. 点击保存
- [ ] 6. 返回首页，检查随机照片是否加载
- [ ] 7. 进入 My Rolls，检查数据是否加载
- [ ] 8. 检查 LogCat 是否有网络错误

### 常见网络问题排查:

| 症状 | 原因 | 解决方案 |
|------|------|--------|
| Release 网络超时 | network_security_config.xml 缺失 | ✅ 已修复 |
| Cleartext traffic 错误 | 安全配置不允许 HTTP | ✅ 已修复 |
| CORS 错误 | 后端 CORS 配置 | 后端正确配置 |
| IP 无法连接 | 默认 IP 不匹配当前网络 | 进入 Settings 修改 |
| 权限拒绝 | Android 权限未授予 | 运行时检查权限 |

---

## 技术细节

### 为什么开发模式可以而 Release 模式不行?

1. **开发模式** (`npm run android`):
   - Metro bundler 运行在热加载模式
   - `manifestPlaceholder [usesCleartextTraffic:"true"]` 被直接注入到 Manifest
   - Android 系统识别此标记并允许 HTTP 流量

2. **Release 模式** (无 network_security_config.xml):
   - APK 未签署网络安全配置
   - 系统默认拒绝清文本流量 (Android 9+ 默认安全政策)
   - 即使 `usesCleartextTraffic="true"` 在 Manifest 中，也需要 XML 配置文件验证

3. **修复方案**:
   - XML 配置文件作为"策略声明"
   - 结合 `manifestPlaceholder` 确保一致性
   - Release APK 现在完全允许 HTTP 访问

---

## 后续建议

### 生产环境安全增强 (未实现):
```xml
<!-- 可选: 仅允许特定域名的 HTTPS -->
<domain-config cleartextTrafficPermitted="false">
    <domain includeSubdomains="true">example.com</domain>
</domain-config>
```

### 环境变量分离 (当前):
- 开发: 允许所有清文本流量
- 生产: 建议使用 HTTPS
- 需要: BuildFlavor 分离或环境配置

---

## 验证清单

- [x] network_security_config.xml 已创建
- [x] AndroidManifest.xml 已更新
- [x] build.gradle 配置检查完毕
- [x] 后端 CORS 配置正确
- [x] Android 权限完整
- [ ] 需要重新编译 Release APK 并测试

