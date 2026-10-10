# 组件库选型(针对当前仓库结构与设计规范)

> 输入:用户汇总的一份组件库/图标/画廊清单(87 条)。
> 本文只做选型与理由,不改动代码。所有版本号、peer 依赖、组件清单、下载量均为**实测**(命令见 §7)。
> 核验时间:2026-10-06。

## 0. 结论(先看这个)

| 位置 | 结论 | 对象 | 一句话理由 |
| --- | --- | --- | --- |
| 交互原语(新增统一走这里) | **采纳** | `@ark-ui/react` 5.39.3 | 实测 0 个 CSS 文件 + `sideEffects:false`,React 19 可用,组件面正好覆盖路线图(tree-view / toast / combobox / floating-panel / date-picker …) |
| 图标 | **保持** | `lucide-react`(本仓 0.468.0,最新 1.52.0) | 已是全仓唯一图标系统,16 / 1.8 的用法贯穿 6 个组件 |
| 现有 Tooltip 原语 | **保留不重写**,或一次性收尾到 Ark | `@radix-ui/react-tooltip` 1.3.0 | 29 行、已满足需求;只是不再扩散第二个原语家族 |
| 整套组件库 | **暂不引入**,留触发条件 | `@mantine/core` 9.7.1 | 清单里唯一「默认视觉可整套压掉」的完整库,但现在没有对应需求,且会引入第二套 token |
| 图标补集 | **条件采纳** | `@iconify/react` 6.0.2 + `@iconify-json/*` | 只补 Lucide 没有的字形(品牌 logo),必须走离线包 |
| 其余 80+ 条 | **不采纳** | — | 按原因分四组,见 §3 |

一句话:**项目的壳层继续自持,新增交互组件一律用 Ark UI 的无样式原语,图标继续用 Lucide;整套组件库(Mantine)降级为「有明确需求再触发」的备选。**

---

## 1. 判据:从本仓现有约束反推的 7 条硬标准

选型不能只看「哪个库组件多」,要先用仓库自己的规范筛一遍。以下 7 条全部有出处。

| # | 标准 | 出处 |
| --- | --- | --- |
| 1 | 默认视觉必须能被**整套压掉**:无边框、无阴影、无卡片岛、中性灰、结构边界只允许一条发丝线 | `src/ui/tokens.css` 顶部注释(「No borders, no shadows, no dividers」)、`--app-hairline` 注释、`src/styles.css` 的 `.divider::after` / `.settings-sheet` 注释 |
| 2 | 颜色与透明度只有**一处真源** `--app-*`,且 alpha 叠加有实测算术(透出 ≈ (1−scrim)×(1−tint)) | `src/ui/tokens.css`、`docs/ui-stack-decision.md` 附录 |
| 3 | 宿主自持:产品行为不得藏进通用组件库 | `README.md`「Component direction → Local Veda primitives」、`docs/architecture/02-gui-layout-and-haze.md` §5(「不要为每种组合写一个组件」) |
| 4 | **无头优先**:库只提供行为与可访问性,样式自己写 | `src/ui/Tooltip.tsx` 的注释(明确写了「为了它把一整套设计体系装进来再逐条压掉,是负收益」) |
| 5 | a11y 是验收项:焦点环不能只靠颜色、分隔器要能键盘操作、工具栏/标签要有可访问名称 | `docs/architecture/02-gui-layout-and-haze.md` §7、`docs/architecture/05-acceptance-checklist.md` |
| 6 | 桌面离线运行(Tauri + WebView2):不得依赖运行时 CDN 拉取资源 | 见 §6 的现状提醒(字体已经在踩这条) |
| 7 | 技术栈已定型:Tauri 2 + React 19.3 + Vite 6 + TS 5.7 严格模式 | `package.json`、`docs/ui-stack-plan-a-vs-plan-b.md` |

第 7 条同时是最强的过滤器:凡不是 **React + 无跑时样式注入**的库,直接出局。

---

## 2. 采纳项与落地规则

### 2.1 `@ark-ui/react` —— 交互层主选(新增组件统一走这里)

