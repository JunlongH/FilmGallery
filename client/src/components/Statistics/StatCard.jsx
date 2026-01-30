/**
 * StatCard - 统计卡片组件
 * 
 * 使用 HeroUI Card 展示关键指标
 * 支持趋势指示、副标题、图标
 */

import React, { useState, useEffect, useRef } from 'react';
import { Card, CardBody } from '@heroui/react';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown } from 'lucide-react';

const formatStat = (val) => {
  const num = Number(val);
  if (isNaN(num)) return '0';
  return Number.isInteger(num) ? num.toString() : num.toFixed(2);
};

// 响应式暗色模式检测 Hook
function useDarkMode() {
  const [isDark, setIsDark] = useState(false);
  
  useEffect(() => {
    // 初始检测
    const checkDark = () => {
      const hasDarkClass = document.documentElement.classList.contains('dark');
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      setIsDark(hasDarkClass || prefersDark);
    };
    
    checkDark();
    
    // 监听 class 变化
    const observer = new MutationObserver(checkDark);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    
    // 监听系统偏好变化
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    mediaQuery.addEventListener('change', checkDark);
    
    return () => {
      observer.disconnect();
      mediaQuery.removeEventListener('change', checkDark);
    };
  }, []);
  
  return isDark;
}

// 颜色配置 - 区分亮色/暗色模式
const getColorConfig = (color, isDark) => {
  const configs = {
    default: {
      light: {
        gradient: 'linear-gradient(135deg, rgba(243, 244, 246, 0.8) 0%, rgba(229, 231, 235, 0.9) 100%)',
        iconBg: 'rgba(107, 114, 128, 0.15)',
        iconColor: '#6b7280'
      },
      dark: {
        gradient: 'linear-gradient(135deg, rgba(63, 63, 70, 0.4) 0%, rgba(39, 39, 42, 0.5) 100%)',
        iconBg: 'rgba(113, 113, 122, 0.3)',
        iconColor: '#a1a1aa'
      }
    },
    primary: {
      light: {
        gradient: 'linear-gradient(135deg, rgba(219, 234, 254, 0.7) 0%, rgba(191, 219, 254, 0.8) 100%)',
        iconBg: 'rgba(59, 130, 246, 0.15)',
        iconColor: '#2563eb'
      },
      dark: {
        gradient: 'linear-gradient(135deg, rgba(59, 130, 246, 0.12) 0%, rgba(37, 99, 235, 0.2) 100%)',
        iconBg: 'rgba(59, 130, 246, 0.25)',
        iconColor: '#60a5fa'
      }
    },
    success: {
      light: {
        gradient: 'linear-gradient(135deg, rgba(209, 250, 229, 0.7) 0%, rgba(167, 243, 208, 0.8) 100%)',
        iconBg: 'rgba(16, 185, 129, 0.15)',
        iconColor: '#059669'
      },
      dark: {
        gradient: 'linear-gradient(135deg, rgba(16, 185, 129, 0.12) 0%, rgba(5, 150, 105, 0.2) 100%)',
        iconBg: 'rgba(16, 185, 129, 0.25)',
        iconColor: '#34d399'
      }
    },
    warning: {
      light: {
        gradient: 'linear-gradient(135deg, rgba(254, 243, 199, 0.7) 0%, rgba(253, 230, 138, 0.8) 100%)',
        iconBg: 'rgba(245, 158, 11, 0.15)',
        iconColor: '#d97706'
      },
      dark: {
        gradient: 'linear-gradient(135deg, rgba(245, 158, 11, 0.12) 0%, rgba(217, 119, 6, 0.2) 100%)',
        iconBg: 'rgba(245, 158, 11, 0.25)',
        iconColor: '#fbbf24'
      }
    },
    danger: {
      light: {
        gradient: 'linear-gradient(135deg, rgba(254, 226, 226, 0.7) 0%, rgba(254, 202, 202, 0.8) 100%)',
        iconBg: 'rgba(239, 68, 68, 0.15)',
        iconColor: '#dc2626'
      },
      dark: {
        gradient: 'linear-gradient(135deg, rgba(239, 68, 68, 0.12) 0%, rgba(220, 38, 38, 0.2) 100%)',
        iconBg: 'rgba(239, 68, 68, 0.25)',
        iconColor: '#f87171'
      }
    },
    secondary: {
      light: {
        gradient: 'linear-gradient(135deg, rgba(237, 233, 254, 0.7) 0%, rgba(221, 214, 254, 0.8) 100%)',
        iconBg: 'rgba(139, 92, 246, 0.15)',
        iconColor: '#7c3aed'
      },
      dark: {
        gradient: 'linear-gradient(135deg, rgba(139, 92, 246, 0.12) 0%, rgba(124, 58, 237, 0.2) 100%)',
        iconBg: 'rgba(139, 92, 246, 0.25)',
        iconColor: '#a78bfa'
      }
    },
    info: {
      light: {
        gradient: 'linear-gradient(135deg, rgba(224, 242, 254, 0.7) 0%, rgba(186, 230, 253, 0.8) 100%)',
        iconBg: 'rgba(14, 165, 233, 0.15)',
        iconColor: '#0ea5e9'
      },
      dark: {
        gradient: 'linear-gradient(135deg, rgba(14, 165, 233, 0.12) 0%, rgba(2, 132, 199, 0.2) 100%)',
        iconBg: 'rgba(14, 165, 233, 0.25)',
        iconColor: '#38bdf8'
      }
    },
    rose: {
      light: {
        gradient: 'linear-gradient(135deg, rgba(255, 228, 230, 0.7) 0%, rgba(253, 164, 175, 0.8) 100%)',
        iconBg: 'rgba(244, 63, 94, 0.15)',
        iconColor: '#f43f5e'
      },
      dark: {
        gradient: 'linear-gradient(135deg, rgba(244, 63, 94, 0.12) 0%, rgba(225, 29, 72, 0.2) 100%)',
        iconBg: 'rgba(244, 63, 94, 0.25)',
        iconColor: '#fb7185'
      }
    },
    indigo: {
      light: {
        gradient: 'linear-gradient(135deg, rgba(224, 231, 255, 0.7) 0%, rgba(199, 210, 254, 0.8) 100%)',
        iconBg: 'rgba(99, 102, 241, 0.15)',
        iconColor: '#6366f1'
      },
      dark: {
        gradient: 'linear-gradient(135deg, rgba(99, 102, 241, 0.12) 0%, rgba(79, 70, 229, 0.2) 100%)',
        iconBg: 'rgba(99, 102, 241, 0.25)',
        iconColor: '#818cf8'
      }
    },
    teal: {
      light: {
        gradient: 'linear-gradient(135deg, rgba(204, 251, 241, 0.7) 0%, rgba(153, 246, 228, 0.8) 100%)',
        iconBg: 'rgba(20, 184, 166, 0.15)',
        iconColor: '#14b8a6'
      },
      dark: {
        gradient: 'linear-gradient(135deg, rgba(20, 184, 166, 0.12) 0%, rgba(13, 148, 136, 0.2) 100%)',
        iconBg: 'rgba(20, 184, 166, 0.25)',
        iconColor: '#2dd4bf'
      }
    }
  };
  
  const colorSet = configs[color] || configs.default;
  return isDark ? colorSet.dark : colorSet.light;
};

