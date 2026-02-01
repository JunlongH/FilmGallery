/**
 * GlassModal - 玻璃态模态框组件
 * 
 * 基于 HeroUI Modal 封装，添加玻璃态背景效果
 * 支持多种尺寸、动画效果和深色模式
 */

import React from 'react';
import { 
  Modal, 
  ModalContent, 
  ModalHeader, 
  ModalBody, 
  ModalFooter 
} from '@heroui/react';
// Framer Motion animations handled by HeroUI Modal internally

/**
 * GlassModal 组件
 * @param {boolean} isOpen - 是否显示
 * @param {function} onClose - 关闭回调
 * @param {string} size - 尺寸: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | 'full'
 * @param {string} title - 标题
 * @param {string} subtitle - 副标题
 * @param {React.ReactNode} icon - 标题图标
 * @param {React.ReactNode} children - 内容
 * @param {React.ReactNode} footer - 底部内容
 * @param {boolean} hideCloseButton - 是否隐藏关闭按钮
 * @param {boolean} isDismissable - 是否可点击遮罩关闭
 * @param {string} scrollBehavior - 滚动行为: 'inside' | 'outside'
 */
export default function GlassModal({
  isOpen,
  onClose,
  size = 'lg',
  title,
  subtitle,
  icon,
  children,
  footer,
  hideCloseButton = false,
  isDismissable = true,
  scrollBehavior = 'inside',
  className = '',
  ...props
}) {
  return (
    <Modal 
      isOpen={isOpen} 
      onClose={onClose}
      size={size}
      scrollBehavior={scrollBehavior}
      isDismissable={isDismissable}
      backdrop="blur"
      motionProps={{
        variants: {
          enter: {
            y: 0,
            opacity: 1,
            transition: {
              duration: 0.25,
              ease: 'easeOut'
            }
          },
          exit: {
            y: 10,
            opacity: 0,
            transition: {
              duration: 0.15,
              ease: 'easeIn'
            }
          }
        }
      }}
      classNames={{
        backdrop: 'bg-black/60',
        base: `max-h-[90vh] ${className}`,
        wrapper: 'items-center justify-center',
        header: 'border-b border-zinc-200/50 dark:border-zinc-700/50 pb-4',
        body: 'py-6',
        footer: 'border-t border-zinc-200/50 dark:border-zinc-700/50 pt-4',
        closeButton: 'hover:bg-zinc-100 dark:hover:bg-zinc-800 active:bg-zinc-200 dark:active:bg-zinc-700 rounded-full'
      }}
      hideCloseButton={hideCloseButton}
      {...props}
    >
      <ModalContent 
        className="shadow-2xl border border-zinc-200/30 dark:border-zinc-700/30 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
        style={{
          backdropFilter: 'blur(16px)'
        }}
      >
        {(onCloseInternal) => (
          <>
            {/* Header */}
            {(title || subtitle) && (
              <ModalHeader className="flex flex-col gap-1">
                <div className="flex items-center gap-3">
                  {icon && (
                    <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-blue-500/10 dark:bg-blue-400/10 flex items-center justify-center">
                      <span className="text-blue-600 dark:text-blue-400">{icon}</span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                      {title}
                    </h3>
                    {subtitle && (
                      <p className="text-sm text-zinc-500 dark:text-zinc-400 truncate">
                        {subtitle}
                      </p>
                    )}
                  </div>
                </div>
              </ModalHeader>
            )}

            {/* Body */}
            <ModalBody>
              {children}
            </ModalBody>

            {/* Footer */}
            {footer && (
              <ModalFooter>
                {footer}
              </ModalFooter>
            )}
          </>
        )}
      </ModalContent>
    </Modal>
  );
}

/**
 * GlassModalHeader - 可单独使用的头部组件
 */
export function GlassModalHeader({ icon, title, subtitle, className = '' }) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {icon && (
        <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center shadow-sm">
          <span className="text-primary">{icon}</span>
        </div>
      )}
      <div className="flex-1 min-w-0">
        <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          {title}
        </h3>
        {subtitle && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {subtitle}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * GlassCard - 玻璃态卡片组件（用于模态框内部）
 */
export function GlassCard({ children, className = '', hoverable = false }) {
  return (
    <div 
      className={`
        rounded-xl border border-zinc-200 dark:border-zinc-700 
        bg-white dark:bg-zinc-700/50 
        ${hoverable ? 'transition-all duration-200 hover:bg-zinc-50 dark:hover:bg-zinc-700 hover:shadow-md' : ''}
        ${className}
      `}
    >
      {children}
    </div>
  );
}