**实测数据**(`npm view` + 解包 `ark-ui-react-5.39.3.tgz`):

| 项 | 值 |
| --- | --- |
| 版本 | 5.39.3 |
| peer | `react >=18.0.0`(React 19.3 可用) |
| 自带样式 | **0 个 `.css` 文件** |
| `sideEffects` | `false`(可摇树) |
| 按需子路径 | `exports["./*"]` → 支持 `import { Combobox } from '@ark-ui/react/combobox'` |
| 依赖 | 69 个 `@zag-js/*`(每组件一个状态机,摇树后只留用到的) |
| 月下载 | 4,141,916 |

**组件清单**(实测自包内 `dist/components/`,节选):

```
accordion avatar carousel checkbox clipboard collapsible color-picker combobox
date-picker dialog drawer editable field file-upload floating-panel hover-card
json-tree-view listbox marquee menu navigation-menu number-input pagination
pin-input popover progress qr-code radio-group rating-group scroll-area
segment-group select signature-pad slider splitter steps switch tabs tags-input
timer toast toc toggle-group tooltip tour tree-view
```

**对上本项目的待办**:

| 路线图需求 | 用 Ark 的哪个 |
| --- | --- |
| 命令面板(工作区/笔记/面板 快速跳转) | `combobox` + `dialog` 自组(约 50 行) |
| 工作区 / 笔记树 | `tree-view` |
| 运行中 / 保存失败 / Agent 状态通知 | `toast` |
| 面板内的就地改名、字段编辑 | `editable`、`field`、`tags-input` |
| 浮层:菜单、弹层、抽屉、提示 | `menu`、`popover`、`drawer`、`tooltip` |
| 标注 / 首次引导 | `tour`、`steps` |
| 结构调试(可选) | `json-tree-view` |

**明确不用它的地方**:

- **不用 `splitter` 替换 `src/layout/tree.ts`**。布局树是领域模型(带 `localStorage` 持久化、比率裁剪 `[0.15,0.85]`、15 个单测),不是样式组件;`docs/architecture/02` 要求的是「分割树 + PaneRegistry」,Ark 的 splitter 只是渲染层。
- **不让 Ark 决定 chrome**。面板标题栏、标签、分隔器继续由 `LayoutView.tsx` / `Divider.tsx` 自绘。

**为什么不是清单里的另一个无头候选(Headless UI 2.2.10)**:

实测其 `dist/components/` 覆盖为:`button checkbox combobox dialog disclosure field fieldset focus-trap input label legend listbox menu popover portal radio radio-group select switch tab tooltip transition`。

- 有 tooltip / tabs / popover,可用;
- 但**没有** `tree-view`、`toast`、`date-picker`、`floating-panel`、`tags-input`、`scroll-area`、`navigation-menu` —— 恰是路线图下一步要用的那几个;
- 且其文档与 Catalyst UI Kit 都以 Tailwind 为主叙事,示例默认 Tailwind 写法。

→ 结论:Headless UI 可作为 Ark 的降级替代,但不作为起点。

**为什么不是清单里的 Zag**:Zag 是 Ark 的底座(Ark 的 69 个依赖就是它)。直接用 Zag 等于自己写 React 绑定、a11y 结构与 `data-*` 属性协议,而 Ark 已经做了这件事。

**为什么不是 Kobalte**:SolidJS 生态,不适用(§3.1)。

**成本(如实记录)**:引入一个 69 依赖的包;摇树只保留用到的状态机,但依赖图会被拉起。与现有 Radix 家族的并存期需要一条纪律(§2.3)。

### 2.2 `lucide-react` —— 图标,保持

- 现状:`0.468.0`,全仓统一用法(`size 14~16`、`strokeWidth 1.7~1.8`),`PANE_REGISTRY` 的 `icon` 类型只声明 `size`/`strokeWidth`。
- 与判据 1 一致:单色 stroke 图标,不引入第二套视觉语言,也不需要为它准备主题。
- **不用清单里的 Ionicons**:它是另一套字形语言(filled / outline 双形态、不同网格与笔画),和 Lucide 混用会立刻读出不统一;它也没有 Lucide 覆盖不到的能力。
- **Iconify 只做补集**(条件采纳):`@iconify/react` 6.0.2 默认**从网络取 SVG**,对离线桌面应用不成立;要用就装 `@iconify-json/<set>` 离线包,并只在「Lucide 确实没有」时使用(典型是品牌 logo:模型供应商、代码托管等)。当前没有这个需求 → 暂不安装。

