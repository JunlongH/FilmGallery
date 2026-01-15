/**
 * CRACO (Create React App Configuration Override)
 * 
 * 配置目的:
 * 1. 允许从 src/ 外部导入 packages/shared 模块
 * 2. 配置 @filmgallery/shared 别名指向共享模块
 * 3. 解决 CRA 的 ModuleScopePlugin 限制
 */

const path = require('path');

module.exports = {
  webpack: {
    alias: {
      // 统一共享模块的导入路径
      '@filmgallery/shared': path.resolve(__dirname, '../packages/shared'),
    },
    configure: (webpackConfig) => {
      // 移除 ModuleScopePlugin，允许从 src/ 外部导入
      const scopePluginIndex = webpackConfig.resolve.plugins.findIndex(
        ({ constructor }) => constructor && constructor.name === 'ModuleScopePlugin'
      );
      if (scopePluginIndex >= 0) {
        webpackConfig.resolve.plugins.splice(scopePluginIndex, 1);
      }
      
      // 确保 .js 和 .mjs 文件都能正确解析
      webpackConfig.resolve.extensions = [
        '.js', '.mjs', '.jsx', '.ts', '.tsx', '.json'
      ];
      
      return webpackConfig;
    },
  },
};
