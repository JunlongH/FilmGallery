/**
 * 库模块统一导出
 * 
 * @version 1.0.0
 */

export { 
  queryClient, 
  cacheUtils, 
  CACHE_STRATEGIES,
  DATA_CACHE_MAP,
  getCacheStrategy,
  isElectron,
  isDevelopment
} from './queryClient';

export {
  prefetchManager,
  prefetchOverviewData,
  prefetchRollDetailData,
  prefetchCommonData
} from './dataPrefetch';
