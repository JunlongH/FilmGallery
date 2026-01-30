/**
 * SettingsSection - 设置区块组件
 * 
 * 用于包装设置项组，提供统一的标题和布局
 */

import React from 'react';
import { Card, CardHeader, CardBody, Divider } from '@heroui/react';

export default function SettingsSection({
  title,
  description,
  icon: Icon,
  children,
  action
}) {
  return (
    <Card className="border border-divider/50 bg-content1/60 backdrop-blur-sm">
      <CardHeader className="flex justify-between items-start gap-4">
        <div className="flex items-start gap-3">
          {Icon && (
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Icon className="w-5 h-5 text-primary" />
            </div>
          )}
          <div>
            <h3 className="text-base font-semibold text-default-800">
              {title}
            </h3>
            {description && (
              <p className="text-sm text-default-500 mt-0.5">
                {description}
              </p>
            )}
          </div>
        </div>
        {action && <div className="flex-shrink-0">{action}</div>}
      </CardHeader>
      
      <Divider />
      
      <CardBody className="gap-4">
        {children}
      </CardBody>
    </Card>
  );
}
