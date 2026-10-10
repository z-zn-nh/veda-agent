import { Hand, MousePointer2, Plus, StickyNote, Type, ZoomIn, ZoomOut } from 'lucide-react';
import { useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Tooltip } from '../../ui/Tooltip';
import type { PaneViewProps } from '../../layout/registry';

type BoardObject = { id: string; x: number; y: number; title: string; body: string };

const SEED: BoardObject[] = [
  { id: 'direction', x: 16, y: 18, title: 'Direction', body: 'Keep the workspace calm and composable.' },
  { id: 'session', x: 52, y: 40, title: 'Shared session', body: 'One runtime. Multiple clients.' },
  { id: 'next', x: 28, y: 66, title: 'Next', body: 'Wire the pane layout.' },
];

/** Board pane: freeform canvas with draggable native objects. No note-card assumption. */
export function BoardPanel(_props: PaneViewProps) {
  const [objects, setObjects] = useState(SEED);
  const [zoom, setZoom] = useState(100);
  const [tool, setTool] = useState<'select' | 'hand' | 'sticky' | 'text'>('select');

  const addObject = () =>
    setObjects((items) => [
      ...items,
      { id: `idea-${items.length}`, x: 62, y: 68, title: 'New idea', body: 'A place to think.' },
    ]);

  const drag = (id: string, event: ReactPointerEvent<HTMLDivElement>) => {
    const area = event.currentTarget.parentElement?.getBoundingClientRect();
    const object = objects.find((item) => item.id === id);
    if (!area || !object) return;
    const startX = event.clientX;
    const startY = event.clientY;
    const move = (next: globalThis.PointerEvent) =>
      setObjects((items) =>
        items.map((item) =>
          item.id === id
            ? {
                ...item,
                x: object.x + ((next.clientX - startX) / area.width) * 100,
                y: object.y + ((next.clientY - startY) / area.height) * 100,
              }
            : item,
        ),
      );
    const end = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
  };

  const tools = [
    { id: 'select' as const, label: 'Select', Icon: MousePointer2 },
    { id: 'hand' as const, label: 'Pan', Icon: Hand },
    { id: 'sticky' as const, label: 'New object', Icon: StickyNote, action: true },
    { id: 'text' as const, label: 'Text', Icon: Type },
  ];

  return (
    <div className="board-pane">
      <div className="board-bar">
        {tools.map(({ id, label, Icon, action }) => (
          <Tooltip key={id} label={label}>
            <button
              type="button"
              className={`v-icon board-tool ${tool === id ? 'is-active' : ''}`}
              aria-label={label}
              onClick={() => {
                setTool(id);
                if (action) addObject();
              }}
            >
              <Icon size={16} strokeWidth={1.8} />
            </button>
          </Tooltip>
        ))}
        <span className="board-zoom">{zoom}%</span>
        <Tooltip label="Zoom out">
          <button type="button" className="v-icon board-tool" aria-label="Zoom out" onClick={() => setZoom((v) => Math.max(60, v - 10))}>
            <ZoomOut size={16} strokeWidth={1.8} />
          </button>
        </Tooltip>
        <Tooltip label="Zoom in">
          <button type="button" className="v-icon board-tool" aria-label="Zoom in" onClick={() => setZoom((v) => Math.min(160, v + 10))}>
            <ZoomIn size={16} strokeWidth={1.8} />
          </button>
        </Tooltip>
        <Tooltip label="Add object">
          <button type="button" className="v-icon board-tool" aria-label="Add object" onClick={addObject}>
            <Plus size={16} strokeWidth={1.8} />
          </button>
        </Tooltip>
      </div>
      <div className="board-canvas" style={{ ['--board-zoom' as string]: `${zoom / 100}` }}>
        <div className="board-grid" />
        {objects.map((object) => (
          <div
            key={object.id}
            className="board-object"
            style={{ left: `${object.x}%`, top: `${object.y}%` }}
            onPointerDown={(event) => drag(object.id, event)}
          >
            <strong>{object.title}</strong>
            <p>{object.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