### 2.3 现有 Radix Tooltip 怎么处理(二选一,不建议第三种)

| 选项 | 做法 | 成本 | 评价 |
| --- | --- | --- | --- |
| **A(推荐)** | 保留 `@radix-ui/react-tooltip`,此后新增交互一律 Ark | 0 | 最小改动;代价是并存期两个无头家族 |
| **B(收尾)** | 把 `src/ui/Tooltip.tsx`(29 行)迁到 Ark 的 `tooltip`,卸掉 `@radix-ui/react-tooltip` | 约半小时 | 换来「只有一个原语家族」。可一并清掉实测的 19 个 `@radix-ui/*` 传递包 + 4 个 `@floating-ui/*`(lockfile 里 20 个 `@radix-ui` 条目全部) |
| C(不推荐) | 继续扩 Radix | — | Radix 缺 tree / combobox / toast / date-picker,最终还是得引第二个库 |

两个家族本身并不冲突(都是无样式 + `data-*` 属性 + `asChild` 风格,共用同一套 `--app-*` token),所以 A 是可接受的长期状态;B 只是把「一个概念一个实现」这条项目纪律执行到底。

### 2.4 `@mantine/core` —— 备选,附触发条件(不现在装)

**为什么它仍是清单里最有资格的「整套组件库」**:

- 实测 `9.7.1`,peer `react: ^19.2.0`,与本项目 19.3.0 原生匹配(不要兼容区间);
- 全 CSS 变量 + `extend()`,默认视觉确实可以被整套压掉 —— 这正是判据 1 要求的;
- 组件面在候选中最完整,`@mantine/spotlight`(命令面板)、`Tree`、`@mantine/notifications` 直接对应本路线图;
- 月下载 10,428,550,是完整组件库这一档里最高的。

**为什么现在不装**:

1. **本仓已经做过一次往返**:装 Mantine → 逐条压掉 → 最后移除(见 §6 现状核对)。当时的结论是「为 29 行的 tooltip 装一整套设计体系再压掉」是负收益。
2. 它带来第二套变量前缀 `--mantine-*`,与判据 2「只有一处真源」冲突;而这个冲突必须靠纪律(单向映射)解决,不是靠配置。
3. Ark 已经覆盖路线图上全部交互组件,当前没有只有 Mantine 能做的需求。

**触发条件**(满足任一再评估,不必提前):

- 需要虚拟化大数据表格(几百行 × 多列,带排序/筛选/固定列);
- 需要完整表单能力(字段编排 + 校验)且不想用 React Hook Form + Zod;
- 需要复杂日期/时间选择器,而 Ark 的 `date-picker` 不够用。

**若启用,必须遵守**:`--mantine-*` → `--app-*` 单向映射(不许反向,不许新前缀);只 import 用到的组件样式;禁止在 `features/*` 里出现库的内联视觉。

---

## 3. 拒绝项(按原因分组)

### 3.1 框架不匹配 —— 完全不可用

| 库 | 实际框架 |
| --- | --- |
| Element Plus、Naive UI、Arco Design Vue、PrimeVue、Nuxt UI | Vue |
| PrimeNG | Angular |
| Kobalte | SolidJS |
| Haze | Compose Multiplatform(Kotlin/Gradle;已在 `docs/ui-stack-decision.md` §1 核实) |

**bezel —— 清单里唯一需要单独成节的一条(见 §8)。** 它不是一个「组件库」:实测它自带 `editor`(Notion 式块编辑器)、`markdown`、`canvas` / `canvas-core`(基于 JSON Canvas 的无限画布)、`syntax`、`table`、`tree`、`docking`、`terminal`、`browser`(内嵌 webview)、`theme`、`motion`、以及 `icons`(**就是 Lucide**);而它构建在**它自己的 gpui fork** 上(`bezel-gpui` 0.3.17+zed.ba42ab;上游 zed 的 `gpui` 是 0.2.2)。所以「用 bezel」不是加一条依赖,而是换渲染底座 —— 这是架构决策,不是组件库选型 → 完整评估见 **§8**。

