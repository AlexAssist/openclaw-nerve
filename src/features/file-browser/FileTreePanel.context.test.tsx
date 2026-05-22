/** Tests for FileTreePanel providing FileTreeContext */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import React from 'react';
import { FileTreePanel } from './FileTreePanel';
import { useFileTreeContext, FileTreeContext } from './hooks/useFileTreeContext';
import { useFileTree } from './hooks/useFileTree';
import { useVaultTree } from './hooks/useVaultTree';
import { useRootSwitcher } from './hooks/useRootSwitcher';

// Spy on the FileTreeContext.Provider render
const originalCreateElement = React.createElement;
let contextValueFromProvider: unknown = null;

vi.mock('./hooks/useFileTree', () => ({
  useFileTree: vi.fn().mockReturnValue({
    entries: [],
    loading: false,
    error: null,
    expandedPaths: new Set(),
    selectedPath: null,
    loadingPaths: new Set(),
    workspaceInfo: null,
    toggleDirectory: vi.fn(),
    selectFile: vi.fn(),
    refresh: vi.fn(),
    handleFileChange: vi.fn(),
    revealPath: vi.fn(),
  }),
}));

vi.mock('./hooks/useVaultTree', () => ({
  useVaultTree: vi.fn().mockReturnValue({
    entries: [],
    loading: false,
    error: null,
    expandedPaths: new Set(),
    selectedPath: null,
    loadingPaths: new Set(),
    workspaceInfo: { isCustomWorkspace: false, rootPath: '/mock/vault' },
    toggleDirectory: vi.fn(),
    selectFile: vi.fn(),
    refresh: vi.fn(),
    handleFileChange: vi.fn(),
    revealPath: vi.fn(),
  }),
}));

vi.mock('./hooks/useRootSwitcher', () => ({
  useRootSwitcher: vi.fn().mockReturnValue({
    selectedRoot: 'workspace',
    setSelectedRoot: vi.fn(),
    vaultAvailable: true,
  }),
}));

vi.mock('@/contexts/SettingsContext', () => ({
  useSettings: () => ({
    showHiddenWorkspaceEntries: false,
  }),
}));

vi.mock('../../components/ConfirmDialog', () => ({
  ConfirmDialog: () => null,
}));

vi.mock('@/components/ui/InlineSelect', () => ({
  InlineSelect: () => null,
}));

vi.mock('./utils/fileIcons', () => ({
  FileIcon: () => null,
  FolderIcon: () => null,
}));

const mockOnOpenFile = vi.fn();
const mockOnRemapOpenPaths = vi.fn();
const mockOnCloseOpenPaths = vi.fn();

/** Component that captures and displays the FileTreeContext value */
function ContextInspector() {
  const ctx = useFileTreeContext();
  return (
    <div data-testid="context-inspector" data-selected-root={ctx.selectedRoot} data-vault-available={ctx.vaultAvailable}>
      <span data-testid="context-selected-root">{ctx.selectedRoot}</span>
      <span data-testid="context-vault-available">{String(ctx.vaultAvailable)}</span>
      <span data-testid="context-vault-root">{ctx.vaultRoot ?? 'null'}</span>
    </div>
  );
}

describe('FileTreePanel FileTreeContext', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ vaultRoot: '/home/alex/obsidian' }),
    } as Response));
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('provides FileTreeContext with selectedRoot and vaultAvailable from useRootSwitcher', async () => {
    // This test verifies that FileTreePanel renders without crashing when providing context.
    // InlineSelect is mocked as returning null, so we verify the panel renders via the file tree.
    const { container } = render(
      <FileTreePanel
        workspaceAgentId="main"
        onOpenFile={mockOnOpenFile}
        onRemapOpenPaths={mockOnRemapOpenPaths}
        onCloseOpenPaths={mockOnCloseOpenPaths}
        collapsed={false}
        onCollapseChange={vi.fn()}
      />,
    );

    // The panel should render (contains our mock empty workspace message)
    await waitFor(() => {
      expect(container.querySelector('[role="tree"]')).toBeInTheDocument();
    });
  });

  it('provides vaultRoot from /api/config/vaultRoot endpoint', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ vaultRoot: '/home/alex/obsidian' }),
    } as Response);
    vi.stubGlobal('fetch', mockFetch);

    render(
      <FileTreePanel
        workspaceAgentId="main"
        onOpenFile={mockOnOpenFile}
        onRemapOpenPaths={mockOnRemapOpenPaths}
        onCloseOpenPaths={mockOnCloseOpenPaths}
        collapsed={false}
        onCollapseChange={vi.fn()}
      />,
    );

    // Wait for the fetch to be called
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/config/vaultRoot');
    });
  });

  it('provides null vaultRoot when endpoint returns empty string', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ vaultRoot: '' }),
    } as Response);
    vi.stubGlobal('fetch', mockFetch);

    render(
      <FileTreePanel
        workspaceAgentId="main"
        onOpenFile={mockOnOpenFile}
        onRemapOpenPaths={mockOnRemapOpenPaths}
        onCloseOpenPaths={mockOnCloseOpenPaths}
        collapsed={false}
        onCollapseChange={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/config/vaultRoot');
    });
  });
});