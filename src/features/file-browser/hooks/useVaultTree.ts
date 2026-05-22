/**
 * useVaultTree — file tree hook for the Obsidian vault.
 *
 * Mirrors useFileTree but calls /api/vault/tree instead of /api/files/tree.
 * No workspace isolation (agent-scoped state) — vault is single-root.
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import type { TreeEntry } from '../types';

function buildVaultTreeUrl(dirPath: string, showHiddenEntries: boolean): string {
  const params = new URLSearchParams({ depth: '1' });
  if (showHiddenEntries) params.set('showHidden', 'true');
  if (dirPath) params.set('path', dirPath);
  return `/api/vault/tree?${params.toString()}`;
}

function mergeChildren(
  entries: TreeEntry[],
  parentPath: string,
  children: TreeEntry[],
): TreeEntry[] {
  return entries.map((entry) => {
    if (entry.path === parentPath && entry.type === 'directory') {
      return { ...entry, children };
    }
    if (entry.children && entry.type === 'directory') {
      return { ...entry, children: mergeChildren(entry.children, parentPath, children) };
    }
    return entry;
  });
}

function findEntry(entries: TreeEntry[], targetPath: string): TreeEntry | null {
  for (const entry of entries) {
    if (entry.path === targetPath) return entry;
    if (entry.type === 'directory' && entry.children) {
      const found = findEntry(entry.children, targetPath);
      if (found) return found;
    }
  }
  return null;
}

/** Hook for managing vault file tree state. */
export function useVaultTree(showHiddenEntries = false) {
  const [entries, setEntries] = useState<TreeEntry[]>([]);
  const entriesRef = useRef<TreeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [loadingPaths, setLoadingPaths] = useState<Set<string>>(new Set());
  const [workspaceInfo, setWorkspaceInfo] = useState<{ isCustomWorkspace: boolean; rootPath: string } | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);

  const fetchChildren = useCallback(async (dirPath: string): Promise<TreeEntry[] | null> => {
    try {
      const res = await fetch(buildVaultTreeUrl(dirPath, showHiddenEntries));
      if (!res.ok) return null;
      const data = await res.json();
      if (data.ok && data.workspaceInfo && mountedRef.current) {
        setWorkspaceInfo(data.workspaceInfo);
      }
      return data.ok ? data.entries : null;
    } catch {
      return null;
    }
  }, [showHiddenEntries]);

  const loadRoot = useCallback(async () => {
    setLoading(true);
    setError(null);
    setEntries([]);
    setLoadingPaths(new Set());
    setWorkspaceInfo(null);

    const children = await fetchChildren('');
    if (!mountedRef.current) return;

    if (children) {
      setEntries(children);
    } else {
      setError('Failed to load vault tree');
    }

    setLoading(false);
  }, [fetchChildren]);

  useEffect(() => {
    void loadRoot();
  }, [loadRoot]);

  const toggleDirectory = useCallback(async (dirPath: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(dirPath)) {
        next.delete(dirPath);
        return next;
      }
      next.add(dirPath);
      return next;
    });

    if (expandedPaths.has(dirPath)) return;

    const entry = findEntry(entries, dirPath);
    if (entry?.children !== null && entry?.children !== undefined) return;

    setLoadingPaths((prev) => new Set([...prev, dirPath]));
    const children = await fetchChildren(dirPath);
    if (!mountedRef.current) return;

    setLoadingPaths((prev) => {
      const next = new Set(prev);
      next.delete(dirPath);
      return next;
    });

    if (children) {
      setEntries((prev) => mergeChildren(prev, dirPath, children));
    }
  }, [entries, expandedPaths, fetchChildren]);

  const selectFile = useCallback((filePath: string) => {
    setSelectedPath(filePath);
  }, []);

  const refresh = useCallback(() => {
    void loadRoot();
  }, [loadRoot]);

  const handleFileChange = useCallback((changedPath: string) => {
    const parentDir = changedPath.includes('/')
      ? changedPath.substring(0, changedPath.lastIndexOf('/'))
      : '';
    if (!parentDir) return;

    // Refresh the parent directory
    const refreshDir = async () => {
      const children = await fetchChildren(parentDir);
      if (!mountedRef.current || !children) return;
      setEntries((prev) => mergeChildren(prev, parentDir, children));
    };
    void refreshDir();
  }, [fetchChildren]);

  const revealPath = useCallback(async (targetPath: string, kind: 'file' | 'directory') => {
    const normalized = targetPath.replace(/^\.\//, '').replace(/^\/+|\/+$/g, '');
    if (!normalized) return;

    const segments = normalized.split('/').filter(Boolean);
    const ancestors = kind === 'directory'
      ? segments.map((_, index) => segments.slice(0, index + 1).join('/'))
      : segments.slice(0, -1).map((_, index) => segments.slice(0, index + 1).join('/'));

    for (const dirPath of ancestors) {
      setExpandedPaths((prev) => {
        if (prev.has(dirPath)) return prev;
        const next = new Set(prev);
        next.add(dirPath);
        return next;
      });

      const entry = findEntry(entriesRef.current, dirPath);
      if (entry?.type !== 'directory') continue;
      if (entry.children !== null && entry.children !== undefined) continue;

      setLoadingPaths((prev) => new Set([...prev, dirPath]));
      const children = await fetchChildren(dirPath);
      if (!mountedRef.current) return;

      setLoadingPaths((prev) => {
        const next = new Set(prev);
        next.delete(dirPath);
        return next;
      });

      if (children) {
        setEntries((prev) => {
          const next = mergeChildren(prev, dirPath, children);
          entriesRef.current = next;
          return next;
        });
      }
    }

    if (kind === 'file') {
      setSelectedPath(normalized);
    }
  }, [fetchChildren]);

  return {
    entries,
    loading,
    error,
    expandedPaths,
    selectedPath,
    loadingPaths,
    workspaceInfo,
    toggleDirectory,
    selectFile,
    refresh,
    handleFileChange,
    revealPath,
  };
}