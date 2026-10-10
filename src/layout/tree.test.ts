import { describe, expect, it } from 'vitest';
import * as tree from './tree';
import { MAX_RATIO, MIN_RATIO, type LayoutNode, type LayoutState } from './types';

type Split = Extract<LayoutNode, { kind: 'split' }>;
type Tabs = Extract<LayoutNode, { kind: 'tabs' }>;

/**
 * 布局树是不依赖框架的纯逻辑，所以「分割不无限递归」「关掉一个面板后折叠」
 * 这类容易写错的行为可以直接在这里断言，不必挂载 React。
 *
 * 注：`splitPane` 会把叶子换成以该叶子为第一个孩子的子树。早期版本的
 * mapNode 变换后再下钻，于是重新命中同一个叶子，抛 RangeError。
 */
function groups(state: LayoutState): Tabs[] {
  const out: Tabs[] = [];
  const walk = (node: LayoutNode) => {
    if (node.kind === 'tabs') {
      out.push(node);
      return;
    }
    walk(node.children[0]);
    walk(node.children[1]);
  };
  walk(state.root);
  return out;
}

const targets = {
  agent: { kind: 'agent', workspaceId: 'w', entityId: '' },
  notes: { kind: 'notes', workspaceId: 'w', entityId: '' },
  board: { kind: 'board', workspaceId: 'w', entityId: '' },
} as const;

const kindOf = (state: LayoutState, paneId: string | null) => (paneId ? state.panes[paneId].target.kind : null);

describe('initialState', () => {
  it('以一个聚焦的 Agent 面板起步', () => {
    const state = tree.initialState();
    const ids = tree.collectPaneIds(state.root);
    expect(ids).toHaveLength(1);
    expect(state.focusedPaneId).toBe(ids[0]);
    expect(kindOf(state, state.focusedPaneId)).toBe('agent');
  });
});

describe('addPane', () => {
  it('落在焦点分组，而不是永远落在第一个分组', () => {
    let state = tree.initialState();
    state = tree.splitPane(state, state.focusedPaneId!, 'row');
    expect(groups(state).map((g) => g.paneIds.length)).toEqual([1, 1]);

    state = tree.addPane(state, targets.notes);
    expect(groups(state)[0].paneIds).toHaveLength(1);
    expect(groups(state)[1].paneIds).toHaveLength(2);
    expect(groups(state)[1].activePaneId).toBe(state.focusedPaneId);
    expect(kindOf(state, state.focusedPaneId)).toBe('notes');
  });

  it('可显式指定目标分组', () => {
    let state = tree.initialState();
    state = tree.splitPane(state, state.focusedPaneId!, 'row');
    const firstGroupId = groups(state)[0].id;
    state = tree.addPane(state, targets.board, firstGroupId);
    expect(groups(state)[0].paneIds).toHaveLength(2);
    expect(groups(state)[1].paneIds).toHaveLength(1);
  });
});

describe('splitPane', () => {
  it('把目标分组换成两孩子 split，且不无限递归', () => {
    const before = tree.initialState();
    const after = tree.splitPane(before, before.focusedPaneId!, 'row');
    expect(after.root.kind).toBe('split');
    expect(groups(after)).toHaveLength(2);
    expect(tree.collectPaneIds(after.root)).toHaveLength(2);
    // 新面板沿用源面板的 kind，并接管焦点
    expect(kindOf(after, after.focusedPaneId)).toBe('agent');
    expect(after.focusedPaneId).not.toBe(before.focusedPaneId);
  });

  it('在已有 split 的树上继续分割时嵌套而不覆盖', () => {
    const first = tree.initialState();
    const second = tree.splitPane(first, first.focusedPaneId!, 'row');
    const third = tree.splitPane(second, second.focusedPaneId!, 'column');
    expect(groups(third)).toHaveLength(3);
    expect(tree.groupIds(third.root)).toHaveLength(3);
    const directions = [third.root, (third.root as Split).children[0], (third.root as Split).children[1]]
      .filter((n): n is Split => n.kind === 'split')
      .map((n) => n.direction);
    expect(directions).toContain('row');
    expect(directions).toContain('column');
  });

  it('未知 paneId 原样返回', () => {
    const state = tree.initialState();
    expect(tree.splitPane(state, 'nope', 'row')).toBe(state);
  });
});

