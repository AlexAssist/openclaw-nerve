import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useOpenFiles } from './useOpenFiles';

// Track all fetch calls for assertion
const trackedFetches: { url: string; method: string; body?: string }[] = [];

function createJsonResponse(data: unknown, init?: { ok?: boolean; status?: number }): Response {
  return {
    ok: init?.ok ?? true,
    status: init?.status ?? 200,
    json: async () => data,
  } as Response;
}

function createLocalStorageMock() {
  const store = new Map<string, string>();
  return {
    store,
    mock: {
      getItem: vi.fn((key: string) => store.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => { store.set(key, value); }),
      removeItem: vi.fn((key: string) => { store.delete(key); }),
      clear: vi.fn(() => { store.clear(); }),
    },
  };
}

function getRequestUrl(input: RequestInfo | URL): URL {
  if (typeof input === 'string') return new URL(input, 'http://localhost');
  if (input instanceof URL) return new URL(input.toString(), 'http://localhost');
  return new URL(input.url, 'http://localhost');
}

describe('useOpenFiles vault routing', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  let localStorageMock: ReturnType<typeof createLocalStorageMock>;

  beforeEach(() => {
    trackedFetches.length = 0;
    localStorageMock = createLocalStorageMock();
    vi.stubGlobal('localStorage', localStorageMock.mock);

    fetchSpy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = getRequestUrl(input);
      trackedFetches.push({
        url: url.toString(),
        method: init?.method ?? 'GET',
        body: init?.body as string | undefined,
      });

      // Workspace file reads
      if (url.pathname === '/api/files/read') {
        const path = url.searchParams.get('path') || '';
        if (path === 'workspace/main.md' || path === '/workspace/main.md') {
          return createJsonResponse({ ok: true, content: '# Main', mtime: 1 });
        }
        return createJsonResponse({ ok: false, error: 'not found' }, { ok: false, status: 404 });
      }
      // Vault file reads
      if (url.pathname === '/api/vault/read') {
        const path = url.searchParams.get('path');
        if (path === 'Notes/test.md') {
          return createJsonResponse({ ok: true, content: '# Test note', mtime: 1000 });
        }
        return createJsonResponse({ ok: false, error: 'vault file not found' }, { ok: false, status: 404 });
      }
      return createJsonResponse({ ok: false }, { ok: false, status: 404 });
    });
    global.fetch = fetchSpy;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('routes vault paths to /api/vault/read when vaultRoot is set', async () => {
    const vaultRoot = '/home/alex/Documents/Obsidian';
    const { result } = renderHook(() => useOpenFiles('main', { vaultRoot }));

    await act(async () => {
      await result.current.openFile('Notes/test.md');
    });

    await waitFor(() => {
      expect(result.current.openFiles.some((f) => f.path === 'Notes/test.md')).toBe(true);
    });

    const readFetches = trackedFetches.filter((f) => f.url.includes('/api/vault/read'));
    expect(readFetches).toHaveLength(1);
    expect(readFetches[0].url).toContain('path=Notes%2Ftest.md');
  });

  it('routes non-vault paths to /api/files/read when vaultRoot is set', async () => {
    // Workspace paths start with '/' (absolute), vault paths don't.
    // When vaultRoot is set, paths with leading '/' go to workspace API.
    const vaultRoot = '/home/alex/Documents/Obsidian';
    const { result } = renderHook(() => useOpenFiles('main', { vaultRoot }));

    await act(async () => {
      await result.current.openFile('/workspace/main.md');
    });

    await waitFor(() => {
      expect(result.current.openFiles.some((f) => f.path === '/workspace/main.md')).toBe(true);
    });

    const readFetches = trackedFetches.filter((f) => f.url.includes('/api/files/read'));
    expect(readFetches).toHaveLength(1);
    expect(readFetches[0].url).toContain('api/files/read');
  });

  it('routes vault paths to /api/vault/write when saving a vault file', async () => {
    const vaultRoot = '/home/alex/Documents/Obsidian';
    const { result } = renderHook(() => useOpenFiles('main', { vaultRoot }));

    // First open the vault file
    await act(async () => {
      await result.current.openFile('Notes/test.md');
    });
    await waitFor(() => expect(result.current.openFiles.find((f) => f.path === 'Notes/test.md')?.loading).toBe(false));

    // Update content (make it dirty)
    await act(async () => {
      result.current.updateContent('Notes/test.md', '# Updated note content');
    });

    // Save the file
    await act(async () => {
      await result.current.saveFile('Notes/test.md');
    });

    const writeFetches = trackedFetches.filter((f) => f.method === 'PUT' && f.url.includes('/api/vault/write'));
    expect(writeFetches).toHaveLength(1);
    expect(writeFetches[0].body).toContain('"path":"Notes/test.md"');
    expect(writeFetches[0].body).toContain('"content":"# Updated note content"');
  });

  it('does not route to vault endpoints when vaultRoot is not set', async () => {
    const { result } = renderHook(() => useOpenFiles('main'));

    await act(async () => {
      await result.current.openFile('Notes/test.md');
    });

    await waitFor(() => {
      expect(result.current.openFiles.some((f) => f.path === 'Notes/test.md')).toBe(true);
    });

    const vaultFetches = trackedFetches.filter((f) => f.url.includes('/api/vault'));
    expect(vaultFetches).toHaveLength(0);
  });
});