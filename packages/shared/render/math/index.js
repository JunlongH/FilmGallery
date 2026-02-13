const colorSpace = require('./color-space');
const exposure = require('./exposure');
const toneCurves = require('./tone-curves');

module.exports = {
    ...colorSpace,
    ...exposure,
    ...toneCurves
};
