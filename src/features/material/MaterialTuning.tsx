import { RotateCcw } from 'lucide-react';
import { useEffect, useState, type CSSProperties } from 'react';

/**
 * 材质质感调节(2026-10-08)。
 *
 * 每种材质各存一份,切材质不会互相串:原生材质只有"遮罩浓度"可调(模糊由系统决定),
 * 自绘壁纸档另外能调模糊、饱和度、亮度。数值存在 localStorage,重置只重置当前材质。
 *
 * 默认值与 styles.css / tokens.css 里的取值一致 —— 不动滑杆时观感和改动前完全相同。
 */
export type Tuning = { scrim: number; blur: number; saturate: number; brightness: number };

const BASE: Tuning = { scrim: 0.78, blur: 72, saturate: 1.25, brightness: 1 };
const DEFAULTS: Record<string, Tuning> = {
  tabbed: { ...BASE, scrim: 0.36 },
  wallpaper: { ...BASE, scrim: 0.46 },
};
export const defaultTuning = (material: string): Tuning => DEFAULTS[material] ?? BASE;

const KEY = 'veda.material-tuning.v1';
const loadAll = (): Record<string, Partial<Tuning>> => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}');
  } catch {
    return {};
  }
};

export function useMaterialTuning(material: string) {
  const [all, setAll] = useState(loadAll);
  const tuning: Tuning = { ...defaultTuning(material), ...all[material] };

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(all));
  }, [all]);

  const set = (patch: Partial<Tuning>) =>
    setAll((prev) => ({ ...prev, [material]: { ...prev[material], ...patch } }));
  const reset = () =>
    setAll((prev) => {
      const next = { ...prev };
      delete next[material];
      return next;
    });
  const isDefault = all[material] === undefined;

  return { tuning, set, reset, isDefault };
}

/** 把调节值转成 .app-shell 上的 CSS 变量。 */
export function tuningStyle(t: Tuning): CSSProperties {
  const scrim = `rgba(9, 12, 22, ${t.scrim})`;
  return {
    '--app-scrim': scrim,
    '--app-wallpaper-scrim': scrim,
    '--app-wallpaper-blur': `${t.blur}px`,
    '--app-wallpaper-saturate': String(t.saturate),
    '--app-wallpaper-brightness': String(t.brightness),
  } as CSSProperties;
}

type SliderProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
  onChange: (value: number) => void;
};

function Slider({ label, value, min, max, step, format, onChange }: SliderProps) {
  return (
    <label className="tuning-row">
      <span className="tuning-label">{label}</span>
      <input
        className="tuning-range"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <span className="tuning-value">{format(value)}</span>
    </label>
  );
}

export function MaterialTuningPanel({
  material,
  tuning,
  set,
  reset,
  isDefault,
}: { material: string } & ReturnType<typeof useMaterialTuning>) {
  const selfDrawn = material === 'wallpaper';
  return (
    <div className="tuning" role="group" aria-label="Material tuning">
      <div className="tuning-head">
        <span>质感</span>
        <button type="button" className="tuning-reset" onClick={reset} disabled={isDefault} aria-label="重置质感参数">
          <RotateCcw size={11} strokeWidth={2} />
          重置
        </button>
      </div>
      <Slider
        label="遮罩"
        value={tuning.scrim}
        min={0}
        max={0.95}
        step={0.01}
        format={(v) => `${Math.round(v * 100)}%`}
        onChange={(scrim) => set({ scrim })}
      />
      {selfDrawn ? (
        <>
          <Slider label="模糊" value={tuning.blur} min={0} max={160} step={1} format={(v) => `${v}px`} onChange={(blur) => set({ blur })} />
          <Slider label="饱和" value={tuning.saturate} min={0} max={2.5} step={0.05} format={(v) => v.toFixed(2)} onChange={(saturate) => set({ saturate })} />
          <Slider label="亮度" value={tuning.brightness} min={0.4} max={1.6} step={0.02} format={(v) => v.toFixed(2)} onChange={(brightness) => set({ brightness })} />
        </>
      ) : (
        <p className="settings-hint">系统材质的模糊半径由 Windows 决定,这里只能调遮罩浓度。</p>
      )}
    </div>
  );
}
