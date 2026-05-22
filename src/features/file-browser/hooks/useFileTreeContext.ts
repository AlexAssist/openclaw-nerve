import { createContext, useContext } from 'react';
import type { FileTreeRoot } from './useRootSwitcher';

export interface FileTreeContextValue {
  selectedRoot: FileTreeRoot;
  vaultRoot: string | null;
  vaultAvailable: boolean;
  setSelectedRoot: (root: FileTreeRoot) => void;
}

export const FileTreeContext = createContext<FileTreeContextValue | null>(null);

export function useFileTreeContext(): FileTreeContextValue {
  const context = useContext(FileTreeContext);
  if (!context) {
    throw new Error('useFileTreeContext must be used within a FileTreeContext.Provider');
  }
  return context;
}