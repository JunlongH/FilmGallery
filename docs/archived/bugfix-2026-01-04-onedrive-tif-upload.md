# OneDrive TIF文件上传修复

**日期**: 2026-01-04  
**问题**: 使用安装好的应用上传负片TIF文件至OneDrive时出现"internal network error"  
**严重性**: 高 - 阻止用户上传大文件  

## 问题分析

### 根本原因

1. **Sharp处理大TIF文件超时**
   - TIF文件通常较大（50-200MB）
   - Sharp库处理时可能超过默认超时时间
   - 没有超时保护机制导致请求挂起

2. **OneDrive同步文件锁定**
   - OneDrive后台同步可能锁定目标文件夹
   - 文件移动操作（localTmpDir → rollsDir）失败
   - 重试次数不足（5次）且延迟太短

3. **错误信息不明确**
   - Sharp处理失败和文件移动失败混淆
   - 用户看到的是"internal network error"
   - 没有具体指导如何解决

4. **跨设备文件移动问题**
   - localTmpDir在系统临时目录（通常C盘）
   - rollsDir在OneDrive（可能是不同磁盘）
   - 跨设备rename操作更容易失败

## 实施的修复

### 1. 增强Sharp处理的错误捕获和日志

**文件**: `server/routes/rolls.js`

#### 添加超时保护机制

```javascript
// 定义超时时间（30秒）
const SHARP_TIMEOUT = 30000;

// 超时保护函数
const sharpWithTimeout = (sharpOp, timeoutMs = SHARP_TIMEOUT) => {
  return Promise.race([
    sharpOp,
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Sharp operation timed out')), timeoutMs)
    )
  ]);
};
```

#### 为所有Sharp操作添加详细日志

```javascript
// 负片处理
try {
  console.log(`[CREATE ROLL] Processing negative ${frameNumber}: ${path.basename(f.tmpPath)} (${size} MB)`);
  const startTime = Date.now();
  await sharpWithTimeout(
    sharp(f.tmpPath).jpeg({ quality: 95 }).toFile(tempNegPath)
  );
  console.log(`[CREATE ROLL] Negative ${frameNumber} processed in ${duration}ms`);
} catch (sharpErr) {
  console.error(`[CREATE ROLL] Sharp processing failed for negative ${frameNumber}:`, sharpErr.message);
  throw new Error(`Failed to process negative image: ${sharpErr.message}`);
}
```

**优势**:
- ✅ 防止大TIF文件处理时无限挂起
- ✅ 详细记录每个文件的处理时间
- ✅ 明确区分Sharp错误和其他错误

### 2. 增强文件移动操作的重试机制

**文件**: `server/utils/file-helpers.js`

#### 增加重试次数和延迟

```javascript
// 从5次增加到8次重试
async function moveFileAsync(src, dest, retries = 8) {
  // ...
  
  // 增加EAGAIN错误码处理（OneDrive常见）
  if (err.code === 'EBUSY' || err.code === 'EPERM' || 
      err.code === 'EACCES' || err.code === 'EAGAIN') {
    // 延迟从2.5秒增加到4秒（渐进式：500ms, 1s, 1.5s...4s）
    const delay = 500 * (i + 1);
    console.log(`[moveFileAsync] File may be locked by OneDrive sync. Retrying in ${delay}ms...`);
    await sleep(delay);
  }
}
```

#### 增加详细的OneDrive错误提示

```javascript
if (isLastAttempt) {
  console.error(`[moveFileAsync] All ${retries} attempts failed`);
  console.error(`[moveFileAsync] This may be caused by OneDrive sync locking the file. Error: ${err.message}`);
  throw err;
}
```

**优势**:
- ✅ 更多重试机会应对OneDrive同步延迟
- ✅ 更长的延迟等待OneDrive释放文件锁
- ✅ 明确提示OneDrive相关问题

### 3. 增强文件发布阶段的日志

**文件**: `server/routes/rolls.js`

