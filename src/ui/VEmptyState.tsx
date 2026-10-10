import type { ReactNode } from 'react';

/**
 * VEmptyState —— 空态:标题 + 动作 + 一句提示。
 *
 * 底层:**纯自绘**。
 * 为什么需要它:空的工作区是用户见到的第一屏。原来这里只有一行 `No pane open`
 * (`src/styles.css:27` 的 `.empty-host`),既没说明这是什么,也没给出下一步 —— 在一个
 * 铺满整窗的半透明表面上,那就是一整块说不出用途的灰板。
 * 线框见 `docs/architecture/07-layout-design.md` §2;规格见 §8.3。
 */
export interface VEmptyStateProps {
  title: string;
  /** 出口:通常是一组 `VButton`,点击后直接进入某个能力。 */
  children?: ReactNode;
  /** 一句话说明这是什么工具集合。用产品自己的话,别写营销语。 */
  hint?: string;
}

export function VEmptyState({ title, children, hint }: VEmptyStateProps) {
  return (
    <div className="v-empty">
      <p className="v-empty-title">{title}</p>
      {children ? <div className="v-empty-actions">{children}</div> : null}
      {hint ? <p className="v-empty-hint">{hint}</p> : null}
    </div>
  );
}
