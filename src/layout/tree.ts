/**
 * Pure operations on the layout tree.
 *
 * Everything here returns new state; the React layer only calls these and re-renders.
 * Keeping it framework-free means the tricky parts (collapse on close, focus handoff,
 * ratio clamping) are verifiable without mounting anything.
 */
import {
  MAX_RATIO,
  MIN_RATIO,
  type LayoutNode,
  type LayoutState,
  type PaneKind,
  type PaneRecord,
  type PaneStatus,
  type PaneTarget,
} from './types';

let idCounter = 0;
/** Ids only need to be unique within a session; layout persistence stores them as-is. */
export function makeId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter.toString(36)}`;
}

export function createPane(target: PaneTarget, title: string): PaneRecord {
  return { paneId: makeId('pane'), target, title, status: 'ready' };
}

const DEFAULT_TITLES: Record<PaneKind, string> = {
  agent: 'Agent',
  notes: 'Notes',
  board: 'Board',
};

export function titleFor(target: PaneTarget): string {
  return DEFAULT_TITLES[target.kind];
}

export function initialState(): LayoutState {
  const pane = createPane({ kind: 'agent', workspaceId: 'placeholder', entityId: '' }, DEFAULT_TITLES.agent);
  return {
    panes: { [pane.paneId]: pane },
    root: { kind: 'tabs', id: makeId('group'), paneIds: [pane.paneId], activePaneId: pane.paneId },
    focusedPaneId: pane.paneId,
  };
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function collectPaneIds(node: LayoutNode): string[] {
  return node.kind === 'tabs' ? [...node.paneIds] : [...collectPaneIds(node.children[0]), ...collectPaneIds(node.children[1])];
}

export function findGroupId(node: LayoutNode, paneId: string): string | null {
  if (node.kind === 'tabs') return node.paneIds.includes(paneId) ? node.id : null;
  return findGroupId(node.children[0], paneId) ?? findGroupId(node.children[1], paneId);
}

export function findNode(node: LayoutNode, id: string): LayoutNode | null {
  if (node.id === id) return node;
  if (node.kind === 'tabs') return null;
  return findNode(node.children[0], id) ?? findNode(node.children[1], id);
}

/** The group that keyboard shortcuts and new tabs should target. */
export function firstGroupId(node: LayoutNode): string {
  return node.kind === 'tabs' ? node.id : firstGroupId(node.children[0]);
}

function mapNode(node: LayoutNode, fn: (n: LayoutNode) => LayoutNode): LayoutNode {
  // 叶子只变换一次、不再下钻：splitPane 会把叶子换成子树，而子树的第一个孩子
  // 就是这同一个叶子；若继续递归就会再次命中它，造成无限递归。
  if (node.kind === 'tabs') return fn(node);
  const mapped: LayoutNode = {
    ...node,
    children: [mapNode(node.children[0], fn), mapNode(node.children[1], fn)],
  };
  return fn(mapped);
}

/** Drops empty groups and collapses splits that lost a child. */
export function prune(node: LayoutNode): LayoutNode | null {
  if (node.kind === 'tabs') return node.paneIds.length > 0 ? node : null;
  const left = prune(node.children[0]);
  const right = prune(node.children[1]);
  if (!left) return right;
  if (!right) return left;
  return { ...node, children: [left, right] };
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export function addPane(state: LayoutState, target: PaneTarget, groupId?: string): LayoutState {
  const pane = createPane(target, titleFor(target));
  // 新面板落在当前聚焦的分组，而不是永远落在第一个分组。
  const anchor = state.focusedPaneId ?? collectPaneIds(state.root)[0] ?? null;
  const targetGroup = groupId ?? (anchor ? findGroupId(state.root, anchor) : null) ?? firstGroupId(state.root);
  const root = mapNode(state.root, (node) =>
    node.kind === 'tabs' && node.id === targetGroup
      ? { ...node, paneIds: [...node.paneIds, pane.paneId], activePaneId: pane.paneId }
      : node,
  );
  return { panes: { ...state.panes, [pane.paneId]: pane }, root, focusedPaneId: pane.paneId };
}

export function removePane(state: LayoutState, paneId: string): LayoutState {
  const groupId = findGroupId(state.root, paneId);
  if (!groupId) return state;

  const root = mapNode(state.root, (node) => {
    if (node.kind !== 'tabs' || node.id !== groupId) return node;
    const paneIds = node.paneIds.filter((id) => id !== paneId);
    // Focus falls back to a neighbour so the group never ends up with no active tab.
    const activePaneId =
      node.activePaneId === paneId ? paneIds[Math.max(0, node.paneIds.indexOf(paneId) - 1)] ?? paneIds[0] ?? null : node.activePaneId;
    return { ...node, paneIds, activePaneId };
  });

  const pruned = prune(root);
  const panes = { ...state.panes };
  delete panes[paneId];
  // Removing the very last pane leaves an empty tree; the caller decides what to show.
  const nextRoot: LayoutNode = pruned ?? { kind: 'tabs', id: makeId('group'), paneIds: [], activePaneId: null };
  // 被移除的面板若正是焦点，焦点让给树上第一个存活面板，避免指向已不存在的 id。
  const focusedPaneId = state.focusedPaneId === paneId ? collectPaneIds(nextRoot)[0] ?? null : state.focusedPaneId;
  return { root: nextRoot, panes, focusedPaneId };
}

/**
 * Splits the group holding `paneId` into two groups along `direction`.
 * The new group starts with a copy of the same kind so the action is visibly useful.
 */
export function splitPane(state: LayoutState, paneId: string, direction: 'row' | 'column'): LayoutState {
  const groupId = findGroupId(state.root, paneId);
  if (!groupId) return state;
  const group = findNode(state.root, groupId);
  if (!group || group.kind !== 'tabs') return state;

  const source = state.panes[paneId];
  if (!source) return state;
  const added = createPane({ ...source.target, entityId: '' }, titleFor(source.target));

  const newGroup: LayoutNode = { kind: 'tabs', id: makeId('group'), paneIds: [added.paneId], activePaneId: added.paneId };
  const root = mapNode(state.root, (node) =>
    node.kind === 'tabs' && node.id === groupId
      ? { kind: 'split', id: makeId('split'), direction, ratio: 0.5, children: [node, newGroup] }
      : node,
  );
  return { panes: { ...state.panes, [added.paneId]: added }, root, focusedPaneId: added.paneId };
}

export function setRatio(state: LayoutState, splitId: string, ratio: number): LayoutState {
  const clamped = Math.min(MAX_RATIO, Math.max(MIN_RATIO, ratio));
  const root = mapNode(state.root, (node) =>
    node.kind === 'split' && node.id === splitId ? { ...node, ratio: clamped } : node,
  );
  return { ...state, root };
}

export function focusPane(state: LayoutState, paneId: string): LayoutState {
  const groupId = findGroupId(state.root, paneId);
  if (!groupId) return state;
  const root = mapNode(state.root, (node) =>
    node.kind === 'tabs' && node.id === groupId ? { ...node, activePaneId: paneId } : node,
  );
  return { ...state, root, focusedPaneId: paneId };
}

export function setPaneStatus(state: LayoutState, paneId: string, status: PaneStatus): LayoutState {
  const pane = state.panes[paneId];
  if (!pane) return state;
  return { ...state, panes: { ...state.panes, [paneId]: { ...pane, status } } };
}

/** Group ids in render order — used to decide where a newly opened pane lands. */
export function groupIds(node: LayoutNode): string[] {
  return node.kind === 'tabs' ? [node.id] : [...groupIds(node.children[0]), ...groupIds(node.children[1])];
}
