import { Bot, FileText, SquareKanban } from 'lucide-react';
import type { ComponentType } from 'react';
import { AgentPanel } from '../features/agent/AgentPanel';
import { BoardPanel } from '../features/board/BoardPanel';
import { NotesPanel } from '../features/notes/NotesPanel';
import type { PaneKind, PaneRecord, PaneStatus } from './types';

/** Props every pane view receives. Panes render content only — the host owns tabs/chrome. */
export interface PaneViewProps {
  pane: PaneRecord;
  onStatus: (status: PaneStatus) => void;
}

export interface PaneDefinition {
  kind: PaneKind;
  label: string;
  icon: ComponentType<{ size?: number | string; strokeWidth?: number | string }>;
  view: ComponentType<PaneViewProps>;
}

/**
 * The single place that knows which component backs which pane kind.
 * Adding a tool means adding one entry here — nothing in the layout renderer changes.
 */
export const PANE_REGISTRY: Record<PaneKind, PaneDefinition> = {
  agent: { kind: 'agent', label: 'Agent', icon: Bot, view: AgentPanel },
  notes: { kind: 'notes', label: 'Notes', icon: FileText, view: NotesPanel },
  board: { kind: 'board', label: 'Board', icon: SquareKanban, view: BoardPanel },
};

export const PANE_KINDS: PaneKind[] = ['agent', 'notes', 'board'];
