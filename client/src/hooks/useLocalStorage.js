/**
 * useLocalStorage - 本地存储 Hook
 * 
 * 持久化状态到 localStorage
 * 支持 SSR 安全和自动序列化
 * 
 * @version 1.0.0
 * @date 2026-01-31
 */

import { useState, useEffect, useCallback } from 'react';

/**
 * 安全解析 JSON
 * @param {string} value
 * @param {any} fallback
 * @returns {any}
 */
function safeJsonParse(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

/**
 * 本地存储 Hook
 * @param {string} key - 存储键名
 * @param {any} initialValue - 初始值
 * @returns {[any, Function, Function]} [value, setValue, removeValue]
 * 
 * @example
 * const [theme, setTheme, removeTheme] = useLocalStorage('theme', 'light');
 * 
 * // 使用
 * setTheme('dark');
 * 
 * // 删除
 * removeTheme();
 */
export function useLocalStorage(key, initialValue) {
  // 获取初始值（SSR 安全）
  const getStoredValue = useCallback(() => {
    if (typeof window === 'undefined') {
      return initialValue;
    }
    
    try {
      const item = window.localStorage.getItem(key);
      return item ? safeJsonParse(item, initialValue) : initialValue;
    } catch (error) {
      console.warn(`[useLocalStorage] Error reading key "${key}":`, error);
      return initialValue;
    }
  }, [key, initialValue]);

  const [storedValue, setStoredValue] = useState(getStoredValue);

  // 设置值
  const setValue = useCallback((value) => {
    try {
      // 支持函数式更新
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      
      setStoredValue(valueToStore);
      
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(key, JSON.stringify(valueToStore));
        
        // 触发自定义事件，用于跨标签页同步
        window.dispatchEvent(new CustomEvent('local-storage-change', {
          detail: { key, value: valueToStore }
        }));
      }
    } catch (error) {
      console.warn(`[useLocalStorage] Error setting key "${key}":`, error);
    }
  }, [key, storedValue]);

  // 删除值
  const removeValue = useCallback(() => {
    try {
      setStoredValue(initialValue);
      
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(key);
      }
    } catch (error) {
      console.warn(`[useLocalStorage] Error removing key "${key}":`, error);
    }
  }, [key, initialValue]);

  // 监听其他标签页的变化
  useEffect(() => {
    const handleStorageChange = (e) => {
      if (e.key === key && e.newValue !== null) {
        setStoredValue(safeJsonParse(e.newValue, initialValue));
      } else if (e.key === key && e.newValue === null) {
        setStoredValue(initialValue);
      }
    };

    window.addEventListener('storage', handleStorageChange);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [key, initialValue]);

  return [storedValue, setValue, removeValue];
}

export default useLocalStorage;
