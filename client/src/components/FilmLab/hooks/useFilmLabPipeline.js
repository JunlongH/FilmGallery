/**
 * FilmLab Pipeline Hook
 * 
 * 解决 WebGL 渲染管线中的非交换性依赖问题。
 * 例如：几何变换必须在颜色变换之前，色彩校正必须在反转之后。
 * 
 * 核心问题：
 * - 裁剪/旋转改变后，直方图需要重新计算
 * - 反转模式改变后，片基校正需要重新应用
 * - 参数改变需要按正确顺序触发渲染
 * 
 * @module useFilmLabPipeline
 * @since 2026-01-30
 */

import { useCallback, useRef, useMemo } from 'react';

// ============================================================================
// Pipeline Events
// ============================================================================

/**
 * 管线事件类型
 * 这些事件定义了渲染管线中不同阶段的依赖关系
 */
export const PipelineEvent = {
  // 源图像变更
  SOURCE_CHANGED: 'source_changed',
  
  // 几何变换变更（必须最先处理）
  GEOMETRY_CHANGED: 'geometry_changed',
  CROP_CHANGED: 'crop_changed',
  ROTATION_CHANGED: 'rotation_changed',
  
  // 反转相关变更（在颜色校正之前）
  INVERSION_CHANGED: 'inversion_changed',
  BASE_DENSITY_CHANGED: 'base_density_changed',
  
  // 颜色校正变更
  COLOR_CHANGED: 'color_changed',
  EXPOSURE_CHANGED: 'exposure_changed',
  WHITE_BALANCE_CHANGED: 'white_balance_changed',
  CURVES_CHANGED: 'curves_changed',
  HSL_CHANGED: 'hsl_changed',
  
  // 后期效果变更
  SPLIT_TONE_CHANGED: 'split_tone_changed',
  FILM_CURVE_CHANGED: 'film_curve_changed',
  LUT_CHANGED: 'lut_changed',
  
  // 输出变更
  OUTPUT_CHANGED: 'output_changed',
};

/**
 * 管线阶段优先级（数字越小越先执行）
 * 确保渲染操作按正确顺序执行
 */
export const PipelinePriority = {
  SOURCE: 0,      // 源图像加载
  GEOMETRY: 10,   // 几何变换（裁剪、旋转）
  INVERSION: 20,  // 反转处理
  BASE: 30,       // 片基校正
  EXPOSURE: 40,   // 曝光/对比度
  WB: 50,         // 白平衡
  CURVES: 60,     // 曲线
  HSL: 70,        // 色相/饱和度/明度
  SPLIT: 80,      // 分离色调
  FILM: 90,       // 胶片曲线
  LUT: 100,       // LUT
  OUTPUT: 110,    // 输出
};

/**
 * 事件到优先级的映射
 */
const eventPriorityMap = {
  [PipelineEvent.SOURCE_CHANGED]: PipelinePriority.SOURCE,
  [PipelineEvent.GEOMETRY_CHANGED]: PipelinePriority.GEOMETRY,
  [PipelineEvent.CROP_CHANGED]: PipelinePriority.GEOMETRY,
  [PipelineEvent.ROTATION_CHANGED]: PipelinePriority.GEOMETRY,
  [PipelineEvent.INVERSION_CHANGED]: PipelinePriority.INVERSION,
  [PipelineEvent.BASE_DENSITY_CHANGED]: PipelinePriority.BASE,
  [PipelineEvent.COLOR_CHANGED]: PipelinePriority.EXPOSURE,
  [PipelineEvent.EXPOSURE_CHANGED]: PipelinePriority.EXPOSURE,
  [PipelineEvent.WHITE_BALANCE_CHANGED]: PipelinePriority.WB,
  [PipelineEvent.CURVES_CHANGED]: PipelinePriority.CURVES,
  [PipelineEvent.HSL_CHANGED]: PipelinePriority.HSL,
  [PipelineEvent.SPLIT_TONE_CHANGED]: PipelinePriority.SPLIT,
  [PipelineEvent.FILM_CURVE_CHANGED]: PipelinePriority.FILM,
  [PipelineEvent.LUT_CHANGED]: PipelinePriority.LUT,
  [PipelineEvent.OUTPUT_CHANGED]: PipelinePriority.OUTPUT,
};

