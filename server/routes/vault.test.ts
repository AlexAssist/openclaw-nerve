/** Tests for the vault browser routes (tree, read, write). */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

describe('vault routes', () => {
  let homeDir: string;
  let vaultDir: string;

  beforeEach(async () => {
    vi.resetModules();
    homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vault-test-'));
    vaultDir = path.join(homeDir, 'obsidian-vault');
    await fs.mkdir(vaultDir, { recursive: true });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(homeDir, { recursive: true, force: true });
  });

  async function buildApp(vaultRoot?: string) {
    vi.resetModules();
    vi.doUnmock('../lib/gateway-rpc.js');

    const effectiveVaultRoot = vaultRoot ?? vaultDir;

    vi.doMock('../lib/config.js', () => ({
      config: {
        auth: false,
        port: 3000,
        host: '127.0.0.1',
        sslPort: 3443,
        home: homeDir,
        memoryPath: path.join(homeDir, '.openclaw', 'MEMORY.md'),
        memoryDir: path.join(homeDir, '.openclaw', 'memory'),
        fileBrowserRoot: '',
        vaultRoot: effectiveVaultRoot,
        workspaceRemote: false,
      },
      SESSION_COOKIE_NAME: 'nerve_session_3000',
    }));

    const mod = await import('./vault.js');
    const app = new Hono();
    app.route('/', mod.default);
    return app;
  }

  describe('GET /api/vault/tree', () => {
    it('lists directory entries at vault root', async () => {
      await fs.writeFile(path.join(vaultDir, 'test.md'), '# Test');
      await fs.mkdir(path.join(vaultDir, 'subdir'));

      const app = await buildApp();
      const res = await app.request('/api/vault/tree');
      expect(res.status).toBe(200);
      const json = (await res.json()) as { ok: boolean; entries: Array<{ name: string; type: string }> };
      expect(json.ok).toBe(true);

      const names = json.entries.map(e => e.name);
      expect(names).toContain('test.md');
      expect(names).toContain('subdir');
    });

    it('excludes .git and node_modules from vault tree', async () => {
      await fs.mkdir(path.join(vaultDir, 'node_modules'));
      await fs.mkdir(path.join(vaultDir, '.git'));
      await fs.writeFile(path.join(vaultDir, 'visible.md'), 'hi');

      const app = await buildApp();
      const res = await app.request('/api/vault/tree');
      expect(res.status).toBe(200);
      const json = (await res.json()) as { ok: boolean; entries: Array<{ name: string }> };
      const names = json.entries.map(e => e.name);

      expect(names).toContain('visible.md');
      expect(names).not.toContain('node_modules');
      expect(names).not.toContain('.git');
    });

    it('hides dotfiles by default', async () => {
      await fs.writeFile(path.join(vaultDir, '.hidden.md'), 'secret');
      await fs.writeFile(path.join(vaultDir, 'visible.md'), 'hello');

      const app = await buildApp();
      const res = await app.request('/api/vault/tree');
      expect(res.status).toBe(200);
      const json = (await res.json()) as { ok: boolean; entries: Array<{ name: string }> };
      const names = json.entries.map(e => e.name);

      expect(names).toContain('visible.md');
      expect(names).not.toContain('.hidden.md');
    });

    it('includes dotfiles when showHidden=true', async () => {
      await fs.writeFile(path.join(vaultDir, '.hidden.md'), 'secret');

      const app = await buildApp();
      const res = await app.request('/api/vault/tree?showHidden=true');
      expect(res.status).toBe(200);
      const json = (await res.json()) as { ok: boolean; entries: Array<{ name: string }> };
      const names = json.entries.map(e => e.name);

      expect(names).toContain('.hidden.md');
    });

    it('returns 400 for non-existent subdirectory', async () => {
      const app = await buildApp();
      const res = await app.request('/api/vault/tree?path=nonexistent');
      expect(res.status).toBe(400);
    });

    it('rejects path traversal attempts', async () => {
      const app = await buildApp();
      const res = await app.request('/api/vault/tree?path=../../etc');
      expect(res.status).toBe(400);
    });

    it('returns vault root path in workspaceInfo', async () => {
      const app = await buildApp();
      const res = await app.request('/api/vault/tree');
      expect(res.status).toBe(200);
      const json = (await res.json()) as { ok: boolean; workspaceInfo: { rootPath: string } };
      expect(json.workspaceInfo.rootPath).toBe(vaultDir);
    });
  });

  describe('GET /api/vault/read', () => {
    it('returns file content for a vault markdown file', async () => {
      await fs.writeFile(path.join(vaultDir, 'note.md'), '# Hello World');

      const app = await buildApp();
      const res = await app.request('/api/vault/read?path=note.md');
      expect(res.status).toBe(200);
      const json = (await res.json()) as { ok: boolean; content: string };
      expect(json.ok).toBe(true);
      expect(json.content).toBe('# Hello World');
    });

    it('returns 400 when path is missing', async () => {
      const app = await buildApp();
      const res = await app.request('/api/vault/read');
      expect(res.status).toBe(400);
    });

    it('returns 404 for non-existent file', async () => {
      const app = await buildApp();
      const res = await app.request('/api/vault/read?path=missing.md');
      expect(res.status).toBe(404);
    });
  });

  describe('PUT /api/vault/write', () => {
    it('writes content to a new vault file', async () => {
      const app = await buildApp();
      const res = await app.request('/api/vault/write?path=new-note.md', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: '# New Note' }),
      });

      expect(res.status).toBe(200);
      const json = (await res.json()) as { ok: boolean };
      expect(json.ok).toBe(true);

      const written = await fs.readFile(path.join(vaultDir, 'new-note.md'), 'utf-8');
      expect(written).toBe('# New Note');
    });

    it('overwrites an existing vault file', async () => {
      await fs.writeFile(path.join(vaultDir, 'existing.md'), '# Original');
      const app = await buildApp();

      const res = await app.request('/api/vault/write?path=existing.md', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: '# Updated' }),
      });

      expect(res.status).toBe(200);
      const written = await fs.readFile(path.join(vaultDir, 'existing.md'), 'utf-8');
      expect(written).toBe('# Updated');
    });

    it('returns 400 when path is missing', async () => {
      const app = await buildApp();
      const res = await app.request('/api/vault/write', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: '# Test' }),
      });
      expect(res.status).toBe(400);
    });
  });
});