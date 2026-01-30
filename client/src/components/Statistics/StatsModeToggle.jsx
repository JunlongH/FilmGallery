/**
 * StatsModeToggle - 统计模式切换器
 * 
 * 使用 HeroUI Tabs 实现 Overview/Spending 模式切换
 */

import React, { useState, useEffect } from 'react';
import { BarChart3, Wallet } from 'lucide-react';

// 响应式暗色模式检测
function useDarkMode() {
  const [isDark, setIsDark] = useState(false);
  
  useEffect(() => {
    const checkDark = () => {
      setIsDark(document.documentElement.classList.contains('dark'));
    };
    checkDark();
    const observer = new MutationObserver(checkDark);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);
  
  return isDark;
}

export default function StatsModeToggle({
  mode = 'stats', // 'stats' | 'spending'
  onModeChange
}) {
  const isDark = useDarkMode();
  
  const containerStyle = {
    display: 'flex',
    gap: '4px',
    padding: '4px',
    backgroundColor: isDark ? 'rgba(63, 63, 70, 0.5)' : '#f4f4f5',
    borderRadius: '12px'
  };
  
  const getTabStyle = (tabMode) => ({
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 16px',
    borderRadius: '8px',
    border: 'none',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 500,
    transition: 'all 0.2s',
    backgroundColor: mode === tabMode ? '#3b82f6' : 'transparent',
    color: mode === tabMode ? '#ffffff' : (isDark ? '#a1a1aa' : '#52525b')
  });

  return (
    <div style={containerStyle}>
      <button 
        style={getTabStyle('stats')}
        onClick={() => onModeChange('stats')}
      >
        <BarChart3 style={{ width: 16, height: 16 }} />
        <span>Overview</span>
      </button>
      <button 
        style={getTabStyle('spending')}
        onClick={() => onModeChange('spending')}
      >
        <Wallet style={{ width: 16, height: 16 }} />
        <span>Spending</span>
      </button>
    </div>
  );
}
