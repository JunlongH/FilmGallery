/**
 * Services Index - 服务模块统一导出
 * 
 * 混合模式架构的核心服务：
 * - ComputeService: 计算任务智能路由
 * - FileAccessService: 文件访问抽象
 */

export { default as ComputeService } from './ComputeService';
export { default as FileAccessService } from './FileAccessService';

// 便捷导出常用函数
export { 
  getServerCapabilities, 
  isComputeAvailable,
  isHybridMode,
  smartFilmlabPreview,
  smartRenderPositive,
  clearCapabilityCache 
} from './ComputeService';

export {
  getFileUrl,
  hasLocalFileAccess,
  getFileAsArrayBuffer,
  getFileAsBlob,
  getFileAsDataUrl,
  getFileAsImage,
  prefetchFile,
  prefetchFiles,
  clearFileCache
} from './FileAccessService';
