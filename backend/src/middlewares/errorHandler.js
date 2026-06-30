// Global error handling middleware
const errorHandler = (err, req, res, next) => {
  console.error('[Error]:', err.message);

  if (err.name === 'ZodError') {
    return res.status(400).json({
      error: 'Validation Error',
      details: err.errors.map(e => ({ path: e.path.join('.'), message: e.message }))
    });
  }

  if (err.name === 'UnauthorizedError') {
    return res.status(401).json({ error: 'Unauthorized access.' });
  }

  // Default server error
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  res.status(statusCode).json({ error: message });
};

module.exports = errorHandler;
