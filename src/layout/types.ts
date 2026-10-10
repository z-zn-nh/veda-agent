/** Pane and layout-tree contracts. Framework-free on purpose so the tree can be unit tested. */

export type PaneKind = 'agent' | 'notes' | 'board';

/**
 * What a pane shows. `workspaceId`/`entityId` are neutral identifiers until the
 * workspace and content services exist; nothing here assumes a specific backend.
 */
export interface PaneTarget {
  kind: PaneKind;
  workspaceId: string;
  entityId: string;
}

export type PaneStatus = 'ready' | 'dirty' | 'saving' | 'error';

export interface PaneRecord {
  paneId: string;
  target: PaneTarget;
  title: string;
  status: PaneStatus;
}

/**
 * Recursive layout tree.
 *
 * `split` always has exactly two children with `ratio` being the share (0..1) of the
 * first child. `tabs` is a leaf holding one or more panes. A node with no panes is
 * never kept: `prune` collapses it so the tree can't accumulate empty groups.
 */
export type LayoutNode =
  | { kind: 'split'; id: string; direction: 'row' | 'column'; ratio: number; children: [LayoutNode, LayoutNode] }
  | { kind: 'tabs'; id: string; paneIds: string[]; activePaneId: string | null };

export interface LayoutState {
  root: LayoutNode;
  panes: Record<string, PaneRecord>;
  /** 最近聚焦的面板：工具栏高亮与新建面板的落点都以它为锚点。 */
  focusedPaneId: string | null;
}

export const MIN_RATIO = 0.15;
export const MAX_RATIO = 0.85;
