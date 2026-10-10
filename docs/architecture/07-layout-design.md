# 07 布局设计(阶段 2 落地方案)

> 定位:阶段 2「实现 GUI 宿主和任意分栏」的**落地方案**——骨架分区、线框、交互规则、**组件库设计(§8)**、布局树 API 变更、验收增补。
> 本文不改产品边界、不重复视觉规范、不重开组件库选型。凡与 `00/01/02/04/05` 冲突,以那几份为准,并回来改本文。

> 核验时间:2026-10-07。§0 的三条是**实测缺陷**(带可复现的测量口径),不是推测;§8.6 的底层映射对齐 `docs/component-library-selection.md` §0。

## 0. 先解三处窗口级缺陷(实测)

这三条都属于"宿主壳层",不属于任何业务面板,但会直接歪掉布局的观感与口径。按修起来最省的顺序排。

### 0.1 窗口四周有一圈约 11px 的窄带:材质不同,它一次发亮、一次发黑(**已修**)

**数据**

| 量 | 值 | 来源 |
| --- | --- | --- |
| 窗口矩形 | 物理 2100×1350 @ (120,90) | `GetWindowRect` |
| webview 视口 | CSS 1386×892,DPR 1.5 → 物理 2079×1338 | CDP |
| 客户区 | 2078×1337 | `GetClientRect` |

差 ≈ 22×12 物理 → **每边约 11 / 6 物理像素(约 7 / 4 CSS px)**。

**像素证据(第一版,材质 = DWM `acrylic`)**:窗口右缘 `x=2210..2218` 是 `(62,69,77)`,紧邻的内容是 `(31,36,46)` —— 约**两倍亮度**;下缘 `y=1430..1438` 同样。

**像素证据(第二版,材质 = `system-acrylic`)**:用户截图(2301×1521,窗口 1:1 未缩放)测出来的是**另一副样子** —— 那条带变成了**纯黑**:

```text
左缘 x=53..63    (0,0,0)   11px 纯黑
右缘 x=2224..2234 (0,0,0)   11px 纯黑
上缘 y=22..23    (0,0,0)    2px 纯黑
下缘 y=1404..1415 (0,0,0)   11px 纯黑
```

四个宽度加起来 22×13 物理 —— 与上表算出的 inset **逐像素吻合**。也就是说这一圈**不是画在窗口外的阴影**,而是**窗口内、webview 没覆盖到的那块**:DWM 通道下它显示材质(发亮),换成 WinAppSDK 合成材质后就渲染成不透明黑。用户看到的那句"周围还有黑框"就是它。

**根因**:`src-tauri/tauri.conf.json` 的 `"shadow": true` 让 tao 置上 `MARKER_UNDECORATED_SHADOW`,于是 `WM_NCCALCSIZE` 按阴影 insets 把**客户区**从窗口矩形内缩。webview 只铺到客户区,窗口矩形里剩下的那一圈不是我们画的,材质怎么处理它由 OS 决定 —— 所以它会随材质变化而不随我们的 token 变化(这一条正是"它看起来像阴影但其实不是"的原因)。

**修法**:`"shadow": false`(config 层)保留我们自己那条样式手术(`backdrop::set_shadow`,样式层)。两层各管一件事,别合并:

| 层 | 开关 | 管什么 |
| --- | --- | --- |
| config `shadow` | tao `MARKER_UNDECORATED_SHADOW` | 客户区 inset(也就是这条窄带) |
| `backdrop::set_shadow` | `GWL_STYLE` 的边框位 | DWM 画的窗口阴影(见 `docs/ui-stack-decision.md` 附录六) |

**修完怎么验(已验)**:窗口矩形应等于客户区。实测 `window 2160×1380` = `client 2160×1380`,**inset 0×0**;
webview 视口 `innerWidth/innerHeight = 1440×920` CSS @DPR 1.5 → 物理 2160×1380,与窗口逐像素相同。
修之前视口只有 1386 CSS(比窗口少 14),这就是那圈带的可测特征。

**副产物**:内容区 = 窗口矩形,`--app-scrim` 的透出比口径不再有边缘例外。

### 0.2 未保存态只靠颜色

`.tab-dot` 是一个 5px 圆点,只靠"在不在"和颜色表达 dirty。这违反 `02-gui-layout-and-haze.md:137`(UI 错误状态不能只靠红色或透明度表达)与 `:134`(焦点不能只通过颜色表示)。

**修法**:形状与文字两条腿。dirty → 圆点换成更实的方块并带 `title`/`aria-label`;`error` → 图标 + 文本(例如标签上出现可读的"保存失败"),不只换色。可访问名称已经有了(`aria-label="Unsaved"`),但那是给读屏的,视觉用户同样需要非颜色信号。

### 0.3 遗留注释误导

`src/styles.css:63` 写着 `── Mantine overrides: strip default chrome, keep behaviour ──`,但 Mantine 已无安装、`src/` 0 处 import(`component-library-selection.md:220`)。

**修法**:改名为"本地原语",注释里写明"这里曾经压过 Mantine;已卸载"。留着一句不成立的注释,比没有注释更贵。

