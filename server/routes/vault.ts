/**
 * Vault browser API routes.
 *
 * Provides directory tree listing, file reading, and file writing for the
 * Obsidian vault. All paths are relative to the vault root (VAULT_ROOT) and
 * validated against traversal + exclusion rules.
 *
 * GET  /api/vault/tree  — List directory entries (lazy, depth-limited)
 * GET  /api/vault/read  — Read a text file's content
 * PUT  /api/vault/write — Write/update a text file
 * @module
 */

import { Hono, type Context } from 'hono';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { config } from '../lib/config.js';
import { isBinary, MAX_FILE_SIZE } from '../lib/file-utils.js';

const app = new Hono();

// ── Exclusion rules (vault-specific, not tied to fileBrowserRoot config) ────
const VAULT_EXCLUDED_NAMES = new Set([
  'node_modules', '.git', 'dist', 'build', 'server-dist', 'certs',
]);

const VAULT_EXCLUDED_PATTERNS = [/^\.env(\.|$)/, /\.log$/];

// ── Types ────────────────────────────────────────────────────────────

interface TreeEntry {
  name: string;
  path: string;         // relative to vault root
  type: 'file' | 'directory';
  size?: number;        // bytes, files only
  mtime?: number;       // epoch ms
  binary?: boolean;     // true for binary files
  children?: TreeEntry[] | null; // null = not loaded, [] = empty dir
}

// ── Helpers ──────────────────────────────────────────────────────────

function resolveVaultRoot(): string {
  const vaultRoot = (config.vaultRoot || '').trim();
  if (vaultRoot) return path.resolve(vaultRoot);
  // Default: ~/Documents/Obsidian
  return path.join(os.homedir(), 'Documents', 'Obsidian');
}

function isVaultPathSafe(relativePath: string): boolean {
  // Reject traversal attempts
  if (relativePath.includes('..')) return false;
  return true;
}

async function listDirectory(
  dirPath: string,
  basePath: string,
  depth: number,
  showHidden: boolean,
): Promise<TreeEntry[]> {
  const entries: TreeEntry[] = [];

  let items;
  try {
    items = await fs.readdir(dirPath, { withFileTypes: true });
  } catch {
    return entries;
  }

  // Sort: directories first, then alphabetical (case-insensitive)
  items.sort((a, b) => {
    if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });

  for (const item of items) {
    if (VAULT_EXCLUDED_NAMES.has(item.name)) continue;
    if (VAULT_EXCLUDED_PATTERNS.some(p => p.test(item.name))) continue;

    // Hide dotfiles unless showHidden=true, except for .nerveignore
    if (!showHidden && item.name.startsWith('.') && item.name !== '.nerveignore') {
      continue;
    }

    const relativePath = basePath ? path.join(basePath, item.name) : item.name;
    const fullPath = path.join(dirPath, item.name);

    if (item.isDirectory()) {
      entries.push({
        name: item.name,
        path: relativePath,
        type: 'directory',
        children: depth > 1
          ? await listDirectory(fullPath, relativePath, depth - 1, showHidden)
          : null,
      });
    } else if (item.isFile()) {
      try {
        const stat = await fs.stat(fullPath);
        entries.push({
          name: item.name,
          path: relativePath,
          type: 'file',
          size: stat.size,
          mtime: Math.floor(stat.mtimeMs),
          binary: isBinary(item.name) || undefined,
        });
      } catch {
        // Skip files we can't stat
      }
    }
  }

  return entries;
}

function handleVaultError(c: Context, err: unknown, message = 'Operation failed') {
  const status = err instanceof Error && err.message.includes('not found') ? 404 : 500;
  const error = err instanceof Error ? err.message : message;
  return c.json({ ok: false, error }, status);
}

// ── GET /api/vault/tree ───────────────────────────────────────────────

app.get('/api/vault/tree', async (c) => {
  const vaultRoot = resolveVaultRoot();
  const subPath = c.req.query('path') || '';
  const depth = Math.min(Math.max(Number(c.req.query('depth')) || 1, 1), 5);
  const showHidden = c.req.query('showHidden') === 'true';

  // Validate subPath for traversal
  if (!isVaultPathSafe(subPath)) {
    return c.json({ ok: false, error: 'Invalid path' }, 400);
  }

  let targetDir: string;
  if (subPath) {
    targetDir = path.join(vaultRoot, subPath);
  } else {
    targetDir = vaultRoot;
  }

  // Ensure it's a directory
  try {
    const stat = await fs.stat(targetDir);
    if (!stat.isDirectory()) {
      return c.json({ ok: false, error: 'Not a directory' }, 400);
    }
  } catch {
    return c.json({ ok: false, error: 'Invalid path' }, 400);
  }

  const entries = await listDirectory(targetDir, subPath, depth, showHidden);

  return c.json({
    ok: true,
    root: subPath || '.',
    entries,
    workspaceInfo: {
      isCustomWorkspace: false,
      rootPath: vaultRoot,
    },
  });
});

// ── GET /api/vault/read ──────────────────────────────────────────────

app.get('/api/vault/read', async (c) => {
  const filePath = c.req.query('path');
  if (!filePath) {
    return c.json({ ok: false, error: 'Missing path parameter' }, 400);
  }

  if (!isVaultPathSafe(filePath)) {
    return c.json({ ok: false, error: 'Invalid or excluded path' }, 403);
  }

  const vaultRoot = resolveVaultRoot();
  const fullPath = path.join(vaultRoot, filePath);

  // Security: double-check resolved path is under vaultRoot
  const resolved = path.resolve(fullPath);
  if (!resolved.startsWith(vaultRoot + path.sep) && resolved !== vaultRoot) {
    return c.json({ ok: false, error: 'Access denied' }, 403);
  }

  try {
    const stat = await fs.stat(fullPath);
    if (!stat.isFile()) {
      return c.json({ ok: false, error: 'Not a file' }, 400);
    }
    if (stat.size > MAX_FILE_SIZE) {
      return c.json({ ok: false, error: 'File too large' }, 413);
    }
    const content = await fs.readFile(fullPath, 'utf-8');
    return c.json({ ok: true, content });
  } catch (err) {
    if (err instanceof Error && err.message.includes('ENOENT')) {
      return c.json({ ok: false, error: 'File not found' }, 404);
    }
    return handleVaultError(c, err, 'Failed to read file');
  }
});

// ── PUT /api/vault/write ─────────────────────────────────────────────

app.put('/api/vault/write', async (c) => {
  const filePath = c.req.query('path');
  if (!filePath) {
    return c.json({ ok: false, error: 'Missing path parameter' }, 400);
  }

  if (!isVaultPathSafe(filePath)) {
    return c.json({ ok: false, error: 'Invalid or excluded path' }, 403);
  }

  const vaultRoot = resolveVaultRoot();
  const fullPath = path.join(vaultRoot, filePath);

  // Security: double-check resolved path is under vaultRoot
  const resolved = path.resolve(fullPath);
  if (!resolved.startsWith(vaultRoot + path.sep) && resolved !== vaultRoot) {
    return c.json({ ok: false, error: 'Access denied' }, 403);
  }

  let body: { content?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, error: 'Invalid JSON body' }, 400);
  }

  if (typeof body.content !== 'string') {
    return c.json({ ok: false, error: 'content field is required' }, 400);
  }

  try {
    // Ensure parent directory exists
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, body.content, 'utf-8');
    return c.json({ ok: true });
  } catch (err) {
    return handleVaultError(c, err, 'Failed to write file');
  }
});

export default app;