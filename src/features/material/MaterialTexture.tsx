import { X } from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';

/**
 * 纹理背板 —— 材质对比的**底衬**,本身不是给用户用的界面。
 *
 * 存在的理由:模糊只有在背后有细节时才看得见。桌面那一带往往是均匀壁纸,四种材质压上去
 * 几乎读不出差别(实测亮度只差十几)。这块背板提供三种频率,让"有没有在模糊"变成肉眼可判断:
 * 细条纹最先被抹平、中号方块会被揉成色块、正文用来判断背后有字时还读不读得清。
 *
 * 它被创建在探针窗口**之前**,所以天然位于它们下方,不需要任何置顶操作。
 *
 * 它开着 decorations(false) 与 skip_taskbar(true),因此**没有系统标题栏、任务栏里也没有
 * 条目** —— 那就必须自己给一个说明和关闭入口,否则它会变成一块关不掉、又看不出用途的
 * 条纹矩形。顶栏同时是拖拽区。
 */
export function MaterialTexture() {
  const close = () => void getCurrentWindow().close();

  return (
    <div className="texture-shell">
      <div className="texture-stripes" aria-hidden="true" />
      <div className="texture-blocks" aria-hidden="true">
        {Array.from({ length: 24 }, (_, index) => (
          <span key={index} />
        ))}
      </div>
      <div className="texture-lines" aria-hidden="true">
        {Array.from({ length: 10 }, (_, index) => (
          <span key={index} />
        ))}
      </div>

      <header className="texture-bar" data-tauri-drag-region>
        <span className="texture-title" data-tauri-drag-region>
          Texture backdrop — 供材质对比窗透过观察
        </span>
        <button type="button" className="texture-close" aria-label="Close texture backdrop" onClick={close}>
          <X size={13} strokeWidth={2} />
        </button>
      </header>
    </div>
  );
}