## 1. 骨架分区

层次照 `02-gui-layout-and-haze.md:32-39` 的既定层级,把每一层落到具体的 class 与 token 上:

```text
窗口矩形                        ← 材质(system-acrylic)铺满整窗
 └── .app-shell                 ← --app-scrim(唯一的整窗 tint)
      ├── .topbar               ← --app-toolbar
      ├── .layout-host          ← 无背景(缝隙里透出的是 scrim,不是面板色)
      │    └── .group           ← --app-surface(pane frame)
      │         ├── .group-bar  ← 标签组 chrome(不加背景,靠间距与 tint 分组)
      │         └── .group-body ← 面板内容(自带各自的稳定底:笔记高对比、白板偏不透明)
      └── 浮层                  ← --app-surface-strong(设置 / 命令面板 / toast)
```

| 区域 | 材质 | 谁负责 | 不允许 |
| --- | --- | --- | --- |
| 窗口底 | Rust 材质通道 | `src-tauri`(已定稿 `system-acrylic`) | 组件里再写一份材质 |
| `.app-shell` | `--app-scrim` | `src/ui/tokens.css` 独占 | 别处再定义 tint |
| `.topbar` | `--app-toolbar` | `tokens.css` | 工具栏自己调透明度 |
| `.group` | `--app-surface` | `tokens.css` | 面板加边框/阴影 |
| 浮层 | `--app-surface-strong` | `tokens.css` | 浮层自带圆角阴影(必须压掉) |

**工具栏三区**(`02-gui-layout-and-haze.md:73` 的结构,补上"谁在哪一区"):

```text
左:  [工作区 ▾] [Agent][笔记][白板][⋯ 固定工具]        右:  [状态] [新建 ▾] [布局 ▾] [设置] [窗口按钮]
```

- 中间**刻意留空**:任何居中元素都会在左右区宽度变化时漂移。
- 状态簇只显示"此刻有内容"的状态(运行中 / 未保存 / 保存失败),点开是逐面板列表 —— 满足 `:80`「不把所有细节堆在按钮上」。
- 固定工具超出时进溢出菜单(`:81`)。
- 工具栏**不读**笔记正文或白板数据(`:82`),它只调面板管理器。
- `.topbar` 与 `.layout-host` 之间要有清晰焦点边界(`:83`):Tab 从工具栏离开后进入布局区,不回跳。

## 2. 线框(ASCII)

**空态**(当前是"居中一行小字"`empty-host`,要改成有出口的空态):

```text
┌─ Veda ──────────────────────────────────────── [状态] [新建▾] [布局▾] [设置] [─ □ ×] ┐
│                                                                                     │
│                          还没有打开任何面板                                          │
│                     [ Agent ]  [ 笔记 ]  [ 白板 ]      ← 三个入口,直接可点           │
│                     ⌘K 打开命令面板                                                  │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

**单栏**:

```text
┌─ toolbar ───────────────────────────────────────────────────────────────────────────┐
│ ┌ .group ─────────────────────────────────────────────────────────────────────────┐ │
│ │ [🤖 Agent  ×]                              [⇔ 分割] [⇕ 分割] [✕ 关闭]           │ │
│ ├─────────────────────────────────────────────────────────────────────────────────┤ │
│ │                                                                                 │ │
│ │  面板内容(.group-body)                                                          │ │
│ └─────────────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

**左右分栏**(`row` 分割):

```text
│ ┌ 笔记 ──────────────┐┊┌ Agent ─────────────┐ │   ┊ = 5px 命中区,只画 1px 发丝线
│ │ [条目][条目][条目] │┊│                    │ │
│ │                    │┊│                    │ │
│ └────────────────────┘┊└────────────────────┘ │
```

**三栏**(左一 + 右侧上下,任意嵌套的一种):

```text
│ ┌ 笔记 ─────────┐┊┌ Agent ──────────────────┐ │
│ │               │┊│                         │ │
│ │               │┊├─────────────────────────┤ │  ← 第二条分割是 column
│ │               │┊│ 白板                    │ │
│ └───────────────┘┊└─────────────────────────┘ │
```

**标签组多标签**(同一块区域里放同类或异类面板):

```text
│ ┌─────────────────────────────────────────────────────────────────────────────────┐
│ │ [笔记·草稿][笔记·架构][白板]  ▸溢出        [⇔][⇕][✕]                            │
│ ├─────────────────────────────────────────────────────────────────────────────────┤
│ │  当前活动标签的内容                                                              │
│ └─────────────────────────────────────────────────────────────────────────────────┘
```

**窄窗降级**(见 §8):`row` 分割在宽度不够时**渲染成纵排**,树不变:

```text
│ ┌ 笔记 ───────────────────────────────────────┐ │
│ │                                             │ │
│ ├─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┤ │   ← 渲染层改方向,ratio 不丢
│ │ Agent                                       │ │
│ └─────────────────────────────────────────────┘ │
```

**命令面板**(Ark `dialog` + `combobox`,见 §9):

