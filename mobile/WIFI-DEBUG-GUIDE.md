# WiFi 远程调试指南

本指南说明如何在局域网中使用 WiFi 进行 React Native/Expo 应用调试。

## 前提条件

1. 电脑和手机需要在**同一个 WiFi 网络**中
2. 确保防火墙允许以下端口：
   - **8081** (Metro bundler)
   - **19000, 19001, 19002** (Expo)
   - **4000** (服务器 API)

## 方法 1: Expo Go 调试 (开发构建)

### 步骤 1: 启动服务器
```powershell
cd server
npm run dev
# 或指定监听所有网卡
set HOST=0.0.0.0 && npm run dev
```

### 步骤 2: 获取电脑的局域网 IP
```powershell
ipconfig
# 查找 IPv4 地址，例如 192.168.1.100
```

### 步骤 3: 启动 Expo
```powershell
cd mobile
npx expo start --host lan
```

这会显示一个二维码，用手机上的 Expo Go 扫描即可连接。

### 步骤 4: 配置 API 地址
在手机 App 的设置界面中，将服务器地址设置为：
```
http://192.168.1.100:4000
```
（替换为你电脑的实际 IP）

## 方法 2: ADB 无线调试 (Development Build)

适用于已安装自定义开发构建的设备。

### 步骤 1: 启用 ADB 无线调试
1. 在手机上启用开发者选项
2. 进入 **无线调试** 并启用
3. 点击 **使用配对码配对设备**
4. 在电脑上运行：
```powershell
adb pair 192.168.1.xxx:xxxxx
# 输入配对码
```

### 步骤 2: 连接设备
```powershell
adb connect 192.168.1.xxx:5555
```

### 步骤 3: 启动应用
```powershell
cd mobile
npx expo start --dev-client
```

## 方法 3: 隧道模式 (适用于复杂网络)

如果局域网有问题，可以使用 Expo 隧道：

```powershell
cd mobile
npx expo start --tunnel
```

这会通过 Expo 的服务器中转，但可能较慢。

## 常见问题

### 手机无法连接到 Metro Bundler
1. 检查防火墙设置
2. 确保手机和电脑在同一网段
3. 尝试关闭 VPN

### API 请求失败
1. 确保服务器监听 0.0.0.0 而不是 127.0.0.1
2. 检查 Windows 防火墙入站规则

### 热更新不工作
1. 摇晃手机打开 Dev Menu
2. 选择 "Reload"
3. 或在终端按 `r` 键

## 推荐配置

在 `mobile/package.json` 中添加便捷脚本：

```json
{
  "scripts": {
    "wifi": "expo start --host lan",
    "wifi:clear": "expo start --host lan --clear"
  }
}
```

然后可以使用 `npm run wifi` 快速启动局域网调试。

## Windows 防火墙设置

如果遇到连接问题，添加防火墙规则：

```powershell
# 以管理员身份运行
netsh advfirewall firewall add rule name="Metro Bundler" dir=in action=allow protocol=TCP localport=8081
netsh advfirewall firewall add rule name="Expo" dir=in action=allow protocol=TCP localport=19000-19002
netsh advfirewall firewall add rule name="FilmGallery API" dir=in action=allow protocol=TCP localport=4000
```
