import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { currentMonitor, getCurrentWindow } from '@tauri-apps/api/window';

type Wallpaper = { path: string; data_url: string };
type Geometry = { left: number; top: number; width: number; height: number };

/**
 * 自绘磨砂:把桌面壁纸按窗口在屏幕上的位置对齐,再整块大半径模糊。
 *
 * 壁纸层的尺寸 = 当前显示器,偏移 = 显示器原点 − 窗口原点,所以窗口拖到哪,露出的就是
 * 壁纸对应的那一块,看起来和"透过窗口看到桌面"一致。假设壁纸用默认的"填充"方式
 * (等价于 background-size: cover)。
 *
 * 模糊、饱和度、染色都在 styles.css 的三个 --app-wallpaper-* 变量里调。
 */
export function WallpaperBackdrop() {
  const [src, setSrc] = useState<string | null>(null);
  const [geometry, setGeometry] = useState<Geometry | null>(null);

  useEffect(() => {
    let alive = true;
    invoke<Wallpaper>('wallpaper_image')
      .then((wallpaper) => {
        if (alive) setSrc(wallpaper.data_url);
      })
      .catch((error) => console.warn('[veda] wallpaper unavailable', error));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const win = getCurrentWindow();
    let disposed = false;
    let frame = 0;
    const unlisteners: Array<() => void> = [];

    const measure = async () => {
      const [position, scale, monitor] = await Promise.all([
        win.innerPosition(),
        win.scaleFactor(),
        currentMonitor(),
      ]);
      if (disposed || !monitor) return;
      setGeometry({
        left: (monitor.position.x - position.x) / scale,
        top: (monitor.position.y - position.y) / scale,
        width: monitor.size.width / scale,
        height: monitor.size.height / scale,
      });
    };
    // 拖动时事件很密,合并到每帧最多量一次。
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => void measure());
    };
    const keep = (pending: Promise<() => void>) =>
      pending.then((unlisten) => (disposed ? unlisten() : unlisteners.push(unlisten)));

    void measure();
    void keep(win.onMoved(schedule));
    void keep(win.onResized(schedule));
    void keep(win.onScaleChanged(schedule));

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, []);

  return (
    <div className="wallpaper-backdrop" aria-hidden="true">
      {src && geometry ? (
        <div
          className="wallpaper-backdrop-image"
          style={{
            left: geometry.left,
            top: geometry.top,
            width: geometry.width,
            height: geometry.height,
            backgroundImage: `url("${src}")`,
          }}
        />
      ) : null}
    </div>
  );
}