/**
 * 事件依赖关系：当某事件发生时，需要触发哪些下游事件
 * 例如：几何变换后，需要重新计算直方图（直方图是颜色流程的一部分）
 */
const eventDependencies = {
  [PipelineEvent.SOURCE_CHANGED]: [
    PipelineEvent.GEOMETRY_CHANGED,
    PipelineEvent.COLOR_CHANGED,
  ],
  [PipelineEvent.GEOMETRY_CHANGED]: [
    PipelineEvent.COLOR_CHANGED,  // 几何变换影响颜色计算区域
  ],
  [PipelineEvent.CROP_CHANGED]: [
    PipelineEvent.GEOMETRY_CHANGED,
  ],
  [PipelineEvent.ROTATION_CHANGED]: [
    PipelineEvent.GEOMETRY_CHANGED,
  ],
  [PipelineEvent.INVERSION_CHANGED]: [
    PipelineEvent.BASE_DENSITY_CHANGED,  // 反转模式影响片基校正方式
    PipelineEvent.COLOR_CHANGED,
  ],
};

// ============================================================================
// Pipeline Hook
// ============================================================================

/**
 * 管线控制 Hook
 * 
 * 用于管理渲染管线中的事件依赖和执行顺序
 * 
 * @param {Object} options - 配置选项
 * @param {Function} options.onRender - 触发渲染的回调
 * @param {Function} options.onHistogramUpdate - 触发直方图更新的回调
 * @returns {Object} 管线控制函数
 */
