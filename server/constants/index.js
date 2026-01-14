/**
 * Constants Index
 * 
 * Central export point for all server constants.
 */

const film = require('./film');
const photography = require('./photography');

module.exports = {
  ...film,
  ...photography
};