### 3.2 Tailwind 系 —— 要先改构建与样式范式

daisyUI、Park UI、AlignUI、coss ui、Preline UI、Catalyst UI Kit、HyperUI、Meraki UI、Tailgrids、Float UI、Kibo UI、beUI。

理由:

1. 要引入 Tailwind(其 preflight 会改写基础样式)+ 一层 utility,等于在 `tokens.css` 之外开出**第二套样式系统**;
2. Tailwind 组件的圆角/阴影/边框/间距**写在调用点**,而本项目规范恰恰是「这些值只能来自 token,边框只允许一条 7% 的发丝线」——用 utility 等于每次调用都要重新审计一遍规范;
3. 透明叠加的算术(`tokens.css` 里那段 scrim / tint 注释)在 utility 类名里**不可见**,而它正是这个壳最容易出错的地方(「材质开了却看不出变化」的头号成因就是自己的底色太厚);
4. 桌面应用的组件面固定且小,收益不抵构建复杂度。

**值得单独说的一条**:**Park UI = Ark UI + Tailwind**。我们要的正是它里面 Ark 的那一半 —— 所以直接取 Ark、跳过 Tailwind。

这些库的真实价值是**视觉参考**(将来做官网 / 文档页时可用),不进入应用构建。

### 3.3 完整组件库 —— 默认视觉权重过高,压规范成本 > 收益

| 库 | 实测版本 | 不选的理由 |
| --- | --- | --- |
| antd | 6.6.5 | 表格与复杂表单最强,但默认视觉最重,且是 cssinjs 运行时;本项目当前没有任何表格需求。留作「真要做数据密集型后台」时的备选,优先级低于 headless 表格 |
| @chakra-ui/react | 3.37.0 | 需 `@emotion/react >=11`(运行时 CSS-in-JS)+ 自带完整 token 体系。**关键事实:Chakra 3 就是建在 Ark UI 之上的** —— 所以「用 Ark,不用 Chakra」= 只要行为层,不要它那套样式系统 |
| @heroui/react | 3.2.6 | peer 直接要求 `tailwindcss >=4` + `react-aria` 全家 → 同 §3.2 |
| primereact | 11.2.0 | 组件数量最多,但传统桌面观感(卡片 / 边框 / 高密度),主题覆盖成本高;维护活跃度是候选最低一档(月下载 1,356,384,差一个数量级) |
| Base Web / Atlassian Design(Atlaskit) | — | CSS-in-JS(styletron / 每包样式)运行时;企业 DS 的体量与语义都不匹配本项目。Atlassian 还不是「一个包」而是几十个包的设计体系 |
| @gravity-ui/uikit | 7.50.1 | 这组里唯一「CSS 变量驱动、覆盖成本接近 Mantine」的,数据密度也合适;但月下载 92,499(比 Mantine 低两个数量级),生态小,同样带来第二套 token。记为 Mantine 的平级备选,不单独引入 |
| Tremor | — | 图表 / 看板专用且是 Tailwind 系;本项目没有看板需求。将来做用量/成本指标时,倾向手绘 + token,或选 headless 图表库 |

### 3.4 画廊 / 模板站 / 小生态组件集 —— 不是可安装依赖,或定位不匹配

- **Navbar Gallery、Supahero、Footer.design、SaaSFrame**:站点区块画廊,面向营销页。本项目是桌面工作区,顶栏 / 面板 / 浮层全部自持,没有可用区块。
- **Atlassian Design**:同时是「组件体系」与「设计语言文档站」。设计语言部分可作参考,组件部分见 §3.3。
- **21st.dev、Kibo UI、coss ui**(shadcn 式 copy-paste 注册表):代码是「Tailwind + Radix 的成品片段」。要用就得先有 Tailwind(§3.2);并且 copy-paste 进来的成品仍然要逐条压规范,不如直接写。
- **beUI、AICSS、RikkaUi、Camarts**:定位是「动效优先的 React 组件集」或「AI 对话 UI 组件集」,生态与成熟度均未验证(**这些我没有找到可核实的发布数据,不作推荐**)。其中 AI 对话类可以**仅作为参考**:阶段 5 接真实 Agent 会话时看一眼它们的消息/工具调用呈现方式,实现仍然自己写。

