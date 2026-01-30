/**
 * SearchInput - 共享搜索输入组件
 * 
 * 可复用的搜索框，支持防抖和回调
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Search, X } from 'lucide-react';

export default function SearchInput({
  placeholder = 'Search...',
  value: controlledValue,
  onChange,
  onSearch,
  debounceMs = 300,
  className = '',
  ...props
}) {
  const [internalValue, setInternalValue] = useState(controlledValue || '');
  const isControlled = controlledValue !== undefined;
  const value = isControlled ? controlledValue : internalValue;

  // Debounced search callback
  useEffect(() => {
    if (!onSearch) return;
    
    const timer = setTimeout(() => {
      onSearch(value);
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [value, onSearch, debounceMs]);

  const handleChange = useCallback((e) => {
    const newValue = e.target.value;
    if (!isControlled) {
      setInternalValue(newValue);
    }
    onChange?.(newValue);
  }, [isControlled, onChange]);

  const handleClear = useCallback(() => {
    if (!isControlled) {
      setInternalValue('');
    }
    onChange?.('');
    onSearch?.('');
  }, [isControlled, onChange, onSearch]);

  return (
    <div className={`relative ${className}`}>
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-default-400 pointer-events-none" />
      <input
        type="text"
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
        className="w-full pl-9 pr-8 py-2 rounded-lg bg-background text-sm 
                   focus:outline-none focus:ring-2 focus:ring-primary/30 
                   placeholder:text-default-400 transition-shadow"
        {...props}
      />
      {value && (
        <button
          onClick={handleClear}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full 
                     hover:bg-default-200 text-default-400 hover:text-default-600 transition-colors"
          type="button"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
