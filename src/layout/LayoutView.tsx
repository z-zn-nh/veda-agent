import { AlertCircle, Columns2, Rows2, X } from 'lucide-react';
import { memo, useCallback, useRef } from 'react';
import { Tooltip } from '../ui/Tooltip';
import { Divider } from './Divider';
import { PANE_REGISTRY } from './registry';
import type { LayoutNode, LayoutState, PaneStatus } from './types';

export interface LayoutActions {
  focus: (paneId: string) => void;
  close: (paneId: string) => void;
  split: (paneId: string, direction: 'row' | 'column') => void;
  ratio: (splitId: string, ratio: number) => void;
  status: (paneId: string, status: PaneStatus) => void;
}

interface LayoutViewProps {
  state: LayoutState;
  actions: LayoutActions;
}

/** Renders the layout tree. Splits recurse; only tab groups draw chrome. */
export const LayoutView = memo(function LayoutView({ state, actions }: LayoutViewProps) {
  return <Node node={state.root} state={state} actions={actions} />;
});

function Node({ node, state, actions }: { node: LayoutNode; state: LayoutState; actions: LayoutActions }) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  if (node.kind === 'tabs') {
    return <Group node={node} state={state} actions={actions} />;
  }

  const [first, second] = node.children;
  const handleRatio = (ratio: number) => actions.ratio(node.id, ratio);

  return (
    <div ref={containerRef} className={`split split-${node.direction}`}>
      <div className="split-part" style={{ flexBasis: `${node.ratio * 100}%` }}>
        <Node node={first} state={state} actions={actions} />
      </div>
      <Divider
        direction={node.direction}
        ratio={node.ratio}
        onRatio={handleRatio}
        containerRef={containerRef}
        label={node.direction === 'row' ? 'Resize columns' : 'Resize rows'}
      />
      <div className="split-part split-part-grow">
        <Node node={second} state={state} actions={actions} />
      </div>
    </div>
  );
}

function Group({ node, state, actions }: { node: LayoutNode & { kind: 'tabs' }; state: LayoutState; actions: LayoutActions }) {
  const activeId = node.activePaneId ?? node.paneIds[0] ?? null;
  const activePane = activeId ? state.panes[activeId] : undefined;
  const View = activePane ? PANE_REGISTRY[activePane.target.kind].view : null;
  const single = node.paneIds.length === 1;

  const onStatus = useCallback((status: PaneStatus) => {
    if (activeId) actions.status(activeId, status);
  }, [actions, activeId]);

  if (!activePane || !View || !activeId) {
    return (
      <div className="group group-empty">
        <span className="group-hint">No pane</span>
      </div>
    );
  }

  return (
    <div className={`group ${single ? 'is-single' : ''}`}>
      <div className="group-bar">
        <div className="tabs" role="tablist" aria-label="Open panes">
          {node.paneIds.map((paneId) => {
            const pane = state.panes[paneId];
            if (!pane) return null;
            const Icon = PANE_REGISTRY[pane.target.kind].icon;
            const isActive = paneId === activeId;
            return (
              <button
                key={paneId}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={`tab ${isActive ? 'is-active' : ''}`}
                onClick={() => actions.focus(paneId)}
              >
                <Icon size={13} strokeWidth={1.8} />
                <span className="tab-label">{pane.title}</span>
                {/* §0.2:未保存/失败不能只靠颜色 —— 形状与文字各给一条第二信号。 */}
                {pane.status === 'dirty' ? (
                  <span className="tab-dirty" role="img" aria-label="Unsaved" title="Unsaved" />
                ) : null}
                {pane.status === 'error' ? (
                  <span className="tab-failed" title="Save failed">
                    <AlertCircle size={11} strokeWidth={1.8} aria-hidden="true" />
                    Save failed
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
        <div className="group-actions">
          <Tooltip label="Split horizontally">
            <button type="button" className="v-icon group-action" aria-label="Split horizontally" onClick={() => actions.split(activeId, 'row')}>
              <Columns2 size={14} strokeWidth={1.8} />
            </button>
          </Tooltip>
          <Tooltip label="Split vertically">
            <button type="button" className="v-icon group-action" aria-label="Split vertically" onClick={() => actions.split(activeId, 'column')}>
              <Rows2 size={14} strokeWidth={1.8} />
            </button>
          </Tooltip>
          <Tooltip label="Close pane">
            <button type="button" className="v-icon group-action" aria-label="Close pane" onClick={() => actions.close(activeId)}>
              <X size={14} strokeWidth={1.8} />
            </button>
          </Tooltip>
        </div>
      </div>
      <div className="group-body">
        <View pane={activePane} onStatus={onStatus} />
      </div>
    </div>
  );
}