---

## 4. 清单缺口:路线图需要,但清单里没有的

这一节超出清单范围,但不写会误导——**清单里没有任何一条能解决下面这四件事**,而它们都在 `docs/architecture/06-legacy-capability-migration.md` 与阶段计划里:

| 缺口 | 路线图里的指向 | 建议 |
| --- | --- | --- |
| 笔记编辑器 | 06 文档:可评估保留 **Tiptap / Markdown** 内容转换与富文本 Schema | 选 headless 编辑器(CodeMirror 6 或 ProseMirror/Tiptap),主题与 Portal 由宿主适配(02 §7),保存只走 `NoteService` |
| 白板画布 | 06 文档:**Konva** 或等价渲染算法 | 必须支持「原生对象 + 笔记引用对象」两类模型(03 §4),所以**不能**选卡片式白板组件库;Canvas 层 + `BoardService` 结构化操作 |
| 虚拟化列表 / 拖拽 | 05 验收清单要求「面板隐藏时暂停重型渲染」等性能项 | `@tanstack/react-virtual`(Headless UI 自己也在用它)+ `dnd-kit` |
| 命令面板 | 02 §4 工具栏固定工具变多要进菜单 | 用 Ark `combobox` + `dialog` 自组(约 50 行),比引整库更符合判据 3 |

---

## 5. 采用后的纪律(避免重演一次「装了再压掉再删掉」的往返)

1. **token 单向**:库变量 → `--app-*`,禁止反向,禁止新增第二个前缀。
2. **库只出现在适配层**:对应 `docs/architecture/02` §6 的 `ui/` 适配层思路;`features/*` 的面板不得直接 import 库组件来做视觉。
3. **只接收无样式 + `data-*`/CSS 变量覆写**:任何自带圆角、阴影、边框、浅色浮层的组件,必须在适配层先压掉再进面板。
4. **每引一个库,在 `05-acceptance-checklist.md` 加一条 a11y 断言**(焦点环、可访问名称、键盘可达)。
5. **离线**:禁止运行时 CDN 依赖(图标集、字体)。字体已本地化在 `src/assets/fonts/`,新增图标集必须走离线包(见 §6 的处理记录)。

---

## 6. 现状核对:与文档不一致的地方

选型必须基于「代码实际是什么样」。这里记录核验发现的偏差与**处理结果**。

| 位置 | 文档 / 文件里写的 | 实际 | 处理 |
| --- | --- | --- | --- |
| `docs/ui-stack-decision.md` §3 | 「定案:**Mantine 9.7**」,最终组合表含 Mantine | `package.json` 里没有任何 `@mantine/*`;`src/` 中 0 处 import;`node_modules/@mantine` 是空目录残留;`src/styles.css` 留着 `── Mantine overrides ──` 注释 → 代码已回到「无组件库、自绘 + Radix Tooltip」 | ✅ **已改**:标题去掉 Mantine,§3 改为指向本文并保留仍然有效的玻璃实测数据;另在 §2 表格下补了「`windowEffects` 已移除」的更正 |
| `smoke/ssr-entry.tsx` | `import { MantineProvider } from '@mantine/core'` 与 `../src/ui/theme` | `src/ui/theme.ts` 不存在、`@mantine/core` 未安装 → 该文件**编译不过**;因不在 `tsconfig.app.json` 的 `include`(`src`)里,`npm run typecheck` 一直是绿的。`.smoke/ssr-entry.js` 是旧的 Mantine 版产物 | ✅ **已删**:两个文件删除,空目录 `.smoke/` 一并移除;`smoke/*.png` **保留**(文档以它们作为实测证据) |
| `README.md`「Component direction」 | 「本地 Veda 原语自持,不把产品行为藏进通用组件库」 | 与 `ui-stack-decision.md` §3 的 Mantine 定案互相矛盾 | ✅ **已解决**:§3 收敛后两处一致 |
| `src/styles.css` 顶部 | `@import url('https://fonts.googleapis.com/css2?family=Manrope...')` | 桌面应用离线启动时该请求失败并静默回退系统字体,与判据 6 冲突 | ✅ **已本地化**:6 个 woff2(Manrope 可变字体 = 1 份 latin + 1 份 latin-ext;DM Mono 400/500 各 latin + latin-ext)放入 `src/assets/fonts/`,`@font-face` 写在 `src/assets/fonts/fonts.css`,`styles.css` 改为相对导入 |

