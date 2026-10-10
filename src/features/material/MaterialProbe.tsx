import { X } from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';

/**
 * 材质探针窗口的内容。
 *
 * 一个窗口只呈现一种材质,而且**不提供任何切换** —— 这正是它存在的理由:几种材质
 * 背后的机制并不相同(DWM 窗口属性 / 旧 AccentPolicy / WinAppSDK 合成目标),各有各的
 * 刷新时机与焦点策略,挤在一个窗口里来回切会互相抢背景层。
 *
 * 背景完全透明,所以你看到的**就是那层材质本身**:`none` 是未经处理的底层内容,
 * 会模糊的材质是模糊过的同一块内容。
 *
 * 窗口是 decorations(false),没有系统标题栏,因此自带一条顶栏:注明是哪种材质,
 * 并给出关闭入口。少了它,这块窗口既认不出是什么,也关不掉。
 */
export function MaterialProbe({ material }: { material: string }) {
  const close = () => void getCurrentWindow().close();

  return (
    <div className="probe-shell">
      <header className="probe-bar" data-tauri-drag-region>
        <span className="probe-name" data-tauri-drag-region>
          {material}
        </span>
        <button type="button" className="probe-close" aria-label={`Close ${material}`} onClick={close}>
          <X size={13} strokeWidth={2} />
        </button>
      </header>

      <p className="probe-text">
        窗口材质在这一层后面。文字仍然清晰,说明它没有把内容一起糊掉。
      </p>

      <div className="probe-ramp" aria-hidden="true">
        <span style={{ opacity: 1 }} />
        <span style={{ opacity: 0.72 }} />
        <span style={{ opacity: 0.5 }} />
        <span style={{ opacity: 0.3 }} />
        <span style={{ opacity: 0.14 }} />
      </div>

      <p className="probe-text probe-text-small">
        The same material sits behind this line as well.
      </p>
    </div>
  );
}
