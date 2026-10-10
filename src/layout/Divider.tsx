import { useCallback, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';

interface DividerProps {
  direction: 'row' | 'column';
  /** Current first-child share (0..1) and a setter that clamps for us. */
  ratio: number;
  onRatio: (ratio: number) => void;
  containerRef: RefObject<HTMLDivElement | null>;
  label: string;
}

const KEYBOARD_STEP = 0.02;

/**
 * Split handle.
 *
 * Nothing is painted: it is a hit area plus a keyboard affordance, so panes stay
 * visually continuous (no divider lines). Pointer events are captured during a drag
 * so the resize keeps working when the cursor leaves the thin strip.
 */
export function Divider({ direction, ratio, onRatio, containerRef, label }: DividerProps) {
  const applyDelta = useCallback(
    (deltaPx: number) => {
      const box = containerRef.current?.getBoundingClientRect();
      if (!box) return;
      const extent = direction === 'row' ? box.width : box.height;
      if (!extent) return;
      onRatio(ratio + deltaPx / extent);
    },
    [containerRef, direction, onRatio, ratio],
  );

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    const startX = event.clientX;
    const startY = event.clientY;
    let last = 0;

    const move = (next: PointerEvent) => {
      const total = direction === 'row' ? next.clientX - startX : next.clientY - startY;
      applyDelta(total - last);
      last = total;
    };
    const up = () => {
      target.releasePointerCapture(event.pointerId);
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
      target.removeEventListener('pointercancel', up);
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', up);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const decrease = direction === 'row' ? 'ArrowLeft' : 'ArrowUp';
    const increase = direction === 'row' ? 'ArrowRight' : 'ArrowDown';
    if (event.key === decrease) {
      event.preventDefault();
      onRatio(ratio - KEYBOARD_STEP);
    } else if (event.key === increase) {
      event.preventDefault();
      onRatio(ratio + KEYBOARD_STEP);
    }
  };

  return (
    <div
      className={`divider divider-${direction}`}
      role="separator"
      aria-label={label}
      aria-orientation={direction === 'row' ? 'vertical' : 'horizontal'}
      aria-valuenow={Math.round(ratio * 100)}
      aria-valuemin={15}
      aria-valuemax={85}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
    />
  );
}
