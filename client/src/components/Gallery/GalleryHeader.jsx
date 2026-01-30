/**
 * GalleryHeader - 图库页面头部组件
 * 
 * 统一的页面标题、返回按钮、计数显示
 */

import React from 'react';
import { Button, Chip } from '@heroui/react';
import { ArrowLeft, Heart, Tag, Image } from 'lucide-react';

export default function GalleryHeader({
  title,
  subtitle,
  count,
  icon: Icon = Image,
  showBack = false,
  onBack,
  action
}) {
  return (
    <div className="flex items-center justify-between mb-6">
      <div className="flex items-center gap-3">
        {showBack && (
          <Button
            isIconOnly
            variant="light"
            onPress={onBack}
            className="text-default-500"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
        )}
        
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Icon className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-default-800">
              {title}
            </h2>
            {subtitle && (
              <p className="text-sm text-default-500">{subtitle}</p>
            )}
          </div>
          {count !== undefined && (
            <Chip size="sm" variant="flat" color="primary">
              {count} {count === 1 ? 'photo' : 'photos'}
            </Chip>
          )}
        </div>
      </div>
      
      {action && <div>{action}</div>}
    </div>
  );
}
