// 应用标识信息，用于端口发现验证
// App identification info for port discovery verification

const pkg = require('../package.json');

module.exports = {
  APP_IDENTIFIER: 'FilmGallery',
  APP_VERSION: pkg.version || '1.0.0',
  DISCOVERY_ENDPOINT: '/api/discover',
  DEFAULT_PORT: 4000,
  PORT_SCAN_RANGE: [4000, 4001, 4002, 4003, 4004, 4005, 4010, 4020, 4100]
};
