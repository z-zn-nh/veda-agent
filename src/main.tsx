import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { MaterialProbe } from './features/material/MaterialProbe';
import { MaterialTexture } from './features/material/MaterialTexture';
import { TooltipProvider } from './ui/Tooltip';
import './styles.css';

/*
 * 三个入口共用一个 bundle,靠查询参数分流:
 *   ?material=<name>  材质探针窗口(透明背景,让材质直接露出来,供对比用)
 *   ?texture=1        纹理背板(给探针提供可被模糊的细节)
 *   无参数             主工作区
 *
 * 之所以不另建入口,是为了让它们共享同一套表面 token —— 否则比出来的差异里
 * 会混进两套样式表的差别。
 *
 * 曾经还有第三个:`?specimen=1` 的可读性试片 + 参数控制台,用来把"要多透、要哪档
 * 模糊"这件事交给用户当场拖出来。定稿(2026-10-07)之后连同它一起删掉了,
 * 取值落在 tokens.css 与 Rust 的 initial_material();这个试片的做法记在
 * docs/ui-stack-decision.md 附录六(仓库还没有任何提交,所以没有历史可回查)。
 */
const params = new URLSearchParams(window.location.search);
const probeMaterial = params.get('material');
const isTexture = params.has('texture');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* 没有主题层:所有表面值由 tokens.css 独占,组件库不再提供第二套视觉。 */}
    <TooltipProvider>
      {isTexture ? (
        <MaterialTexture />
      ) : probeMaterial ? (
        <MaterialProbe material={probeMaterial} />
      ) : (
        <App />
      )}
    </TooltipProvider>
  </StrictMode>,
);
