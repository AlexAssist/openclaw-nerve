// @vitest-environment node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const STAMP_SCRIPT = path.resolve(import.meta.dirname, 'telemetry-stamp.mjs');

describe('telemetry-stamp.mjs', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nerve-telemetry-stamp-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function runStamp(...args: string[]): void {
    execFileSync(process.execPath, [STAMP_SCRIPT, ...args, '--dir', tempDir], {
      encoding: 'utf8',
      stdio: 'pipe',
    });
  }

  function readStamp(kind: 'install-method' | 'bootstrap'): Record<string, unknown> | undefined {
    const fileName = kind === 'install-method' ? 'install-method.json' : 'bootstrap.json';
    const filePath = path.join(tempDir, fileName);
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
      return undefined;
    }
  }

  describe('install-method stamping', () => {
    it('stamps release install method', () => {
      runStamp('install-method', 'release', '--source', 'install.sh');

      const stamp = readStamp('install-method');
      expect(stamp?.installMethod).toBe('release');
      expect(stamp?.source).toBe('install.sh');
    });

    it('stamps source install method for branch installs', () => {
      runStamp('install-method', 'source', '--source', 'install.sh');

      const stamp = readStamp('install-method');
      expect(stamp?.installMethod).toBe('source');
      expect(stamp?.source).toBe('install.sh');
    });

    it('stamps unknown install method', () => {
      runStamp('install-method', 'unknown', '--source', 'runtime');

      const stamp = readStamp('install-method');
      expect(stamp?.installMethod).toBe('unknown');
      expect(stamp?.source).toBe('runtime');
    });

    it('respects --if-missing flag for install-method', () => {
      runStamp('install-method', 'release', '--source', 'install.sh');
      const original = readStamp('install-method');

      runStamp('install-method', 'source', '--if-missing', '--source', 'setup');

      const current = readStamp('install-method');
      expect(current?.installMethod).toBe('release');
      expect(current?.stampedAt).toBe(original?.stampedAt);
    });
  });

  describe('bootstrap stamping', () => {
    it('stamps fresh_install bootstrap marker', () => {
      runStamp('bootstrap', 'fresh_install', '--source', 'install.sh');

      const stamp = readStamp('bootstrap');
      expect(stamp?.kind).toBe('fresh_install');
      expect(stamp?.source).toBe('install.sh');
    });

    it('stamps upgrade_legacy bootstrap marker', () => {
      runStamp('bootstrap', 'upgrade_legacy', '--source', 'runtime');

      const stamp = readStamp('bootstrap');
      expect(stamp?.kind).toBe('upgrade_legacy');
      expect(stamp?.source).toBe('runtime');
    });

    it('respects --if-missing flag for bootstrap', () => {
      runStamp('bootstrap', 'fresh_install', '--source', 'install.sh');
      const original = readStamp('bootstrap');

      runStamp('bootstrap', 'upgrade_legacy', '--if-missing', '--source', 'runtime');

      const current = readStamp('bootstrap');
      expect(current?.kind).toBe('fresh_install');
      expect(current?.stampedAt).toBe(original?.stampedAt);
    });
  });

  describe('branch vs release provenance', () => {
    it('release install stamps install-method=release', () => {
      // Simulates: TARGET_REF_KIND=release in install.sh
      runStamp('install-method', 'release', '--source', 'install.sh');

      const stamp = readStamp('install-method');
      expect(stamp?.installMethod).toBe('release');
    });

    it('tagged version install stamps install-method=release', () => {
      // Simulates: TARGET_REF_KIND=version in install.sh
      runStamp('install-method', 'release', '--source', 'install.sh');

      const stamp = readStamp('install-method');
      expect(stamp?.installMethod).toBe('release');
    });

    it('branch install stamps install-method=source', () => {
      // Simulates: TARGET_REF_KIND=branch in install.sh
      runStamp('install-method', 'source', '--source', 'install.sh');

      const stamp = readStamp('install-method');
      expect(stamp?.installMethod).toBe('source');
    });

    it('branch-fallback install stamps install-method=source', () => {
      // Simulates: TARGET_REF_KIND=branch-fallback in install.sh
      runStamp('install-method', 'source', '--source', 'install.sh');

      const stamp = readStamp('install-method');
      expect(stamp?.installMethod).toBe('source');
    });
  });
});
