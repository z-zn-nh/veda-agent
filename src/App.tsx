import { Settings2, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Tooltip } from './ui/Tooltip';
import { VButton } from './ui/VButton';
import { VEmptyState } from './ui/VEmptyState';
import { LayoutView } from './layout/LayoutView';
import { PANE_KINDS, PANE_REGISTRY } from './layout/registry';
import { useLayout } from './layout/useLayout';
import { WindowControls } from './ui/WindowControls';
import { WallpaperBackdrop } from './features/material/WallpaperBackdrop';
import { MaterialTuningPanel, tuningStyle, useMaterialTuning } from './features/material/MaterialTuning';


/**
 * 可切换的窗口材质。
 *
 * 四条实现在 `src-tauri/src/backdrop.rs` 与 `acrylic.rs` 里,层级并不相同:DWM 窗口属性
 * 与 WinAppSDK 的独立合成目标不是一回事。实测差别也很大,所以每一项都带一句说明——
 * 光看名字容易把 `acrylic` 和 `system-acrylic` 看串,而它们的效果差着一个量级。
 */
const MATERIALS = [
  { id: 'none', label: 'None', hint: '无材质,画面保持锐利' },
  { id: 'acrylic', label: 'DWM', hint: 'DWM 通道。接近无材质,只有一点染色' },
  { id: 'system-acrylic', label: 'System', hint: 'WinAppSDK 合成材质。真正模糊的那一档' },
  { id: 'aero', label: 'Aero', hint: '玻璃色调很重,窗口整体明显偏暗' },
  // 2026-10-08 新增两档,目标是 macOS 侧栏那种"顺滑、无噪点"的磨砂:
  { id: 'tabbed', label: 'Mica Alt', hint: 'DWM Mica Alt。只采样壁纸、无噪点;窗口失焦时系统会退成纯色' },
  { id: 'wallpaper', label: 'Wallpaper', hint: '自绘:读取桌面壁纸,在 WebView 里大半径模糊。模糊/染色全可控,失焦不变灰' },
] as const;
type Material = (typeof MATERIALS)[number]['id'];

/**
 * Host shell.
 *
 * Owns the toolbar, the layout tree and window chrome. Panes themselves know nothing
 * about the toolbar or the tree — they only receive their record and report status.
 */
