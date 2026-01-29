/**
 * PostCSS 配置 - Tailwind CSS v4
 * 
 * Tailwind v4 使用 @tailwindcss/postcss 插件
 * 不再需要单独的 autoprefixer（已内置）
 */
module.exports = {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};