**核验的基线状态**(改动前):`npm run typecheck` 通过、`npm test` 15/15 通过。

---

## 7. 核验方法与原始数据(可复现)

```bash
npm view <pkg> version peerDependencies              # 版本与 React 兼容区间
npm pack <pkg> && tar -tzf <pkg>.tgz                 # 取组件清单、统计 .css 文件数
tar -xzf <pkg>.tgz package/package.json -O           # 取 exports / sideEffects / dependencies
curl -s https://api.npmjs.org/downloads/point/last-month/<pkg>   # 月下载
```

**实测值(2026-10-06,本机)**

| 库 | 版本 | peer react | 月下载 | 备注 |
| --- | --- | --- | --- | --- |
| `@ark-ui/react` | 5.39.3 | `>=18` | 4,141,916 | 0 个 CSS、`sideEffects:false`、69 deps |
| `lucide-react` | 1.52.0(本仓 0.468.0) | `^16.5 \|\| ^17 \|\| ^18 \|\| ^19` | 446,126,204 | 已在用 |
| `@radix-ui/react-tooltip` | 1.3.0 | `^16.8…\|\| ^19` | — | 已在用 |
| `@mantine/core` | 9.7.1 | `^19.2.0` | 10,428,550 | 备选 |
| `antd` | 6.6.5 | `>=18` | 15,539,584 | 不选 |
| `@chakra-ui/react` | 3.37.0 | `>=18` + `@emotion/react>=11` | 6,861,175 | 不选(Ark 是其底座) |
| `@headlessui/react` | 2.2.10 | `^18 \|\| ^19` | 29,871,461 | 降级替代 |
| `@heroui/react` | 3.2.6 | `>=19` + `tailwindcss>=4` | 2,598,711 | 不选 |
| `primereact` | 11.2.0 | `>=19` | 1,356,384 | 不选 |
| `@gravity-ui/uikit` | 7.50.1 | `含 19` | 92,499 | 不选(平级备选) |
| `@iconify/react` | 6.0.2 | `>=16` | 4,240,471 | 条件采纳 |

---

## 8. 附:bezel / GPUI 换栈评估(只谈适配性)

> 触发问题:「如果为了强行使用 bezel 而更换架构,可不可行?不考虑成本,只考虑项目适配性。」
> 一句话结论:**技术上可行,而且它是清单里唯一「越看越像本项目要做的产品」的一支;但换栈的理由不该是 bezel。**

### 8.1 先纠正前提:bezel 不是「组件库」

实测(crates.io index + 仓库源码)它由这些 crate 组成,几乎逐条对上本项目的路线图:

