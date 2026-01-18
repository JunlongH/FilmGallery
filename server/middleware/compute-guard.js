/**
 * Compute Guard Middleware
 * 
 * Blocks compute-intensive routes when server is running in NAS mode.
 * Returns a helpful error message directing users to use PC for processing.
 */

const { isComputeEnabled, isComputeRoute, getServerMode } = require('../../packages/shared/serverCapabilities');

/**
 * Middleware that guards compute routes in NAS mode
 */
function computeGuard(req, res, next) {
  // Check if this is a compute route
  if (!isComputeRoute(req.path)) {
    return next();
  }
  
  // Check if compute is enabled
  if (isComputeEnabled()) {
    return next();
  }
  
  // Block compute routes in NAS mode
  const mode = getServerMode();
  console.log(`[COMPUTE GUARD] Blocked ${req.method} ${req.path} in ${mode} mode`);
  
  return res.status(503).json({
    ok: false,
    error: 'COMPUTE_REQUIRED',
    code: 'E_NAS_NO_COMPUTE',
    message: 'This operation requires a compute-capable workstation.',
    details: {
      serverMode: mode,
      requestedPath: req.path,
      suggestion: 'Please use the PC client with local compute worker enabled.'
    }
  });
}

/**
 * Middleware factory with custom error handler
 */
function createComputeGuard(options = {}) {
  const { onBlocked } = options;
  
  return (req, res, next) => {
    if (!isComputeRoute(req.path)) {
      return next();
    }
    
    if (isComputeEnabled()) {
      return next();
    }
    
    if (onBlocked) {
      return onBlocked(req, res, next);
    }
    
    return computeGuard(req, res, next);
  };
}

module.exports = {
  computeGuard,
  createComputeGuard
};
