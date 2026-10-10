import { useCallback, useEffect, useMemo, useState } from 'react';
import * as tree from './tree';
import type { LayoutState, PaneKind, PaneStatus } from './types';

/* Placeholder persistence key; the product name is not fixed yet. */
const STORAGE_KEY = 'veda-agent:layout:v1';

function load(): LayoutState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return tree.initialState();
    const parsed = JSON.parse(raw) as LayoutState;
    if (!parsed?.root || !parsed?.panes) return tree.initialState();
    // Rebuild from the tree so stale pane records can never outlive their tab.
    const live = new Set(tree.collectPaneIds(parsed.root));
    const panes: LayoutState['panes'] = {};
    for (const id of live) {
      const pane = parsed.panes[id];
      if (pane) panes[id] = { ...pane, status: 'ready' };
    }
    const pruned = tree.prune(parsed.root);
    if (!pruned || live.size === 0) return tree.initialState();
    // 旧数据可能没有 focusedPaneId；回退到树上第一个存活面板。
    const focused = parsed.focusedPaneId && panes[parsed.focusedPaneId] ? parsed.focusedPaneId : live.values().next().value ?? null;
    return { root: pruned, panes, focusedPaneId: focused };
  } catch {
    return tree.initialState();
  }
}

export function useLayout() {
  const [state, setState] = useState<LayoutState>(() => load());

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* storage may be unavailable; layout simply will not persist */
    }
  }, [state]);

  const openPane = useCallback((kind: PaneKind) => {
    setState((current) => {
      // An existing pane of this kind is focused rather than duplicated — the toolbar
      // entry means "show me this", not "give me another one".
      const existing = Object.values(current.panes).find((pane) => pane.target.kind === kind);
      if (existing) return tree.focusPane(current, existing.paneId);
      return tree.addPane(current, { kind, workspaceId: 'placeholder', entityId: '' });
    });
  }, []);

  const actions = useMemo(
    () => ({
      focus: (paneId: string) => setState((current) => tree.focusPane(current, paneId)),
      close: (paneId: string) => setState((current) => tree.removePane(current, paneId)),
      split: (paneId: string, direction: 'row' | 'column') => setState((current) => tree.splitPane(current, paneId, direction)),
      ratio: (splitId: string, ratio: number) => setState((current) => tree.setRatio(current, splitId, ratio)),
      status: (paneId: string, status: PaneStatus) => setState((current) => tree.setPaneStatus(current, paneId, status)),
    }),
    [],
  );

  /** The pane the toolbar highlights and global shortcuts would target. */
  /** 工具栏高亮跟随焦点面板，而不是树里排第一的那个。 */
  const activeKind = useMemo(
    () => (state.focusedPaneId ? state.panes[state.focusedPaneId]?.target.kind ?? null : null),
    [state],
  );

  return { state, actions, openPane, activeKind };
}