| bezel crate | 自述 | 对应本项目 |
| --- | --- | --- |
| `editor` | Notion 式块编辑器 —— markdown 文档模型上的编辑面 | 笔记面板(`NoteSnapshot.content: string`) |
| `markdown` | Notion 式块文档模型:markdown in / markdown out | 笔记正文字串 ↔ 块模型双向转换 |
| `canvas` / `canvas-core` | 基于 **JSON Canvas** 的无限画布:节点与连线进,可平移的思维导图出 | 白板面板(03 §4 的原生对象 + 引用对象) |
| `syntax` / `syntax-std` | tree-sitter 语法分类(自带语法集) | Agent 输出里的代码块高亮 |
| `ui` | SwiftUI 风格组件:popover / menu / tabs / table / tree / **docking** / palette / combobox / tooltip / scroll … | 壳层交互 + 停靠式分栏 |
| `icons` | **Lucide 图标集移植成带类型的 gpui SVG 常量** | 本仓现在用的就是 `lucide-react` —— 图标语言可以原样延续 |
| `theme` | gpui 的设计令牌:环境驱动主题 + 明暗调色板 | `src/ui/tokens.css` 的同位物 |
| `motion` | 具名动画目录:CSS cubic-bezier 曲线 + 纯相位运算 | 现在只有 0.14s ease,够用但没体系 |
| `terminal` | alacritty 内核 + 网格视图 | 01 文档中 TUI 客户端的候选实现 |
| `browser` | 「平台 webview 托在 gpui 窗口里」 | HTML / PDF 预览的逃生口 |
| `agent` | 只是「思考光球 + 确定性 blob 头像」这类状态装饰 | 真正要自己写的部分(会话、工具调用、确认流程) |

同栈还有一个**同形态产品**:`crabtalk/cydonia` —— 「给 coding agents 用的桌面工作区:打开目录当项目、把 ACP agent 放进去干活、产出落盘成 articles / boards / tables」,面板就是 sessions / boards / tables / articles。
也就是说:**这个产品形态在这条栈上已经有人做出来了**,不是空白地带。

### 8.2 适配性上的真实优势(比只看清单条目时的判断强)

1. **材质与合成层这条最大的痛点会从「绕过」变成「天生解决」**。本项目所有材质坑——`transparent: true` 让 DWM 材质没有可绘制的层、`backdrop-filter` 采样不到桌面(实测 56024 像素全同)、面板级磨砂只能近似——根源都是 WebView2 的透明合成表面。GPUI 是自绘窗口,有正常的 DWM 合成层;参考实现 Pebrel 已证明窗口级 Acrylic 在 GPUI 上可用,而面板级模糊(模糊应用自己画的内容 = Haze 的模型)在 GPU 自绘里是天然能力。
2. **宿主与 TUI 同语言**。01 文档要求 GUI 与 TUI 是同一会话服务的两个客户端、`contracts` 可序列化共享。Rust GUI + Rust TUI 可直接共享 `contracts` / `workspace` 代码(bezel 还自带 terminal)。
3. **图标语言可以延续**:`bezel-icons` 就是 Lucide,与本仓现有习惯一致。
4. **笔记的存储契约反而更顺**:03 要求笔记正文以 `content: string` 为唯一真源,而 bezel-markdown 正是「markdown in / markdown out」。代价在白板:JSON Canvas 是「节点 + 连线」模型,03 的 `note-reference` 对象要落成自定义节点,需要一层映射。

### 8.3 适配性上的真实代价(同样不能忽略)

1. **底座是一个每天都在动的 fork**。bezel 0.2.9 依赖 `gpui = { package = "bezel-gpui", version = "0.3" }`,实测 `bezel-gpui` 最新为 `0.3.17+zed.ba42ab` —— build metadata 直接指向它 fork 的 zed commit,且是**核验当天(2026-10-06)刚发布**;上游 zed 的 `gpui` 是 0.2.2。仓库自述「APIs are still evolving」,从 2026-08-16 的 0.0.1 到 10-05 的 0.2.9 共 40+ 个版本,几乎一天一发。与 Tauri 2 + React 19 的节奏相比,这是**适配性上最大的风险项**:不是能力不够,而是把窗口外壳绑在一个高速移动的 fork 上。
2. **主题哲学与本项目规范冲突**。`tokens.css` 的规范是「全部中性灰 R = G = B、alpha 是唯一旋钮、逐像素实测」;bezel 的 Brand 是色相 / 彩度 / 圆角三旋钮,并**明确把明度排除在可调项之外**(以保住已校验的对比度)。要落地本项目那套「中性灰 + 可调 scrim」,得走它的 `set_palette` 逃生口自己重写调色板 —— 等于把 `tokens.css` 与那套 acrylic 算术换个语言重做一遍。
3. **无障碍要自己扛**。fork 的依赖里有 `accesskit`(Windows UIA 通道存在),但 05 验收清单要求逐组件的落实(焦点环、可访问名称、键盘可达、分割器键盘操作);Web 侧这些由标记语义免费给出。
4. **Tauri 提供的不只是窗口**:还有 updater、单实例、深链、托盘、dialog/fs/store 插件、capabilities 权限模型。GPUI 只有窗口与渲染。
5. **`browser` crate 是未验证的变量**。它说明 GPUI 窗口里可以托 webview,但 WebView2 嵌进 GPU 自绘窗口后的材质 / 透明度叠加行为**没有证据**,不能假设它比现在更容易。

