/**
 * Settings - Modern Components Index
 * 
 * 导出所有 Settings 模块化组件
 * 保留原有的 LutLibrary 和 ServerSettings
 */

// New modernized components
export { default as SettingsTabs, SETTINGS_TABS } from './SettingsTabs';
export { default as SettingsSection } from './SettingsSection';
export { default as SettingsRow } from './SettingsRow';

// Existing components (keep for compatibility)
export { default as LutLibrary } from './LutLibrary';
export { default as ServerSettings } from './ServerSettings';