describe('removePane', () => {
  it('一侧清空时折叠回单个分组，并把焦点交还', () => {
    const first = tree.initialState();
    const second = tree.splitPane(first, first.focusedPaneId!, 'row');
    const third = tree.removePane(second, second.focusedPaneId!);
    expect(third.root.kind).toBe('tabs');
    expect(Object.keys(third.panes)).toHaveLength(1);
    expect(third.focusedPaneId).toBe(tree.collectPaneIds(third.root)[0]);
  });

  it('同组内焦点让给相邻标签', () => {
    let state = tree.initialState();
    const firstPane = state.focusedPaneId!;
    state = tree.addPane(state, targets.notes);
    const notesPane = state.focusedPaneId!;

    const afterClose = tree.removePane(state, notesPane);
    expect(groups(afterClose)[0].activePaneId).toBe(firstPane);
    expect(afterClose.focusedPaneId).toBe(firstPane);
  });

  it('关掉最后一个面板后留下空树且焦点为空', () => {
    const state = tree.initialState();
    const empty = tree.removePane(state, state.focusedPaneId!);
    expect(tree.collectPaneIds(empty.root)).toHaveLength(0);
    expect(Object.keys(empty.panes)).toHaveLength(0);
    expect(empty.focusedPaneId).toBeNull();
  });

  it('未知 paneId 原样返回', () => {
    const state = tree.initialState();
    expect(tree.removePane(state, 'nope')).toBe(state);
  });
});

describe('setRatio', () => {
  it('裁剪到允许区间，且不动焦点', () => {
    const first = tree.initialState();
    const second = tree.splitPane(first, first.focusedPaneId!, 'row');
    const splitId = (second.root as Split).id;

    expect((tree.setRatio(second, splitId, 0.02).root as Split).ratio).toBe(MIN_RATIO);
    expect((tree.setRatio(second, splitId, 0.99).root as Split).ratio).toBe(MAX_RATIO);
    expect((tree.setRatio(second, splitId, 0.4).root as Split).ratio).toBeCloseTo(0.4);
    expect(tree.setRatio(second, splitId, 0.4).focusedPaneId).toBe(second.focusedPaneId);
  });
});

describe('focusPane', () => {
  it('同时更新组内活动标签与全局焦点', () => {
    let state = tree.initialState();
    state = tree.addPane(state, targets.notes);
    const first = tree.collectPaneIds(state.root)[0];

    const focused = tree.focusPane(state, first);
    expect(focused.focusedPaneId).toBe(first);
    expect(groups(focused)[0].activePaneId).toBe(first);
  });

  it('未知 paneId 原样返回', () => {
    const state = tree.initialState();
    expect(tree.focusPane(state, 'nope')).toBe(state);
  });
});

describe('prune', () => {
  it('丢弃空分组，并把只剩一侧的 split 提升为那个孩子', () => {
    const empty: Tabs = { kind: 'tabs', id: 'g', paneIds: [], activePaneId: null };
    expect(tree.prune(empty)).toBeNull();

    const first = tree.initialState();
    const second = tree.splitPane(first, first.focusedPaneId!, 'row');
    const [left, right] = (second.root as Split).children;
    expect(tree.prune({ kind: 'split', id: 's', direction: 'row', ratio: 0.5, children: [left, empty] })).toBe(left);
    expect(tree.prune({ kind: 'split', id: 's', direction: 'row', ratio: 0.5, children: [empty, right] })).toBe(right);
    expect(tree.prune(second.root)).not.toBeNull();
  });
});

describe('持久化重建', () => {
  it('只保留仍在树上的 pane 记录', () => {
    const first = tree.initialState();
    const second = tree.splitPane(first, first.focusedPaneId!, 'row');
    const third = tree.removePane(second, second.focusedPaneId!);

    // 与 useLayout.load 相同的重建步骤：树上没有的 pane 记录必须被丢弃。
    const live = new Set(tree.collectPaneIds(third.root));
    expect(live.size).toBe(Object.keys(third.panes).length);
    expect([...live].every((id) => third.panes[id])).toBe(true);
  });
});