```text
│        ┌───────────────────────────────────────────────┐
│        │ 🔍  打开…                                      │
│        ├───────────────────────────────────────────────┤
│        │ 面板    Agent / 笔记 / 白板                    │
│        │ 布局    左右分栏 / 上下分栏 / 重置布局          │
│        │ 工作区  当前工作区                              │
│        └───────────────────────────────────────────────┘
```

**设置浮层**:沿用现有 `.settings-sheet`,但要按 §11 补上"材质"以外的两组:布局(重置 / 导出?——不导出,只重置)与可访问性(减少透明度、减少动画)。

## 3. 信息架构:入口 / 面板 / 标签 / 焦点

1. **三个能力各自独立入口**(`:78`),不合并成"知识"。目前 `PANE_KINDS = [agent, notes, board]` 已符合。
2. **入口点击语义 = 打开 | 定位 | 创建,不整页切换**(`:79`)。当前 `useLayout.openPane` 是"同类已存在则聚焦,否则新建"(`src/layout/useLayout.ts:42-49`)——保留这个语义,但要把规则写死并测出来:
   - 入口点击 = **定位**(已有同类面板就把它带到前台,不复制);
   - 要**第二个同类面板**,走显式动作:"新建"菜单选同类,或在面板上点分割(分割出来的新组会复制同类,`src/layout/tree.ts:138` 的注释已经这么写了)。
   - 这条同时满足验收里"可以并排打开两个同类面板"(`05-acceptance-checklist.md:29`)——**验证路径是分割/新建,不是入口**。设计文档把这件事说明白,免得以后有人以为入口坏了。
3. **一个面板只属于一个标签组**;标签组是树的叶子(`src/layout/types.ts:31-33`)。
4. **焦点唯一且可见**(`05-acceptance-checklist.md:30`):`focusedPaneId` 驱动工具栏高亮、快捷键目标、新建面板落点(`src/layout/useLayout.ts:63-68`)。焦点指示不能只换颜色(见 §0.2 的同一条纪律)。
5. **快捷键只作用于活动面板**(`05-acceptance-checklist.md:31`)。

## 4. 交互规则表

