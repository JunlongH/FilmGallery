/**
 * useThrottle - 节流 Hook
 * 
 * 限制函数调用频率，适用于滚动、拖拽等高频事件
 * 
 * @version 1.0.0
 * @date 2026-01-31
 */

import { useRef, useCallback, useEffect } from 'react';

/**
 * 节流函数 Hook
 * @param {Function} callback - 要节流的回调函数
 * @param {number} delay - 节流间隔(ms)
 * @returns {Function} 节流后的函数
 * 
 * @example
 * const throttledScroll = useThrottle((e) => {
 *   console.log('Scroll position:', e.target.scrollTop);
 * }, 100);
 * 
 * <div onScroll={throttledScroll}>...</div>
 */
export function useThrottle(callback, delay = 500) {
  const lastRun = useRef(Date.now());
  const timeoutRef = useRef(null);
  const callbackRef = useRef(callback);

  // 更新回调引用
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  // 清理定时器
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return useCallback((...args) => {
    const now = Date.now();
    const remaining = delay - (now - lastRun.current);

    if (remaining <= 0) {
      // 立即执行
      lastRun.current = now;
      callbackRef.current(...args);
    } else {
      // 延迟执行（确保最后一次调用被处理）
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        lastRun.current = Date.now();
        callbackRef.current(...args);
      }, remaining);
    }
  }, [delay]);
}

export default useThrottle;
