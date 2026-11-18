// Express 4 does not catch a rejected Promise thrown inside an async route
// handler - without this, an error in any `async (req, res) => {}` handler
// would crash the process instead of reaching the error-handling
// middleware in server/index.js. Wrap every async route handler with
// this: asyncHandler(async (req, res) => { ... }).
function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

module.exports = asyncHandler;
