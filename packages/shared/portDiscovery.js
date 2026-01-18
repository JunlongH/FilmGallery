// 共享的端口发现配置，供 server/mobile/watch/client 复用
// Shared port discovery configuration for server/mobile/watch/client

module.exports = {
  // 应用标识符，用于验证发现的服务是否为 FilmGallery
  APP_IDENTIFIER: 'FilmGallery',
  
  // 端口发现 API 端点
  DISCOVERY_ENDPOINT: '/api/discover',
  
  // 默认端口（开发模式使用）
  DEFAULT_PORT: 4000,
  
  // 端口扫描范围（按优先级排序）
  PORT_SCAN_RANGE: [4000, 4001, 4002, 4003, 4004, 4005, 4010, 4020, 4100],
  
  // 发现请求超时时间 (ms)
  DISCOVERY_TIMEOUT: 2000,
  
  // 构建发现 URL
  buildDiscoverUrl: function(host, port) {
    return `http://${host}:${port}${this.DISCOVERY_ENDPOINT}`;
  }
};
