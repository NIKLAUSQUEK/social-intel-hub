/**
 * Vercel serverless entry for the social-intel Express app.
 *
 * Vercel's Node runtime invokes the default export of this file as an HTTP
 * handler. Express's app object IS a valid (req, res) handler, so we forward
 * straight through. No adapter library required.
 *
 * All routes — /, /pitch/, /api/clients, /api/analyse, etc. — flow through
 * the Express app exactly as they do locally.
 */
import app from '../server.js';
export default app;