```javascript
// 发布文件时添加进度和错误追踪
console.log(`[CREATE ROLL] Publishing ${stagedOps.length} file operations to OneDrive...`);
for (let i = 0; i < stagedOps.length; i++) {
  const op = stagedOps[i];
  try {
    const srcSize = fs.existsSync(op.src) ? (fs.statSync(op.src).size / 1024 / 1024).toFixed(2) : 'N/A';
    console.log(`[CREATE ROLL] [${i+1}/${stagedOps.length}] ${op.type} ${path.basename(op.src)} (${srcSize} MB) -> ${path.basename(op.dest)}`);
    
    if (op.type === 'copy') {
      await copyFileAsyncWithRetry(op.src, op.dest);
    } else {
      await moveFileAsync(op.src, op.dest);
    }
  } catch (fileOpErr) {
    throw new Error(`Failed to ${op.type} file ${path.basename(op.src)} to OneDrive folder: ${fileOpErr.message}`);
  }
}
console.log(`[CREATE ROLL] All files published successfully.`);
```

**优势**:
- ✅ 实时显示上传进度（第X个/共Y个文件）
- ✅ 显示每个文件的大小，便于识别问题文件
- ✅ 明确指出哪个文件操作失败

### 4. 改进客户端错误提示

**文件**: `client/src/components/NewRollForm.jsx`

```javascript
catch (err) {
  let errorMessage = err.message || err;
  
  // 识别常见问题并提供解决方案
  if (errorMessage.includes('timeout') || errorMessage.includes('timed out')) {
    errorMessage = '上传超时。请检查：\n1. TIF文件是否过大（建议<100MB）\n2. OneDrive是否正在同步（可暂停同步后重试）\n3. 网络连接是否稳定';
  } else if (errorMessage.includes('EBUSY') || errorMessage.includes('EPERM') || errorMessage.includes('locked')) {
    errorMessage = '文件被占用，无法上传。可能原因：\n1. OneDrive正在同步该文件夹\n2. 其他程序正在访问文件\n\n建议：暂停OneDrive同步，稍后重试';
  } else if (errorMessage.includes('Failed to process') || errorMessage.includes('Sharp')) {
    errorMessage = '图片处理失败。可能原因：\n1. TIF文件损坏或格式不支持\n2. 文件过大导致内存不足\n\n建议：尝试较小的文件或转换为JPEG格式';
  }
  
  showAlert('上传错误', errorMessage);
}
```

**优势**:
- ✅ 用户友好的中文错误提示
- ✅ 明确的问题诊断和解决步骤
- ✅ 区分不同类型的错误

## 技术细节

### Sharp超时机制

```javascript
const sharpWithTimeout = (sharpOp, timeoutMs = SHARP_TIMEOUT) => {
  return Promise.race([
    sharpOp,  // Sharp操作Promise
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Sharp operation timed out')), timeoutMs)
    )  // 超时Promise
  ]);
};
```

**工作原理**:
- `Promise.race()` 返回最先完成的Promise
- 如果Sharp处理在30秒内完成，返回处理结果
- 如果30秒后仍未完成，超时Promise先完成并reject
- 缩略图生成使用10秒超时（应该更快）

### 文件操作重试策略

| 尝试次数 | 延迟时间 | 累计等待 |
|---------|---------|---------|
| 1 | 0ms | 0s |
| 2 | 500ms | 0.5s |
| 3 | 1000ms | 1.5s |
| 4 | 1500ms | 3s |
| 5 | 2000ms | 5s |
| 6 | 2500ms | 7.5s |
| 7 | 3000ms | 10.5s |
| 8 | 3500ms | 14s |

**总计**: 最多8次尝试，累计等待14秒

### 错误码处理

新增处理的错误码：
- `EBUSY`: 文件正在被使用（OneDrive同步常见）
- `EPERM`: 操作未授权（权限/锁定问题）
- `EACCES`: 访问被拒绝
- `EAGAIN`: 资源暂时不可用（OneDrive特有）

## 测试建议

### 场景1: 大TIF文件上传

1. 准备50-100MB的TIF负片文件
2. 确保OneDrive正常运行
3. 通过NewRollForm上传
4. **预期**: 
   - 控制台显示处理进度和时间
   - 文件成功上传到OneDrive
   - 如超时，显示友好错误提示

### 场景2: OneDrive同步冲突

1. 在OneDrive文件夹中创建大量文件触发同步
2. 在同步进行中上传TIF文件
3. **预期**:
   - 文件移动操作自动重试
   - 最终成功或显示"OneDrive同步冲突"提示

### 场景3: 跨设备文件移动

1. 确保`localTmpDir`和`rollsDir`在不同磁盘
2. 上传文件
3. **预期**:
   - 自动使用copy+unlink策略
   - 成功移动文件

