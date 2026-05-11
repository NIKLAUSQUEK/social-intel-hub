/**
 * Vercel serverless entry for the social-intel Express app.
 *
 * Vercel's Node runtime invokes the default export of this file as an HTTP
 * handler. An Express `app` is itself a valid (req, res) handler, so we forward
 * straight through — no adapter library required.
 *
 * All routes — /, /pitch/, /api/clients, /api/analyse, etc. — flow through
 * the same Express app exactly as they do locally.
 */
import app from './server.js';
export default app;
