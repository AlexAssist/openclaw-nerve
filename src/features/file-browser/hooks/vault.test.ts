/**
 * Tests for useVaultTree hook — mirrors useFileTree but calls /api/vault/tree.
 *
 * Behaviors tested:
 * 1. useVaultTree calls GET /api/vault/tree with correct params (depth, showHidden)
 * 2. Returns same { entries, root, workspaceInfo } shape as useFileTree
 * 3. Loads entries on mount
 * 4. Handles fetch errors gracefully
 * 5. Returns all expected return properties
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useVaultTree } from './useVaultTree';
import type { TreeEntry } from '../types';

// Mock fetch globally
global.fetch = vi.fn();

function getRequestUrl(input: RequestInfo | URL): URL {
  if (typeof input === 'string') return new URL(input, 'http://localhost');
  if (input instanceof URL) return new URL(input.toString(), 'http://localhost');
  return new URL(input.url, 'http://localhost');
}

describe('useVaultTree', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('API endpoint', () => {
    it('calls GET /api/vault/tree on mount', async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          ok: true,
          root: '.',
          entries: [],
          workspaceInfo: { isCustomWorkspace: false, rootPath: '/home/user/Obsidian' },
        }),
      } as Response);

      renderHook(() => useVaultTree());

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });

      const requestUrl = getRequestUrl(mockFetch.mock.calls[0]![0]);
      expect(requestUrl.pathname).toBe('/api/vault/tree');
    });

    it('sends depth=1 by default', async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true, root: '.', entries: [], workspaceInfo: null }),
      } as Response);

      renderHook(() => useVaultTree());

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });

      const requestUrl = getRequestUrl(mockFetch.mock.calls[0]![0]);
      expect(requestUrl.searchParams.get('depth')).toBe('1');
    });

    it('sends showHidden=true when showHiddenEntries is true', async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true, root: '.', entries: [], workspaceInfo: null }),
      } as Response);

      renderHook(() => useVaultTree(true));

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });

      const requestUrl = getRequestUrl(mockFetch.mock.calls[0]![0]);
      expect(requestUrl.searchParams.get('showHidden')).toBe('true');
    });
  });

  describe('return shape', () => {
    it('returns entries, loading, error, expandedPaths, selectedPath, loadingPaths, workspaceInfo', async () => {
      const mockFetch = vi.mocked(fetch);
      const mockEntries: TreeEntry[] = [
        { name: 'test.md', path: 'test.md', type: 'file' as const, children: null },
      ];
      const mockWorkspaceInfo = { isCustomWorkspace: false, rootPath: '/home/user/Obsidian' };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          ok: true,
          root: '.',
          entries: mockEntries,
          workspaceInfo: mockWorkspaceInfo,
        }),
      } as Response);

      const { result } = renderHook(() => useVaultTree());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      const keys = Object.keys(result.current);
      expect(keys).toContain('entries');
      expect(keys).toContain('loading');
      expect(keys).toContain('error');
      expect(keys).toContain('expandedPaths');
      expect(keys).toContain('selectedPath');
      expect(keys).toContain('loadingPaths');
      expect(keys).toContain('workspaceInfo');
    });

    it('populates entries from API response', async () => {
      const mockEntries: TreeEntry[] = [
        { name: 'Projects', path: 'Projects', type: 'directory' as const, children: null },
        { name: 'README.md', path: 'README.md', type: 'file' as const, children: null },
      ];

      const mockFetch = vi.mocked(fetch);
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          ok: true,
          root: '.',
          entries: mockEntries,
          workspaceInfo: { isCustomWorkspace: false, rootPath: '/home/user/Obsidian' },
        }),
      } as Response);

      const { result } = renderHook(() => useVaultTree());

      await waitFor(() => {
        expect(result.current.entries).toHaveLength(2);
      });

      expect(result.current.entries[0]!.path).toBe('Projects');
      expect(result.current.entries[1]!.path).toBe('README.md');
    });

    it('sets workspaceInfo from API response', async () => {
      const mockFetch = vi.mocked(fetch);
      const mockWorkspaceInfo = { isCustomWorkspace: false, rootPath: '/home/user/Obsidian' };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          ok: true,
          root: '.',
          entries: [],
          workspaceInfo: mockWorkspaceInfo,
        }),
      } as Response);

      const { result } = renderHook(() => useVaultTree());

      await waitFor(() => {
        expect(result.current.workspaceInfo).toEqual(mockWorkspaceInfo);
      });
    });

    it('handles fetch errors gracefully', async () => {
      const mockFetch = vi.mocked(fetch);
      mockFetch.mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() => useVaultTree());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
        expect(result.current.error).toBeTruthy();
      });
    });
  });
});