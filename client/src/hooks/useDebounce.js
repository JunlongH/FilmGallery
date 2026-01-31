/**
 * useDebounce - 防抖 Hook
 * 
 * 延迟更新值，适用于搜索输入等场景
 * 
 * @version 1.0.0
 * @date 2026-01-31
 */

import { useState, useEffect } from 'react';

/**
 * 防抖值 Hook
 * @param {any} value - 要防抖的值
 * @param {number} delay - 延迟时间(ms)
 * @returns {any} 防抖后的值
 * 
 * @example
 * const [searchTerm, setSearchTerm] = useState('');
 * const debouncedSearch = useDebounce(searchTerm, 300);
 * 
 * useEffect(() => {
 *   // debouncedSearch 变化时执行搜索
 *   performSearch(debouncedSearch);
 * }, [debouncedSearch]);
 */
export function useDebounce(value, delay = 500) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);

  return debouncedValue;
}

export default useDebounce;
