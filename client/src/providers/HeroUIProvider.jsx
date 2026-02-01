/**
 * HeroUI Provider 封装
 * 
 * 提供:
 * - HeroUI 主题系统
 * - 暗色模式切换支持
 * - 与现有 data-theme 属性兼容
 */

import React, { useMemo, useEffect, useState, createContext, useContext } from 'react';
import { HeroUIProvider as BaseHeroUIProvider } from '@heroui/react';
import { useNavigate } from 'react-router-dom';

// 主题上下文
const ThemeContext = createContext({
  theme: 'light',
  setTheme: () => {},
  toggleTheme: () => {},
});

/**
 * 使用主题 Hook
 * @returns {{ theme: 'light' | 'dark', setTheme: Function, toggleTheme: Function }}
 */
export const useTheme = () => useContext(ThemeContext);

/**
 * HeroUI Provider 组件
 * 
 * @param {Object} props
 * @param {React.ReactNode} props.children
 */
export function HeroUIProvider({ children }) {
  const navigate = useNavigate();
  
  // 初始化主题（从 localStorage 或系统偏好）
  const [theme, setThemeState] = useState(() => {
    // 优先检查 localStorage
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark' || savedTheme === 'light') {
      return savedTheme;
    }
    
    // 检查现有的 data-theme 属性
    const currentDataTheme = document.documentElement.getAttribute('data-theme');
    if (currentDataTheme) {
      return currentDataTheme;
    }
    
    // 回退到系统偏好
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
    
    return 'light';
  });
  
  // 设置主题
  const setTheme = (newTheme) => {
    setThemeState(newTheme);
    localStorage.setItem('theme', newTheme);
  };
  
  // 同步主题到 DOM
  useEffect(() => {
    const root = document.documentElement;
    
    // 设置 data-theme 属性（与现有样式兼容）
    root.setAttribute('data-theme', theme);
    
    // 设置 class（Tailwind dark mode）
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    
    // 更新 meta theme-color（针对 Electron 标题栏）
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      metaThemeColor.setAttribute('content', theme === 'dark' ? '#000000' : '#f5f7fa');
    }
  }, [theme]);
  
  // 监听系统主题变化
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    
    const handleChange = (e) => {
      // 仅在没有保存的偏好时响应系统变化
      const savedTheme = localStorage.getItem('theme');
      if (!savedTheme) {
        setThemeState(e.matches ? 'dark' : 'light');
      }
    };
    
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);
  
  // 主题上下文值 - toggleTheme 依赖 theme，需要使用 useCallback
  const toggleThemeCallback = React.useCallback(() => {
    setTheme(theme === 'light' ? 'dark' : 'light');
  }, [theme]);
  
  const themeContextValue = useMemo(() => ({
    theme,
    setTheme,
    toggleTheme: toggleThemeCallback,
  }), [theme, toggleThemeCallback]);
  
  return (
    <ThemeContext.Provider value={themeContextValue}>
      <BaseHeroUIProvider navigate={navigate}>
        <div className="heroui-provider h-full bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 transition-colors duration-200">
          {children}
        </div>
      </BaseHeroUIProvider>
    </ThemeContext.Provider>
  );
}

/**
 * 主题切换按钮组件
 * 可在任何地方使用
 */
export function ThemeToggle({ className = '' }) {
  const { theme, toggleTheme } = useTheme();
  
  return (
    <button
      onClick={toggleTheme}
      className={`p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors ${className}`}
      aria-label={theme === 'dark' ? '切换到浅色模式' : '切换到深色模式'}
      title={theme === 'dark' ? '浅色模式' : '深色模式'}
    >
      {theme === 'dark' ? (
        // 太阳图标
        <svg className="w-5 h-5 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      ) : (
        // 月亮图标
        <svg className="w-5 h-5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
        </svg>
      )}
    </button>
  );
}

export default HeroUIProvider;