export default function StatCard({ 
  title, 
  value, 
  sub, 
  trend, 
  icon: Icon,
  color = 'default',
  prefix = '',
  suffix = ''
}) {
  // 使用响应式暗色模式检测
  const isDark = useDarkMode();
  const cardRef = useRef(null);
  
  const colorConfig = getColorConfig(color, isDark);
  const trendColor = trend > 0 ? '#10b981' : trend < 0 ? '#ef4444' : '#a1a1aa';
  const TrendIcon = trend > 0 ? TrendingUp : TrendingDown;

  // 使用 useEffect 直接操作 DOM 来设置背景，绕过任何框架样式
  useEffect(() => {
    if (cardRef.current) {
      cardRef.current.style.setProperty('background', colorConfig.gradient, 'important');
    }
  }, [colorConfig.gradient]);

  return (
    <motion.div
      whileHover={{ y: -2 }}
      transition={{ duration: 0.2 }}
      className="h-full"
    >
      <Card 
        ref={cardRef}
        className="overflow-hidden border border-divider/50 hover:shadow-lg transition-shadow duration-300 h-full"
      >
        <CardBody className="p-5 gap-2 flex flex-col justify-between h-full">
          <div className="flex items-start justify-between">
            <p className="text-xs text-default-500 dark:text-default-400 uppercase tracking-wider font-semibold">
              {title}
            </p>
            {Icon && (
              <div 
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: colorConfig.iconBg }}
              >
                <Icon className="w-4 h-4" style={{ color: colorConfig.iconColor }} />
              </div>
            )}
          </div>
          
          <div className="flex items-baseline gap-1">
            {prefix && <span className="text-xl text-default-600 dark:text-default-300">{prefix}</span>}
            <span className="text-3xl font-bold text-foreground tracking-tight">
              {typeof value === 'number' ? formatStat(value) : value}
            </span>
            {suffix && <span className="text-lg text-default-600 dark:text-default-300">{suffix}</span>}
          </div>
          
          <div className="flex items-center justify-between mt-auto">
            {sub ? (
              <p className="text-xs text-default-400 dark:text-default-500">{sub}</p>
            ) : (
              <span className="text-xs text-transparent select-none">&nbsp;</span>
            )}
            {trend !== undefined && trend !== 0 && (
              <div className="flex items-center gap-1 text-xs font-semibold" style={{ color: trendColor }}>
                <TrendIcon className="w-3 h-3" />
                <span>{formatStat(Math.abs(trend))}%</span>
              </div>
            )}
          </div>
        </CardBody>
      </Card>
    </motion.div>
  );
}