export function useFilmLabPipeline(options = {}) {
  const { 
    onRender = () => {}, 
    onHistogramUpdate = () => {},
  } = options;

  // 事件监听器存储
  const listenersRef = useRef(new Map());
  
  // 待处理事件队列（用于批量处理）
  const pendingEventsRef = useRef(new Set());
  
  // 防抖定时器
  const flushTimerRef = useRef(null);

  /**
   * 注册事件监听器
   */
  const on = useCallback((event, callback) => {
    if (!listenersRef.current.has(event)) {
      listenersRef.current.set(event, new Set());
    }
    listenersRef.current.get(event).add(callback);
    
    // 返回取消订阅函数
    return () => {
      const listeners = listenersRef.current.get(event);
      if (listeners) {
        listeners.delete(callback);
      }
    };
  }, []);

  /**
   * 移除事件监听器
   */
  const off = useCallback((event, callback) => {
    const listeners = listenersRef.current.get(event);
    if (listeners) {
      listeners.delete(callback);
    }
  }, []);

  /**
   * 派发事件到所有监听器
   */
  const dispatchToListeners = useCallback((event, data) => {
    const listeners = listenersRef.current.get(event);
    if (listeners) {
      listeners.forEach(callback => {
        try {
          callback(data);
        } catch (err) {
          console.error(`Pipeline listener error for ${event}:`, err);
        }
      });
    }
  }, []);

  /**
   * 收集事件的所有依赖
   */
  const collectDependencies = useCallback((event, collected = new Set()) => {
    if (collected.has(event)) return collected;
    collected.add(event);
    
    const deps = eventDependencies[event] || [];
    deps.forEach(dep => {
      collectDependencies(dep, collected);
    });
    
    return collected;
  }, []);

  /**
   * 刷新待处理事件
   * 按优先级排序后依次执行
   */
  const flushEvents = useCallback(() => {
    if (pendingEventsRef.current.size === 0) return;
    
    // 获取所有待处理事件并按优先级排序
    const events = Array.from(pendingEventsRef.current);
    events.sort((a, b) => {
      const priorityA = eventPriorityMap[a.type] ?? 999;
      const priorityB = eventPriorityMap[b.type] ?? 999;
      return priorityA - priorityB;
    });
    
    // 清空待处理队列
    pendingEventsRef.current.clear();
    
    // 按顺序处理事件
    let needsRender = false;
    let needsHistogramUpdate = false;
    
    events.forEach(({ type, data }) => {
      // 派发到监听器
      dispatchToListeners(type, data);
      
      // 检查是否需要触发渲染
      if (type !== PipelineEvent.OUTPUT_CHANGED) {
        needsRender = true;
      }
      
      // 几何变换需要更新直方图
      if (
        type === PipelineEvent.GEOMETRY_CHANGED ||
        type === PipelineEvent.CROP_CHANGED ||
        type === PipelineEvent.SOURCE_CHANGED
      ) {
        needsHistogramUpdate = true;
      }
    });
    
    // 触发渲染
    if (needsRender) {
      onRender();
    }
    
    // 延迟更新直方图（等渲染完成后）
    if (needsHistogramUpdate) {
      requestAnimationFrame(() => {
        onHistogramUpdate();
      });
    }
  }, [dispatchToListeners, onRender, onHistogramUpdate]);

  /**
   * 发送事件（带防抖）
   * 
   * @param {string} eventType - 事件类型
   * @param {Object} data - 事件数据
   * @param {Object} options - 选项
   * @param {boolean} options.immediate - 是否立即执行
   * @param {boolean} options.cascade - 是否级联依赖事件
   */
  const emit = useCallback((eventType, data = {}, options = {}) => {
    const { immediate = false, cascade = true } = options;
    
    // 收集事件和依赖
    const events = cascade 
      ? collectDependencies(eventType)
      : new Set([eventType]);
    
    // 添加到待处理队列
    events.forEach(type => {
      pendingEventsRef.current.add({ type, data });
    });
    
    // 清除现有定时器
    if (flushTimerRef.current) {
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    
    // 立即执行或防抖
    if (immediate) {
      flushEvents();
    } else {
      // 16ms 防抖，约一帧时间
      flushTimerRef.current = setTimeout(flushEvents, 16);
    }
  }, [collectDependencies, flushEvents]);

  /**
   * 强制刷新所有待处理事件
   */
  const flush = useCallback(() => {
    if (flushTimerRef.current) {
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    flushEvents();
  }, [flushEvents]);

  /**
   * 便捷方法：几何变换
   */
  const emitGeometryChanged = useCallback((data) => {
    emit(PipelineEvent.GEOMETRY_CHANGED, data);
  }, [emit]);

  /**
   * 便捷方法：裁剪变换
   */
  const emitCropChanged = useCallback((cropRect) => {
    emit(PipelineEvent.CROP_CHANGED, { cropRect });
  }, [emit]);

  /**
   * 便捷方法：颜色变换
   */
  const emitColorChanged = useCallback((data) => {
    emit(PipelineEvent.COLOR_CHANGED, data);
  }, [emit]);

  /**
   * 便捷方法：反转变换
   */
  const emitInversionChanged = useCallback((data) => {
    emit(PipelineEvent.INVERSION_CHANGED, data);
  }, [emit]);

  /**
   * 便捷方法：源图像变换
   */
  const emitSourceChanged = useCallback((data) => {
    emit(PipelineEvent.SOURCE_CHANGED, data, { immediate: true });
  }, [emit]);

  // ============================================================================
  // Render Order Utilities
  // ============================================================================

  /**
   * 获取渲染参数的执行顺序
   * 用于确保 WebGL uniform 按正确顺序设置
   */
  const getRenderOrder = useMemo(() => {
    return [
      'geometry',    // 几何变换（UV映射）
      'inversion',   // 反转
      'baseDensity', // 片基密度校正
      'exposure',    // 曝光
      'contrast',    // 对比度
      'highlights',  // 高光
      'shadows',     // 阴影
      'whites',      // 白点
      'blacks',      // 黑点
      'temp',        // 色温
      'tint',        // 色调
      'curves',      // 曲线
      'hsl',         // HSL
      'splitTone',   // 分离色调
      'filmCurve',   // 胶片曲线
      'lut',         // LUT
    ];
  }, []);

  /**
   * 验证参数顺序是否正确
   * 开发调试用
   */
  const validateOrder = useCallback((operations) => {
    if (process.env.NODE_ENV !== 'development') return true;
    
    let lastPriority = -1;
    for (const op of operations) {
      const idx = getRenderOrder.indexOf(op);
      if (idx < lastPriority) {
        console.warn(`Pipeline order violation: ${op} should not come after index ${lastPriority}`);
        return false;
      }
      lastPriority = idx;
    }
    return true;
  }, [getRenderOrder]);

  return {
    // 事件管理
    on,
    off,
    emit,
    flush,
    
    // 便捷方法
    emitGeometryChanged,
    emitCropChanged,
    emitColorChanged,
    emitInversionChanged,
    emitSourceChanged,
    
    // 工具函数
    getRenderOrder,
    validateOrder,
    
    // 事件类型常量
    PipelineEvent,
    PipelinePriority,
  };
}

export default useFilmLabPipeline;