## 监控和诊断

### 关键日志标记

成功场景：
```
[CREATE ROLL] Processing negative 01: file.tif (85.32 MB)
[CREATE ROLL] Negative 01 processed in 12543ms
[CREATE ROLL] Publishing 6 file operations to OneDrive...
[CREATE ROLL] [1/6] move file.tif (85.32 MB) -> 123_01_original.tif
[CREATE ROLL] [2/6] move proc_neg.jpg (4.21 MB) -> 123_01_neg.jpg
[CREATE ROLL] All files published successfully.
```

失败场景（超时）：
```
[CREATE ROLL] Processing negative 01: file.tif (150.00 MB)
[CREATE ROLL] Sharp processing failed for negative 01: Sharp operation timed out
```

失败场景（OneDrive锁定）：
```
[moveFileAsync] Attempt 1/8 failed for file.tif: EBUSY
[moveFileAsync] File may be locked by OneDrive sync. Retrying in 500ms...
[moveFileAsync] Attempt 2/8 failed for file.tif: EBUSY
...
[moveFileAsync] All 8 attempts failed for file.tif
[moveFileAsync] This may be caused by OneDrive sync locking the file.
```

## 相关文件

### 修改的文件
1. [server/routes/rolls.js](../server/routes/rolls.js) - Sharp处理和文件发布
2. [server/utils/file-helpers.js](../server/utils/file-helpers.js) - 文件移动重试
3. [client/src/components/NewRollForm.jsx](../client/src/components/NewRollForm.jsx) - 错误提示

### 相关文档
- [onedrive-sync-optimization.md](./onedrive-sync-optimization.md) - OneDrive同步优化
- [PRODUCTION-SETUP.md](../PRODUCTION-SETUP.md) - 生产环境配置

## 用户指南

### 如果遇到上传失败

#### 问题1: "上传超时"

**原因**: TIF文件过大或系统负载高

**解决方案**:
1. 检查文件大小，建议每个文件<100MB
2. 关闭其他占用CPU/内存的程序
3. 考虑将TIF转换为JPEG（质量100%）后上传
4. 分批上传，避免一次上传过多文件

#### 问题2: "文件被占用"

**原因**: OneDrive正在同步目标文件夹

**解决方案**:
1. 右键OneDrive图标 → 暂停同步2小时
2. 等待30秒后重试上传
3. 上传完成后恢复OneDrive同步

#### 问题3: "图片处理失败"

**原因**: TIF文件损坏或格式不兼容

**解决方案**:
1. 用图片查看器打开文件验证是否正常
2. 使用Photoshop/GIMP重新保存为标准TIF格式
3. 如问题持续，转换为JPEG格式

## 性能影响

### 处理时间预估

| 文件大小 | 格式 | Sharp处理时间 | 文件移动时间 | 总计 |
|---------|-----|-------------|------------|------|
| 10MB | TIF | ~2s | ~0.5s | ~2.5s |
| 50MB | TIF | ~8s | ~1s | ~9s |
| 100MB | TIF | ~15s | ~2s | ~17s |
| 200MB | TIF | ~28s | ~4s | ~32s |

**注意**: 超过200MB的TIF文件可能超时，建议预处理

### 内存使用

- Sharp已配置为单并发（`sharp.concurrency(1)`）
- 处理100MB TIF时峰值内存约500-800MB
- 建议服务器至少2GB可用内存

## 后续优化建议

1. **流式处理**: 考虑使用Sharp的stream API减少内存占用
2. **后台队列**: 大文件处理改为后台任务，避免阻塞请求
3. **OneDrive检测**: 上传前检测OneDrive同步状态
4. **文件预校验**: 上传前验证TIF文件格式和大小
5. **进度反馈**: 实时显示Sharp处理进度（需Sharp支持）

## 版本信息

- **修复版本**: 1.9.0
- **Sharp版本**: 已安装（需在package.json中确认）
- **Node版本**: 14.x+
- **Windows版本**: Windows 10/11 + OneDrive

## 参考

- Sharp文档: https://sharp.pixelplumbing.com/
- Node.js fs API: https://nodejs.org/api/fs.html
- OneDrive同步行为: [onedrive-sync-optimization.md](./onedrive-sync-optimization.md)