### 8.4 结论:**已实测否决**(2026-10-07)

为了拿到证据,做过一个 GPUI + bezel 的对照版(同一外壳结构、同一套 token 值),**实测后已连同截图一并移除**;结果
如下 —— 固定窗口位置、同一矩形截图、统计窗内平均亮度:

| 用例 | scrim | 材质请求 | 窗内平均亮度 |
| --- | --- | --- | --- |
| tokens | .62 | Opaque | **80.2** |
| tokens-thin | .20 | Opaque | **136.0** |
| tokens-thin | .20 | `Brand.vibrancy = On` → Mica | **136.0** |
| tokens | .62 | opaque / transparent / blurred / mica 四档 | 39.3 / 39.3 / 39.0 / 37.8 |

读出两件事:

1. **scrim 厚度仍然是那个唯一有效的旋钮**(.62 → .20 让亮度 80.2 → 136.0),窗口确实透明;
2. **材质本身量不出来**:开了 vibrancy / Mica 与不开逐像素同值(136.0 对 136.0),四档材质
   请求之间差 ≤1.5。

这与 bezel 自己的源码注释一致(`bezel-theme/src/theme/glass.rs`):Windows 上 `Blurred` 只是
「普通透明」,它唯一能给的材质是 **Mica —— 采样壁纸、不透视后方窗口**。另外还有一个坑:
`WindowOptions.window_background` 会被 bezel 的 appearance 体系覆盖,真开关是
`Brand.vibrancy`(必须在 `appearance::init` 之前装)。

**方向否决。** 理由不是「GPUI 承载不了这个产品」,而是:

- 本项目**最核心的视觉表达**(窗口级真实磨砂:模糊窗口背后的内容)在 GPUI + bezel 上
  **拿不到**;而 React 侧已经实现的 `system-acrylic`(DWM `DWMSBT_TRANSIENTWINDOW` =
  WinAppSDK `DesktopAcrylicController`,`src-tauri/src/acrylic.rs`)恰恰是 bezel 没有暴露的那一档。
  换过去不是升级,是**少一档**。
- 要把它补回来,只能自己在 Rust 侧调 DWM / WinAppSDK(Pebrel 就是这么做的)—— 等于
  **重写一遍 React 侧已经做完的那件事**,换栈在这件事上不省任何功夫。
- 再叠上 §8.3 的五条代价(每日发版的 fork、主题哲学冲突、无障碍自己扛、失去 Tauri 运行时、
  `browser` crate 变量),否决没有悬念。

**什么时候重新评估**(四条同时成立才值得再开一局):

1. `bezel-gpui` 或上游 gpui 暴露了 DWM Acrylic(`DWMSBT_TRANSIENTWINDOW`)或等价的面板级模糊;
2. 它不再是「一天一发」的 fork;
3. 决定 TUI 与 GUI 必须同语言并共享 `contracts`;
4. 需要终端 / 块编辑器 / 无限画布级别的自绘控制。
   (内容层能否替代 Tiptap / Konva **仍未验证** —— 对照版没接 bezel 的 editor / canvas。)

**已移除**:对照版(`prototype-gpui/` 目录与 `smoke/shell-gpui-*.png` 截图)已按决定删除(2026-10-07)。
上面那张实测表、以及那 3 个坑(窗口底色被 bezel 覆盖 / 真开关是 `Brand.vibrancy` / Windows 只有 Mica)就是它留下的全部内容;要复现的话按 §8.1 的依赖写法重来一次即可。
