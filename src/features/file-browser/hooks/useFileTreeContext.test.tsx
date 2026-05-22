import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import React from 'react';
import { useFileTreeContext, FileTreeContext } from './useFileTreeContext';

describe('useFileTreeContext', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('throws when context is not provided', () => {
    // Rendering outside a provider should throw
    expect(() => renderHook(() => useFileTreeContext())).toThrow();
  });

  it('returns selectedRoot, vaultRoot, vaultAvailable, and setSelectedRoot from context', async () => {
    const mockSetSelectedRoot = vi.fn();
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ vaultRoot: '/home/alex/vault' }),
    } as Response);
    vi.stubGlobal('fetch', mockFetch);

    const { result } = renderHook(() => useFileTreeContext(), {
      wrapper: ({ children }) => (
        <FileTreeContext.Provider
          value={{
            selectedRoot: 'workspace',
            vaultRoot: '/home/alex/vault',
            vaultAvailable: true,
            setSelectedRoot: mockSetSelectedRoot,
          }}
        >
          {children}
        </FileTreeContext.Provider>
      ),
    });

    // Context should have these properties
    expect(result.current.selectedRoot).toBe('workspace');
    expect(typeof result.current.setSelectedRoot).toBe('function');
    expect(result.current.vaultAvailable).toBe(true);
    expect(result.current.vaultRoot).toBe('/home/alex/vault');
  });
});