/**
 * SettingsRow - 设置项行组件
 * 
 * 用于展示单个设置项，包含标签、值、操作
 */

import React from 'react';
import { Switch, Input, Select, SelectItem, Button, Chip } from '@heroui/react';

export default function SettingsRow({
  label,
  description,
  value,
  type = 'text', // 'text' | 'switch' | 'select' | 'path' | 'display'
  options = [], // for select type
  disabled = false,
  loading = false,
  onChange,
  onAction,
  actionLabel,
  actionIcon: ActionIcon,
  badge,
  children
}) {
  const renderControl = () => {
    switch (type) {
      case 'switch':
        return (
          <Switch
            isSelected={!!value}
            onValueChange={onChange}
            isDisabled={disabled}
          />
        );
      
      case 'select':
        return (
          <Select
            size="sm"
            variant="bordered"
            selectedKeys={value ? [value] : []}
            onSelectionChange={(keys) => onChange?.(Array.from(keys)[0])}
            isDisabled={disabled}
            className="w-48"
          >
            {options.map(opt => (
              <SelectItem key={opt.value} textValue={opt.label}>
                {opt.label}
              </SelectItem>
            ))}
          </Select>
        );
      
      case 'path':
        return (
          <div className="flex items-center gap-2">
            <code className="text-xs bg-default-100 px-3 py-2 rounded-lg text-default-600 max-w-md truncate">
              {value || 'Not set'}
            </code>
            {onAction && (
              <Button
                size="sm"
                variant="flat"
                isDisabled={disabled}
                isLoading={loading}
                onPress={onAction}
                startContent={ActionIcon && <ActionIcon className="w-4 h-4" />}
              >
                {actionLabel || 'Browse'}
              </Button>
            )}
          </div>
        );
      
      case 'display':
        return (
          <div className="flex items-center gap-2">
            <span className="text-sm text-default-700">{value}</span>
            {badge && (
              <Chip size="sm" variant="flat" color={badge.color || 'default'}>
                {badge.label}
              </Chip>
            )}
          </div>
        );
      
      case 'text':
      default:
        return (
          <Input
            size="sm"
            variant="bordered"
            value={value || ''}
            onValueChange={onChange}
            isDisabled={disabled}
            className="w-64"
          />
        );
    }
  };

  return (
    <div className="flex items-center justify-between py-3 border-b border-zinc-200/30 dark:border-zinc-700/30 last:border-0">
      <div className="flex-1 min-w-0 mr-4">
        <p className="text-sm font-medium text-default-700">{label}</p>
        {description && (
          <p className="text-xs text-default-400 mt-0.5">{description}</p>
        )}
      </div>
      <div className="flex-shrink-0">
        {children || renderControl()}
      </div>
    </div>
  );
}
