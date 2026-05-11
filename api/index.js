/**
 * Vercel serverless entry for the social-intel Express app.
 *
 * Wraps the Express app import in a try/catch so that any startup error
 * (missing module, env var crash, file-read failure) returns a debuggable
 * JSON response instead of FUNCTION_INVOCATION_FAILED.
 *
 * If startup succeeds, the Express app handles all routes natively.
 */

let app;
let startupError = null;

try {
  const mod = await import('./server.js');
  app = mod.default;
} catch (err) {
  startupError = err;
  console.error('[Vercel] App import failed:', err);
}

export default function handler(req, res) {
  if (startupError) {
    res.setHeader('Content-Type', 'application/json');
    return res.status(500).json({
      error: 'Server failed to start',
      message: startupError.message,
      stack: process.env.NODE_ENV === 'production' ? undefined : startupError.stack,
      code: startupError.code,
    });
  }
  return app(req, res);
}