export default function App() {
  const { state, actions, openPane, activeKind } = useLayout();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [material, setMaterial] = useState<Material>('acrylic');
  const [materialNote, setMaterialNote] = useState('');
  const materialTuning = useMaterialTuning(material);
  const paneCount = Object.keys(state.panes).length;

  /**
   * 切换窗口材质,并把它实际做了什么显示出来。
   *
   * `set_backdrop` 在 Rust 侧会回传真实动作(含降级原因),这里原样呈现——
   * 材质有没有生效不该靠肉眼猜,尤其它还会被 scrim 的厚度掩盖。
   */
  const applyMaterial = async (next: Material) => {
    setMaterial(next);
    setMaterialNote('');
    try {
      setMaterialNote(await invoke<string>('set_backdrop', { material: next }));
    } catch (error) {
      setMaterialNote(error instanceof Error ? error.message : String(error));
    }
  };

  // 启动时向 Rust 要一次真实材质,而不是自己维护一份默认值。
  useEffect(() => {
    invoke<string>('current_material')
      .then((name) => setMaterial(name as Material))
      .catch(() => {
        /* 非 Windows 或命令不可用时保持初始值即可 */
      });
  }, []);

  /**
   * 为每种材质各开一个窗口做对比。
   *
   * 之所以不在这里逐个"切"而是逐个"开":切换会让几套机制轮流抢同一块背景层,
   * 而单独开的窗口各自固定一种材质、建好就不再改,差异才比得准。
   */
  const openComparison = async () => {
    setMaterialNote('');
    try {
      const reports: string[] = [];
      for (const { id } of MATERIALS) {
        // 自绘档没有原生材质,探针窗口里看不到它,只能在主窗口里看。
        if (id === 'wallpaper') continue;
        reports.push(await invoke<string>('open_material_window', { material: id }));
      }
      setMaterialNote(reports.join('  ·  '));
    } catch (error) {
      setMaterialNote(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <main className="app-shell" data-material={material} style={tuningStyle(materialTuning.tuning)}>
      {material === 'wallpaper' ? <WallpaperBackdrop /> : null}
      <header className="topbar" data-tauri-drag-region>
        <div className="brand" data-tauri-drag-region>
          <Sparkles size={15} strokeWidth={1.8} />
          <span>Veda</span>
        </div>

        <nav className="tool-nav" aria-label="Workspace tools">
          {PANE_KINDS.map((kind) => {
            const { label, icon: Icon } = PANE_REGISTRY[kind];
            return (
              <Tooltip key={kind} label={label}>
                <button
                  type="button"
                  className={`v-icon tool-button ${activeKind === kind ? 'is-active' : ''}`}
                  aria-label={label}
                  onClick={() => openPane(kind)}
                >
                  <Icon size={16} strokeWidth={1.8} />
                </button>
              </Tooltip>
            );
          })}
        </nav>

        <div className="topbar-actions">
          <span className="pane-count" aria-label={`${paneCount} panes open`}>
            {paneCount}
          </span>
          <Tooltip label="Settings">
            <button type="button" className="v-icon" aria-label="Settings" onClick={() => setSettingsOpen(true)}>
              <Settings2 size={16} strokeWidth={1.8} />
            </button>
          </Tooltip>
          <WindowControls />
        </div>
      </header>

      <div className="layout-host">
        {paneCount === 0 ? (
          /*
           * 空态是用户见到的第一屏,必须给出出口。
           * 原来只有一行 `No pane open` —— 在半透明的整窗表面上,那读起来就是一块
           * 说不出用途的灰板(设计文档 07 §2 的线框与 §0 的记录)。
           */
          <VEmptyState
            title="Nothing open yet"
            hint="Agent, notes and board are three separate tools — each one works on its own, and none of them needs the others."
          >
            {PANE_KINDS.map((kind) => {
              const { label, icon: Icon } = PANE_REGISTRY[kind];
              return (
                <VButton
                  key={kind}
                  variant="solid"
                  icon={<Icon size={14} strokeWidth={1.8} />}
                  onClick={() => openPane(kind)}
                >
                  {label}
                </VButton>
              );
            })}
          </VEmptyState>
        ) : (
          <LayoutView state={state} actions={actions} />
        )}
      </div>

      {settingsOpen ? (
        <>
          <div className="settings-overlay is-clear" onClick={() => setSettingsOpen(false)} />
          <div className="settings-sheet" role="dialog" aria-label="Settings">
            <div className="settings-title">Settings</div>
            <div className="settings-row">
              <span>Material</span>
              <span className="settings-seg" role="group" aria-label="Window material">
                {MATERIALS.map(({ id, label }) => (
                  <button
                    key={id}
                    type="button"
                    className={`settings-seg-item ${material === id ? 'is-active' : ''}`}
                    onClick={() => void applyMaterial(id)}
                  >
                    {label}
                  </button>
                ))}
              </span>
            </div>
            {/* 当前材质的说明。名字容易看串,效果差一个量级,所以把话说在按钮下面。 */}
            <p className="settings-hint">
              {MATERIALS.find((item) => item.id === material)?.hint}
            </p>
            {materialNote ? <p className="settings-note">{materialNote}</p> : null}
            <MaterialTuningPanel material={material} {...materialTuning} />
            <div className="settings-row">
              <span>Agent runtime</span>
              <span className="settings-value">Not connected</span>
            </div>
            <button className="settings-close" type="button" onClick={() => void openComparison()}>
              Compare materials
            </button>
            <button className="settings-close" type="button" onClick={() => setSettingsOpen(false)}>
              Close
            </button>
          </div>
        </>
      ) : null}
    </main>
  );
}
