import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRootSwitcher, loadSavedRoot, saveRoot, type FileTreeRoot } from './useRootSwitcher';

describe('useRootSwitcher', () => {
  let mockLocalStorage: Record<string, string>;

  beforeEach(() => {
    mockLocalStorage = {};
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => mockLocalStorage[key] ?? null,
      setItem: (key: string, value: string) => { mockLocalStorage[key] = value; },
      removeItem: (key: string) => { delete mockLocalStorage[key]; },
      clear: () => { mockLocalStorage = {}; },
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true } as Response));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('loadSavedRoot', () => {
    it('returns workspace when nothing is saved', () => {
      expect(loadSavedRoot()).toBe('workspace');
    });

    it('returns workspace when invalid value is saved', () => {
      mockLocalStorage['nerve:file-tree:root'] = 'invalid';
      expect(loadSavedRoot()).toBe('workspace');
    });

    it('returns vault when vault is saved', () => {
      mockLocalStorage['nerve:file-tree:root'] = 'vault';
      expect(loadSavedRoot()).toBe('vault');
    });

    it('returns workspace when workspace is saved', () => {
      mockLocalStorage['nerve:file-tree:root'] = 'workspace';
      expect(loadSavedRoot()).toBe('workspace');
    });
  });

  describe('saveRoot', () => {
    it('saves workspace to localStorage', () => {
      saveRoot('workspace');
      expect(mockLocalStorage['nerve:file-tree:root']).toBe('workspace');
    });

    it('saves vault to localStorage', () => {
      saveRoot('vault');
      expect(mockLocalStorage['nerve:file-tree:root']).toBe('vault');
    });
  });

  describe('useRootSwitcher hook', () => {
    it('initializes with saved root from localStorage', () => {
      mockLocalStorage['nerve:file-tree:root'] = 'vault';
      const { result } = renderHook(() => useRootSwitcher());
      expect(result.current.selectedRoot).toBe('vault');
    });

    it('initializes with workspace when nothing is saved', () => {
      const { result } = renderHook(() => useRootSwitcher());
      expect(result.current.selectedRoot).toBe('workspace');
    });

    it('calls setSelectedRoot and persists to localStorage', async () => {
      const { result } = renderHook(() => useRootSwitcher());
      expect(mockLocalStorage['nerve:file-tree:root']).toBeUndefined();

      await act(async () => {
        result.current.setSelectedRoot('vault');
      });

      expect(result.current.selectedRoot).toBe('vault');
      expect(mockLocalStorage['nerve:file-tree:root']).toBe('vault');
    });

    it('updates to workspace and persists', async () => {
      mockLocalStorage['nerve:file-tree:root'] = 'vault';
      const { result } = renderHook(() => useRootSwitcher());

      await act(async () => {
        result.current.setSelectedRoot('workspace');
      });

      expect(result.current.selectedRoot).toBe('workspace');
      expect(mockLocalStorage['nerve:file-tree:root']).toBe('workspace');
    });
  });
});