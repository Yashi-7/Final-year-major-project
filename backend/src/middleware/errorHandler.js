// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  // Honour status set by libraries (e.g. body-parser's 400 for malformed JSON, 413 for oversized bodies).
  const libraryStatus = err.status || err.statusCode;
  const statusCode =
    libraryStatus >= 400 && libraryStatus < 600
      ? libraryStatus
      : res.statusCode && res.statusCode !== 200
        ? res.statusCode
        : 500;

  const isServerError = statusCode >= 500;
  const isProduction = process.env.NODE_ENV === 'production';

  // Server-side errors are always logged for the developer/operator (with the stack in non-production),
  // but in production the CLIENT only ever sees a generic message for them: driver and framework error text
  // (connection strings, query details, file paths) must not leak. 4xx messages are written for the caller
  // and stay as they are.
  if (isServerError && process.env.NODE_ENV !== 'test') {
    console.error(`[error] ${req.method} ${req.originalUrl} -> ${statusCode}: ${err.message}`);
    if (!isProduction && err.stack) console.error(err.stack);
  }

  const response = {
    success: false,
    message: isServerError && isProduction ? 'Internal Server Error' : err.message || 'Internal Server Error',
  };

  if (process.env.NODE_ENV === 'development') {
    response.stack = err.stack;
  }

  res.status(statusCode).json(response);
};

export default errorHandler;
