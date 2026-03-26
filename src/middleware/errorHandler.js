const errorHandler = (err, req, res, next) => {
  console.error('[ERROR]', err.message);

  if (err.code === '23505') { // Postgres unique violation
    return res.status(409).json({ success: false, message: 'Resource already exists' });
  }

  const status = err.status || err.statusCode || 500;
  const message = err.message || 'Internal server error';

  res.status(status).json({ success: false, message });
};

module.exports = { errorHandler };
