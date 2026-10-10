import * as RadixTooltip from '@radix-ui/react-tooltip';
import type { ReactNode } from 'react';

/**
 * 提示气泡。
 *
 * 用 Radix 的 headless 版本,而不是继续挂在通用组件库上。理由很直接:气泡需要的
 * 只是一个定位层,视觉全部由 `.v-tooltip` 决定;为了它把一整套设计体系(圆角、边框、
 * 浅色浮层、几百 KB 样式表)装进来再逐条压掉,是负收益。
 */

/** 需要包在应用根部一次;Radix 靠它统一管理延迟与跨气泡切换。 */
export function TooltipProvider({ children }: { children: ReactNode }) {
  return <RadixTooltip.Provider delayDuration={350}>{children}</RadixTooltip.Provider>;
}

export function Tooltip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <RadixTooltip.Root>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content className="v-tooltip" sideOffset={6}>
          {label}
          <RadixTooltip.Arrow className="v-tooltip-arrow" width={10} height={5} />
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  );
}
