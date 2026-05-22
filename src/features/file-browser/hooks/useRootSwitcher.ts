import { useState, useCallback, useEffect } from 'react';

export type FileTreeRoot = 'workspace' | 'vault';

const ROOT_STORAGE_KEY = 'nerve:file-tree:root';

export function loadSavedRoot(): FileTreeRoot {
  try {
    const stored = localStorage.getItem(ROOT_STORAGE_KEY);
    if (stored === 'vault' || stored === 'workspace') return stored;
  } catch { /* ignore */ }
  return 'workspace';
}

export function saveRoot(root: FileTreeRoot) {
  try {
    localStorage.setItem(ROOT_STORAGE_KEY, root);
  } catch { /* ignore */ }
}

/**
 * Hook for managing the selected file tree root (workspace vs vault).
 *
 * @param vaultMode - when true, initial state is 'vault' regardless of localStorage.
 *                    The dropdown can still override this at runtime.
 */
export function useRootSwitcher(vaultMode?: boolean) {
  const [selectedRoot, setSelectedRootState] = useState<FileTreeRoot>(() => {
    if (vaultMode) return 'vault';
    return loadSavedRoot();
  });
  const [vaultAvailable, setVaultAvailable] = useState(true);

  // Check vault availability on mount
  useEffect(() => {
    // Ping the vault tree endpoint to see if a vault is configured
    fetch('/api/vault/tree?depth=1')
      .then((res) => {
        setVaultAvailable(res.ok);
      })
      .catch(() => setVaultAvailable(false));
  }, []);

  const setSelectedRoot = useCallback((root: FileTreeRoot) => {
    setSelectedRootState(root);
    saveRoot(root);
  }, []);

  return { selectedRoot, setSelectedRoot, vaultAvailable };
}