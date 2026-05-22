/**
 * Config read API — exposes safe, non-sensitive server configuration
 * to the frontend.
 *
 * GET /api/config/vaultRoot — Returns the configured vaultRoot path,
 *   or empty string if not set. Frontend applies the default
 *   ~/Documents/Obsidian fallback when faced with an empty string.
 * @module
 */

import { Hono } from 'hono';
import { config } from '../lib/config.js';
import { rateLimitGeneral } from '../middleware/rate-limit.js';

const app = new Hono();

app.get('/api/config/vaultRoot', rateLimitGeneral, (c) => {
  return c.json({ vaultRoot: config.vaultRoot });
});

export default app;