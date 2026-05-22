# CHANGELOG — Issue #2: Root Switcher Dropdown

## What was done

**Issue:** Root switcher dropdown in FileTreePanel header — switch between Workspace and Vault trees.

### Files added
- `src/features/file-browser/hooks/useRootSwitcher.ts` — new hook managing root selection state (`'workspace'|'vault'`), localStorage persistence via key `nerve:file-tree:root`, and vault availability detection via a ping to `/api/vault/tree`
- `src/features/file-browser/hooks/useRootSwitcher.test.ts` — 10 tests covering load/save of root and hook initialization

### Files modified
- `src/features/file-browser/FileTreePanel.tsx` — replaced the static `<span>` header label with an `<InlineSelect>` wired to `useRootSwitcher`, showing "Workspace" and "Vault" options (vault label appends `⚠` when unavailable)
- `src/features/file-browser/FileTreePanel.test.tsx` — added mock for `useRootSwitcher` and `InlineSelect`; updated 5 existing header/workspace tests that expected static path text to instead assert dropdown presence; added 5 new `root switcher dropdown` tests covering render, default value, saved value, onChange, and unavailable-warning display

### Test summary
| Test | Status |
|------|--------|
| Dropdown renders with Workspace + Vault options | ✓ |
| Defaults to workspace when no root saved | ✓ |
| Shows saved vault when localStorage has vault | ✓ |
| Calls setSelectedRoot on change | ✓ |
| Vault option shows ⚠ when unavailable | ✓ |
| All other existing FileTreePanel tests | ✓ (52 total) |
| useRootSwitcher hook unit tests | ✓ (10 total) |

### Design notes
- The dropdown uses the existing `InlineSelect` component (already used elsewhere in the codebase) to avoid adding a new UI primitive
- Vault availability is detected by a fire-and-forget fetch to `/api/vault/tree` on mount; the `⚠` suffix is informational — the vault option is still selectable
- Selection is persisted to `localStorage` under `nerve:file-tree:root` and restored on next mount
- This feature is independent of custom workspaces; the existing `workspaceInfo.rootPath` display (for custom workspaces) was replaced by the dropdown since both share the header space

### TDD cycles
1. **RED**: wrote first test (dropdown renders) → failed (no dropdown existed)
2. **GREEN**: added `useRootSwitcher` hook + `InlineSelect` in header → test passed
3. **RED→GREEN**: tested persistence/localStorage → hook-level unit tests validated logic separately
4. **RED→GREEN**: tested vault-unavailable warning → `⚠` label in vault option passed