| 动作 | 触发 | 结果 | 键盘 | 备注 |
| --- | --- | --- | --- | --- |
| 打开/定位面板 | 工具栏入口 | 已有同类则聚焦,否则在焦点组新建 | `Alt+1/2/3` | §3.2 |
| 新建同类面板 | 「新建 ▾」或面板分割 | 新组,复制同类 target | 同上 + 修饰键 | 满足"同类并排" |
| 切换标签 | 点标签 | 该组 `activePaneId` + `focusedPaneId` | `Ctrl+Tab` / `←→` | `role=tablist` 已有 |
| 分割 | 面板栏 `⇔`/`⇕` | `splitPane` | `Ctrl+\` / `Ctrl+Shift+\` | 已有 |
| 调整比例 | 拖分隔器 | `setRatio`,裁剪 [0.15,0.85] | 方向键,步进 0.02 | 已有 |
| **拖拽移动面板** | 拖标签 | 并入组 / 在目标四边分割 / 新组 | 「移动到…」菜单 | **本期新增**,见 §5 |
| 关闭面板 | 标签 `×` 或 `Ctrl+W` | 焦点让给相邻标签,空组折叠 | `Ctrl+W` | 已有(pane 级) |
| 恢复/重置布局 | 「布局 ▾」 | 重置到 `initialState()`;不提供"撤销上一次关闭"之外的恢复 | `Ctrl+Shift+R`(需确认不冲突) | 见 §5.4 |
| 命令面板 | `Ctrl+K` | 打开浮层,可搜面板/布局/工作区 | `Ctrl+K` `Esc` | §9,最后一步做 |

## 5. 面板拖拽移动(现在缺的那块)

`02-gui-layout-and-haze.md:94` 要求"面板拖拽移动",但 `src/layout/tree.ts` 只有 `addPane / removePane / splitPane / setRatio / focusPane / setPaneStatus`,**没有 move**。这是设计与实现的真实缺口。

### 5.1 落点三类

| 落点 | 判定 | 结果 |
| --- | --- | --- |
| 目标组的标签栏 | 指针落在 `.group-bar` 上 | 并入该组(插到指针附近的索引) |
| 目标面板的四边 | 指针落在面板 25% 边带 | 在该方向把目标组分割,新组放被拖面板 |
| 面板之间的空白/整窗 | 指针不在任何组上 | 新建一个组(先 row 分割到焦点组旁) |

### 5.2 落点指示

分割落点画一条 **1px 发丝线**(`--app-hairline-strong`)加一块 `--app-surface-glass` 的半透明预览块。不加阴影、不加边框 —— 与 `tokens.css:9` 的"No borders, no shadows, no dividers"一致,移动指示只借用既有的两档 tint。

### 5.3 键盘替代(必须有,不是可选)

拖拽对键盘用户不可达。每个标签上挂一个 Ark `menu`:「移动到 → 组 A / 组 B / 左 / 右 / 上 / 下」。这样 `02-gui-layout-and-haze.md:136`(分割器要能键盘操作,至少可操作退化)的同一条纪律也覆盖了面板移动。

### 5.4 不做"撤销关闭"以外的历史

不引入 undo 栈。`Ctrl+W` 关掉的面板可由入口重新打开;布局本身有持久化。把"恢复"限定为「重置布局」,避免设计出一个没人验收的历史系统。

### 5.5 为什么不上 dnd-kit

`component-library-selection.md:199` 把 dnd-kit 列为"虚拟化列表/拖拽"的建议,但那是针对**列表项拖拽排序**。面板移动的落点语义(四边分割)要自己算,库能省的只是 pointer 会话管理,而项目里 `Divider.tsx` 已经有 `setPointerCapture` 的成熟写法可复用。结论:**本期用本地 pointer 实现,键盘路径用菜单补齐**;若以后出现跨窗口拖拽或列表重排,再引 dnd-kit。

## 6. 布局树 API 变更(`src/layout/tree.ts`)

新增三个纯函数,语义不变式与单测要求一起给出:

| 新函数 | 语义 | 至少两条单测 |
| --- | --- | --- |
| `movePaneToGroup(state, paneId, groupId, index)` | 把面板并入目标组指定位置 | 正常并入 / 移动到**自己所在的组**(应当是重排序,不能变成删除) |
| `movePaneToSplit(state, paneId, targetPaneId, position)` | 按 `left/right/top/bottom` 把目标组切开,新组装被拖面板 | 正常四向 / 目标组只剩一个面板时切开后两侧都非空 |
| `reorderTab(state, groupId, from, to)` | 组内重排 | 正常 / 越界索引裁剪 |

**不变式**(每条都要有断言):

1. `split` 恰有两个孩子;`tabs` 是叶子。
2. 任何操作后 `prune` 的结果里没有空组、没有单孩子 split。
3. `ratio` 恒在 `[MIN_RATIO, MAX_RATIO]`。
4. `focusedPaneId` 必须指向存活面板;被移走/关闭时让给相邻面板,最后一组被移空时回退树上第一个。
5. 操作是纯函数:输入 state 不被修改(现有实现风格)。

**持久化**:`LayoutState` 形状如果因为 `movePaneToSplit` 引入新字段就升 `veda-agent:layout:v1 → :v2`,并在提交报告里写明"数据格式变更"。若形状不变则**不升版本**,只在 `load()` 里保持"按树重建、丢弃树上不存在的 pane 记录"的既有防线(`src/layout/useLayout.ts:8-29`)。

## 7. 窄窗降级

现状只有一条 `@media (max-width:1080px)` 调了笔记侧栏宽度(`src/styles.css:138`),没有系统性策略(缺口,`02-gui-layout-and-haze.md:95`)。补三条:

1. **分割方向降级(核心)**:可用宽 < `2 × --app-pane-min(180) + 5px 分隔器` 时,`row` 分割在**渲染时**按 `column` 排。树不变、ratio 不丢、变宽自动还原。实现成一个纯函数 `renderDirection(node, availableWidth)`,可单测。
2. **工具栏降级**:内容宽 < 720px 时,工具入口与「新建/布局」收进一个溢出菜单,只留工作区 chip、状态簇、窗口按钮。
3. **标签降级**:内容宽 < 520px 时标签只留图标(可访问名称保留),`title` 提供全称。

阈值集中在 `src/ui/layout-metrics.ts` 一处,不要在 CSS 与 TS 里各写一份。

## 8. 组件库设计(本地原语层)

上一版这一节只有一张"Ark 用在哪"的映射表,那不是设计 —— 没有谁长什么样、有哪些状态、
键盘怎么走、可访问名称从哪来、`features` 该怎么用。这一节补上,并且它是**后续所有 UI
代码的唯一依据**(8.3 那张视觉表就是"组件长什么样"的出处)。

### 8.1 分层:三层,单向依赖

```text
src/ui/*          本地原语层 —— 唯一允许 import 第三方原语(Ark / Radix)与图标的地方
   ↑              只依赖 tokens.css 与自身
src/layout/*      布局引擎(tree.ts 纯函数 + LayoutView/Divider 渲染)—— 只依赖 src/ui
src/features/*    业务面板 —— 只依赖 src/ui 与 src/layout
```

三条纪律(都要能被 review 一眼判定):

- `src/features/**` 里出现 `from '@ark-ui/…'` 或 `from '@radix-ui/…'` 即为违规。
- `src/ui/*` 里出现 `rgba(`、`#rrggbb`、字号/圆角的字面量(`px`)即为违规 —— 视觉值只能来自
  `var(--app-*)`。唯一例外:`1px` 发丝线,与绝对定位需要的 `0`。
- token 只允许"库变量 → `--app-*`"单向;禁止反向,禁止新增第二个前缀(`component-library-selection.md:206`)。

命名:组件 `V` 前缀(`VButton` / `VMenu`),CSS 类 `v-` 前缀(沿用现有 `.v-icon` / `.v-input`,
`styles.css:64-77`),一组件一文件 `src/ui/VXxx.tsx`。

### 8.2 组件清单(本期全量)

| 组件 | 职责 | 底层 | 文件 | 本期 |
| --- | --- | --- | --- | --- |
| `VButton` | 唯一按钮 | 纯自绘 | `ui/VButton.tsx` | 要 |
| `VIconButton` | 图标按钮(工具栏 / 面板栏) | 纯自绘(现有 `.v-icon`) | 同上 | 要 |
| `VToolbar` `VToolbarGroup` `VToolbarSpacer` | 顶栏三区容器 | 纯自绘 | `ui/VToolbar.tsx` | 要 |
| `VStatusBadge` `VStatusCluster` | 运行中 / 未保存 / 失败 的聚合与展开 | 自绘 + Ark `popover` | `ui/VStatus.tsx` | 要 |
| `VMenu`(Root/Trigger/Content/Item/Separator/CheckboxItem) | 所有下拉:工具溢出、布局、标签「移动到…」 | Ark `menu` | `ui/VMenu.tsx` | 要 |
| `VPopover` | 状态簇展开、轻量浮层 | Ark `popover` | `ui/VPopover.tsx` | 要 |
| `VToast` `VToastProvider` | 通知;错误态必须带文字 | Ark `toast` | `ui/VToast.tsx` | 要 |
| `VPane`(frame/bar/actions/body) | 面板容器:一条栏 + 内容 | 纯自绘(现 `LayoutView` 的 `.group*`) | `layout/` 内拆出 | 要 |
| `VTab` `VTabList` | 标签(含 dirty/error 标记、双击改名) | 自绘 + ARIA;改名用 Ark `editable` | `ui/VTab.tsx` | 要 |
| `VSplitter` | 分割命中区 + 键盘调比例 | 纯自绘(现 `Divider.tsx`) | `layout/Divider.tsx` 收编 | 要 |
| `VInput` `VTextarea` `VSearchField` | 输入(现有 `.v-input` / `.v-search`) | 自绘 + Ark `field`(校验态) | `ui/VInput.tsx` | 要 |
| `VField`(Label/Control/ErrorText) | 表单行与错误说明 | Ark `field` | `ui/VField.tsx` | 要 |
| `VSwitch` `VSegmentGroup` | 设置里的开关与分段(材质、减少透明度) | Ark `switch` / `segment-group` | `ui/VSwitch.tsx` | 要 |
| `VScrollArea` | 统一滚动条外观 | Ark `scroll-area` | `ui/VScrollArea.tsx` | 要(笔记列表 / 长菜单) |
| `VEmptyState` | 空态:标题 + 动作 + 提示 | 纯自绘 | `ui/VEmptyState.tsx` | 要 |
| `VRule` | 1px 发丝分隔(唯一的结构边界表达) | 纯自绘 | `ui/VRule.tsx` | 要 |
| `VTooltip` | 提示 | Radix(保留,选项 A) | `ui/Tooltip.tsx` | 已有,改名收编 |
| `VDropZoneOverlay` | 拖拽落点指示 | 纯自绘 | `layout/DropZone.tsx` | 第 4 步 |
| `VCommandPalette` | ⌘K 命令面板 | Ark `combobox` + `dialog` | `features/command/` | 第 6 步 |
| `VTree` | 工作区 / 笔记树 | Ark `tree-view` | `ui/VTree.tsx` | 阶段 3(非本期) |

**明确不做**:`VCard`(卡片岛是禁止项)、第二种线型、任何自带阴影/边框/背景的容器、任何"主题层"。

### 8.3 视觉规格:组件只允许引用 token

这是"组件长什么样"的唯一出处。代码中出现表外的字面量,即为 8.1 的违规。

| 组件 | 高度 | padding | 圆角 | 字体 | rest | hover | active/selected | disabled |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `VButton` md | 28 | 0 10 | `--app-radius` | 11.5 / 500 | `transparent` | `--app-hover` | `--app-active` | `--app-text-subtle` + `cursor: default` |
| `VIconButton` | 28×32 | — | `--app-radius` | — | `transparent` | `--app-hover` | `--app-active` | 同上 |
| `VToolbar` | `--app-toolbar-height` | 0 12 0 16 | 0 | — | `--app-toolbar` | — | — | — |
| `VTab` | 25 | 0 9 | 6 | 11.5 / 400 | `--app-text-subtle` | `--app-hover` | `--app-active` + `--app-text` | — |
| `VPane` frame | 撑满 | 0 | `--app-radius` | — | `--app-surface` | — | 活动标记见下方注 | — |
| `VSplitter` | 5 命中 / 1 视觉 | — | — | — | `--app-hairline` | `--app-hairline-strong` | — | — |
| `VInput` | 26 | 5 8 | 6 | 11.5 / 400 | `--app-surface-glass` | — | — | — |
| `VMenu` content | — | 4 | `--app-radius` | 11.5 / 400 | `--app-surface-strong` | `--app-hover` | `--app-active` | `--app-text-subtle` |
| `VToast` | — | 9 11 | `--app-radius` | 11.5 / 400 | `--app-surface-strong` | — | — | — |
| `VEmptyState` | — | 24 | — | 12 / 400 | 居中 `--app-text-subtle` | — | — | — |

**活动面板怎么标**:不得新增边框或阴影(规范禁止,见 §10)。两条允许路径,优先第 ②:
① 只用 `--app-hairline-strong` 的内描边;② `.group-bar` 的文本分级 —— 活动面板 `--app-text`,
非活动 `--app-text-subtle`,靠字重与明度差表达。

### 8.4 状态表达:颜色永远不是唯一信号

出处 `02-gui-layout-and-haze.md:134`(焦点不能只靠颜色)与 `:137`(错误不能只靠红色)。

| 状态 | 颜色 | 必须同时给的第二信号 |
| --- | --- | --- |
| 键盘焦点 | — | **2px 外描边** `--app-focus-ring` + `outline-offset: 1px`;不用 box-shadow(禁阴影) |
| hover | `--app-hover` | 无(指针已在场) |
| selected / active | `--app-active` | 字重 +150 或明度提到 `--app-text` |
| 未保存 dirty | 点 → 方块 | 形状变化(实心方块代替空心点)+ `title="未保存"` |
| 保存失败 | `--app-danger` | **文字**「保存失败」+ 图标;不允许只变红 |
| 禁用 | `--app-text-subtle` | `aria-disabled` + `cursor: default`;不靠降低透明度(禁用态仍需对比度) |
| 加载中 | — | 文案变化(`VStatusBadge` 文本),不只转圈 |

这一节需要两个现有 token 集里没有的值,必须在 `:root` 里定义(否则又变成"散落在组件里的值"):

```css
--app-focus-ring: rgba(214, 226, 255, 0.55);  /* 焦点环:冷白,压在冷底上不读成灰点 */
--app-danger: #d98b8b;                         /* 失败/错误:冷调红,不刺眼 */
```

### 8.5 a11y 合同(每个组件必填;缺一条不算完成)

| 组件 | role / 语义 | 可访问名称来源 | 键盘 | 断言(可测) |
| --- | --- | --- | --- | --- |
| `VButton` `VIconButton` | `button` | 可见文本;图标按钮必须 `aria-label` | Enter / Space | 焦点可见且是 2px 环,而非仅变色 |
| `VToolbar` | `toolbar` + `aria-label="工作区工具"` | 固定 | Tab 左→右;离开后进入布局区 | 顶栏与布局区之间有焦点边界,不回跳 |
| `VTab` `VTabList` | `tablist` / `tab` + `aria-selected` | 标签文本 | ←→ 切标签;`Ctrl+Tab` 跨组 | 每个标签可读名称 = 标题(+「未保存」) |
| `VPane` | `region` + `aria-label=<标题>` | 活动标签标题 | — | 非活动标签里的面板不参与 Tab 序列 |
| `VSplitter` | `separator` + `aria-orientation` + `aria-valuenow/min/max` | `aria-label="调整列宽"` | 方向键,步进 0.02 | 键盘能改比例(`Divider.tsx` 现已满足) |
| `VMenu` | Ark 提供 `menu` / `menuitem` | Trigger 的 `aria-label` | ↑↓ / Enter / Esc / Home / End | 打开后焦点进第一项,Esc 回到 Trigger |
| `VPopover` | Ark 提供 | Trigger 名称 | Esc 关闭 | 关闭后焦点不丢 |
| `VToast` | Ark 提供 `status` / `alert` | 文案 | 可关闭 | 错误用 `alert`(读屏打断),成功用 `status` |
| `VInput` `VField` | `textbox` + 关联 `label` | `VField` 的 label | Tab / Shift+Tab | `aria-invalid` 与错误文本用 `aria-describedby` 关联 |
| `VCommandPalette` | Ark `dialog` + `combobox` | `aria-label="命令面板"` | ⌘K 开,↑↓ 选,Enter 执行,Esc 关 | 打开时焦点进输入框,关闭回原焦点 |

### 8.6 底层映射(Ark 用在哪 / 不用在哪)

对齐 `component-library-selection.md` §0:新增交互一律 Ark 无样式原语;图标继续 Lucide;`splitter` 与 chrome **不用** Ark。

| 交互 | 用什么 | 落在哪 | 必须压掉什么 |
| --- | --- | --- | --- |
| 工具溢出 / 布局菜单 / 标签「移动到…」 | Ark `menu` | `ui/VMenu.tsx` | 默认圆角、阴影、浅色浮层底 |
| 状态簇展开 | Ark `popover` | `ui/VPopover.tsx` | 同上 |
| 运行中 / 保存失败通知 | Ark `toast` | `ui/VToast.tsx` | 同上;错误态不能只靠颜色 |
| 命令面板 | Ark `combobox` + `dialog` | `features/command/` | 同上 |
| 就地改名(标签 / 笔记标题) | Ark `editable` | 用到时才建 | 同上 |
| 面板标题栏 / 标签 / 分隔器 | **自绘**(`LayoutView.tsx` / `Divider.tsx`) | 现状保留 | — |
| 布局树 | **自绘**(`src/layout/tree.ts`) | 现状保留 | 不用 Ark `splitter`(`component-library-selection.md:81`) |
| 提示 | Radix Tooltip 保留(选项 A) | `ui/Tooltip.tsx` | 已有 |

**引入纪律**(`component-library-selection.md:206-210`):token 单向;库只出现在 `src/ui/*`;
每引一个库,必须在 `docs/architecture/05-acceptance-checklist.md` 加一条 a11y 断言。

### 8.7 目录与样式约定

- 新增样式进 `src/ui/ui.css`,按 8.2 顺序分段;不再往 `src/styles.css` 里堆。
- `src/styles.css` 只留:全局 reset、`.app-shell`、`.topbar`、布局树骨架(`.split*`),
  以及**待迁移**的面板内部样式(逐个搬到 `features/<name>/<name>.css`)。
- 每个组件文件顶部三行:它是什么 / 底层是什么 / **为什么不是别的**。
  例:`VTab` 不用 Ark `tabs`,因为标签组 chrome 由布局树驱动,Ark 的 tabs 会引入第二套选中状态。
- 图标一律 Lucide,`size` 14~16、`strokeWidth` 1.7~1.8。

### 8.8 组件级验收(每个组件提交时逐条打勾)

1. 视觉值全部来自 token:8.3 表外无字面量。
2. 状态表达满足 8.4「颜色不是唯一信号」。
3. 8.5 对应行全部满足,且至少有一条测试断言。
4. `src/features/*` 里不出现该组件底层的库 import。

## 9. Haze 适配层怎么落(不装 haze)

`02-gui-layout-and-haze.md:16` 明确:在确认真实包名/版本/API 之前,**不得凭 `haze` 这个名字导入未知模块**。实测结论是这个包不存在可核实的实体;真正在提供材质的是**两条我们自己掌握的通道**:

1. Rust 侧窗口材质(`system-acrylic`,已定稿);
2. CSS 侧 token(`--app-*`,唯一真源)。

所以适配层包的是**这两条真实通道**,而不是一个虚名:

```ts
// src/ui/haze/index.ts
export interface MaterialAdapter {
  kind: 'acrylic' | 'solid';
  className: string;
  style?: Record<string, string | number>;
}
export interface HazeAdapter {
  toolbar(): MaterialAdapter;
  paneFrame(active: boolean): MaterialAdapter;
  popover(): MaterialAdapter;
  supportsReducedTransparency(): boolean;
}
```

规则:

- **降级不是可选项**:`supportsReducedTransparency()` 为假、用户要求减少透明、或材质调用失败时,一律回落到 `kind: 'solid'`(用 `--app-surface-strong` 这类近不透明组合),**启动不能失败**(`02-gui-layout-and-haze.md:126`、`05-acceptance-checklist.md:15`)。现状已满足一半:非 Windows 走 stub、材质失败只打日志;缺的是**用户可见的减少透明度开关**与适配层这个落点。
- **减少动画**同样只做 CSS 侧(媒体查询),本期不引入 JS 动画预算系统。
- 业务面板只认本地抽象,不认材质实现。

## 10. token 与命名对齐

`02-gui-layout-and-haze.md:47-63` 给了一份"至少定义"的清单,和 `tokens.css` 现名有出入。按实现定稿,并把**有意丢弃**的写清楚(否则下一个读者会以为是漏了):

| 规范里的名字 | 现名 | 定名 | 说明 |
| --- | --- | --- | --- |
| `--app-bg` | `--app-scrim` | `--app-scrim` | 它就是整窗那层 tint;叫 bg 会让人以为是不透明底 |
| `--app-pane-min-width` | `--app-pane-min` | `--app-pane-min` | 短名更好读,已用于 `.split-part` |
| `--app-radius-panel` | `--app-radius` | `--app-radius` | 只有一档圆角,不需要限定词 |
| `--app-surface-glass` | 同名 | `--app-surface-glass` | 保留(输入框/浮层预览用) |
| `--app-text` / `-muted` / `-subtle` | 同名 | 保留 | — |
| `--app-accent` | 同名 | 保留 | — |
| `--app-toolbar-height` / `--app-tab-height` / `--app-divider` | 同名 | 保留 | 布局需要,已有 |
| `--app-border` | — | **丢弃** | 规范自己禁止边框(`tokens.css:9`),结构边界只允许 `--app-hairline` 一次表达 |
| `--app-surface-glass-border` | — | **丢弃** | 同上,发丝线已独占边界表达 |
| `--app-shadow-panel` | — | **丢弃** | 阴影集中在宿主层由 DWM 画;"面板阴影"会把阴影散回业务组件 |
| `--app-blur-panel` | — | **丢弃** | 模糊由 OS 材质提供且只在窗口层;组件层再写一份等于第二处真源 |
| `--app-pane-gap` | — | **不新增** | gutter = 0 是既定选择(`tokens.css:47-55`):面板紧邻,边界交发丝线 |

## 11. 验收增补

不改既有条目,只加。全部落到 `docs/architecture/05-acceptance-checklist.md`:

1. 窗口内容铺满窗口矩形:无 §0.1 那圈裸材质窄带(量法可复现:窗口右缘 10px 内不应出现比相邻内容亮近两倍的色带)。
2. 拖拽移动面板可用,**且**每个标签的「移动到…」菜单能键盘完成同样的移动。
3. 同类面板并排:用"新建/分割"路径可达(不是入口点击)。
4. 窄窗降级:把窗口拖到 `2×pane-min` 以下,`row` 分割应变为纵排且不丢 ratio;工具栏入口应进溢出菜单。
5. 未保存/保存失败不再只靠颜色表达(形状或文本至少有一条)。
6. 每引入一个库在此清单加一条 a11y 断言(焦点环可辨、可访问名称、键盘可达)。
7. **数值化性能预算**(全部现有文档都缺,本文首次给):
   - 拖分隔器 / 拖标签时,掉落帧率不低于 55fps(60Hz 目标);
   - 单次布局操作(open/close/split/move/focus)`tree.ts` 纯计算 < 1ms,含一次渲染 < 16ms;
   - 面板隐藏(不可见标签)时暂停该面板的重型订阅与定时器(`02-gui-layout-and-haze.md:131` 的定性要求的可测版本);
   - 材质/透明区域不得覆盖高频重绘画布(`:130` 已有,沿用)。

## 12. 分期(每步可独立验收,按顺序)

| 步 | 内容 | 可见收益 | 风险 |
| --- | --- | --- | --- |
| 1 | §0 三条窗口级缺陷 + §10 命名/清理 | 边缘亮带消失;代码里不再有"其实没有 Mantine"的注释 | 低(config 一行 + CSS/注释) |
| 2 | §9 Haze 适配层落位(不装库,只立本地抽象与降级开关) | 减少透明度成为一个真开关 | 低 |
| 3 | 工具栏三区 + 状态簇 + 新建/布局菜单(Ark `menu`/`popover`) | 工具栏符合 `:73` 结构;状态不再堆在按钮上 | 中:第一次引 Ark,要过引入纪律 |
| 4 | §5 拖拽移动 + 键盘替代 + §6 树 API 与单测 | 面板能移动;`tree.ts` 与验收对齐 | 中:树操作最容易写出退化 bug,单测先写 |
| 5 | §7 窄窗降级 | 小窗口不再挤坏 | 低:纯渲染层 |
| 6 | 命令面板(Ark `combobox` + `dialog`) | `⌘K` | 中:新功能面,单独验收 |

每一步的提交报告都要写清:**真实实现 / 占位实现 / 未完成项 / 是否改了数据格式**(`05-acceptance-checklist.md:82-93`)。

## 13. 非目标(本期明确不做)

- 不做固定的 Agent 左栏或工具右栏;不为每种组合写专属布局组件(`02-gui-layout-and-haze.md:98-102`)。
- 不引入 Mantine;不引 dnd-kit(除非跨窗口拖拽成为需求)。
- 不做笔记编辑器与白板引擎 —— 那是 `component-library-selection.md:193-200` 列的清单缺口,属于独立阶段,不能被布局阻塞,也不能被布局假装实现了。
- 不改 Rust 材质通道(已定稿 `system-acrylic`),不动窗口控制按钮的自绘逻辑。
- 不做多窗口。
- 不把 Haze 当成一个要真装的包;适配层只包我们自己的两条通道。

## 12.1 进度(与本文对齐,别让文档和代码脱节)

| 步 | 状态 | 说明 |
| --- | --- | --- |
| 1 | **已完成** | §0.1 黑框:改 `src-tauri/tauri.conf.json` 的 `shadow: false`,实测窗口 2160×1380 = 客户区 2160×1380(inset 0×0);§0.2 未保存/失败不再只靠颜色(`.tab-dirty` 方块 + `Save failed` 文字 + `--app-danger`);§0.3 Mantine 注释已订正;§10 的两个新 token(`--app-focus-ring` / `--app-danger`)已入 `tokens.css` |
| 2 | 未开始 | Haze 适配层(`src/ui/haze/`) |
| 3 | **部分完成** | 已落 `src/ui/ui.css` + `VButton` + `VEmptyState`,接进 `App.tsx`:空工作区从一行 `No pane open` 换成「Nothing open yet + Agent / Notes / Board 三个出口 + 一句说明」。工具栏三区与状态簇待做 |
| 4 | 未开始 | 拖拽移动(`tree.ts` 三个新函数 + 键盘替代) |
| 5 | 未开始 | 窄窗降级 |
| 6 | 未开始 | 命令面板 |

另记一条属于**取值**而非设计的调整:材质层 `tint_opacity` 0.15 → 0.35(见 `src-tauri/src/acrylic.rs`),
CSS `--app-scrim` 0.66 → 0.78(见 `src/ui/tokens.css` 顶部注释:原因与合成计算都在那里)。
两层相乘,所以"更不透"现在有两处可调,而不是只靠把 scrim 压到不透明。
