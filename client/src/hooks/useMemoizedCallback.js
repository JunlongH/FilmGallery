/**
 * useMemoizedCallback - 记忆化回调 Hook
 * 
 * 结合 useCallback 和深度比较的优化版本
 * 避免因依赖项引用变化导致的不必要重渲染
 * 
 * @version 1.0.0
 * @date 2026-01-31
 */

import { useRef, useCallback } from 'react';

/**
 * 深度比较两个值
 * @param {any} a
 * @param {any} b
 * @returns {boolean}
 */
function deepEqual(a, b) {
  if (a === b) return true;
  
  if (typeof a !== typeof b) return false;
  
  if (a === null || b === null) return a === b;
  
  if (typeof a !== 'object') return a === b;
  
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    return a.every((item, index) => deepEqual(item, b[index]));
  }
  
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  
  if (keysA.length !== keysB.length) return false;
  
  return keysA.every(key => deepEqual(a[key], b[key]));
}

/**
 * 使用深度比较的记忆化回调
 * @param {Function} callback - 回调函数
 * @param {Array} dependencies - 依赖项数组
 * @returns {Function} 稳定的回调函数引用
 * 
 * @example
 * // 即使 filters 对象引用变化，只要内容相同就不会重新创建回调
 * const handleSearch = useMemoizedCallback((query) => {
 *   search(query, filters);
 * }, [filters]);
 */
export function useMemoizedCallback(callback, dependencies) {
  const callbackRef = useRef(callback);
  const depsRef = useRef(dependencies);

  // 只有依赖项真正变化时才更新
  if (!deepEqual(depsRef.current, dependencies)) {
    depsRef.current = dependencies;
    callbackRef.current = callback;
  }

  return useCallback((...args) => {
    return callbackRef.current(...args);
  }, []);
}

export default useMemoizedCallback;
