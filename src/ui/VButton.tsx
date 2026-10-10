import type { ButtonHTMLAttributes, ReactNode } from 'react';

/**
 * VButton —— 本地原语层的唯一按钮。
 *
 * 底层:**纯自绘**。
 * 为什么不是别的:规范禁止自带视觉的组件(`02-gui-layout-and-haze.md:26`),而按钮没有需要
 * 状态机的交互 —— Ark 的 button 只多给几个 `data-*` 属性,为它把依赖图拉起来不值得。
 * 视觉与状态规格:`docs/architecture/07-layout-design.md` §8.3 / §8.4。
 */
type Variant = 'ghost' | 'solid';

export interface VButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** ghost = 工具栏与面板栏的常态;solid = 主要动作(空态的入口)。 */
  variant?: Variant;
  /** 图标放前面,`size` 14~16、`strokeWidth` 1.7~1.8(全仓 Lucide 约定)。 */
  icon?: ReactNode;
}

export function VButton({ variant = 'ghost', icon, children, className, ...rest }: VButtonProps) {
  const classes = ['v-button', `v-button-${variant}`, className].filter(Boolean).join(' ');
  return (
    <button {...rest} className={classes}>
      {icon}
      {children ? <span className="v-button-label">{children}</span> : null}
    </button>
  );
}
