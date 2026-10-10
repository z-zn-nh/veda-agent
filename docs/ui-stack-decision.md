# UI 技术栈定案:Tauri + React + 自绘原语 + CSS 玻璃层

> 方案 A(Compose Multiplatform + Haze)已废弃并删除。本文记录定案依据与实测数据。
> 补充(2026-10-06):§2 表格里"窗口级模糊由 Tauri `windowEffects` 提供"这一行**已过期**。
> `tauri.conf.json` 中的 `windowEffects` 已移除,材质完全由 Rust 侧负责
> (DWM 通道 + WinAppSDK 合成通道),详见文末附录。

## 1. 为什么放弃 Haze

Haze 是 **Compose Multiplatform** 库(`dev.chrisbanes.haze:haze`,Kotlin/Gradle),
无法在任何 React/Tauri 的 HTML 界面中使用。选用 Haze 就等于必须把 UI 层整体改成 Kotlin。

## 2. Haze 的职责由两层原生能力接管

Haze 做的是"让一个面板模糊它背后的内容"。在 Tauri/WebView2 里这件事拆成两层:

| 层 | 能力 | 实现方式 | 状态 |
| --- | --- | --- | --- |
| 窗口级 | 模糊窗口背后的桌面/壁纸 | Tauri `windowEffects`(底层 window-vibrancy 0.8.1) | ✅ 已由实机确认 |
| 面板级 | 模糊应用内部绘制的内容 | CSS `backdrop-filter` | ✅ 实测锐度比 0.003 |

### 实测 1:窗口级模糊

```json
"windowEffects": { "effects": ["micaDark", "acrylic"], "state": "active", "radius": 18 }
```

- Windows 11 走原生 `micaDark`(暗色);Windows 10 自动回退 `acrylic`(官方说明:冲突时取第一个)。
- 实测窗口亮度 66.1 / 背景亮度 90.7 —— 窗口暗于背景,符合暗色主题。
- **注意**:官方 schema 明确 `windowEffects.color` 在 Windows 11 上无效,只对 Win10 v1903+ 生效。

### 实测 2:面板级模糊(backdrop-filter 是否可用)

在页面内注入黑白条纹背景 + 带 `backdrop-filter: blur(12px)` 的覆盖层:

```text
覆盖层区域   锐度 0.08   峰谷差  17    ← 条纹被抹平
原始条纹区   锐度 28.81  峰谷差 255    ← 黑白分明
锐度比 = 0.003
```

结论:**`backdrop-filter` 在 Tauri 的 WebView2 中完全可用**,效果等同于 Haze 的面板磨砂。

### 实测 3(关键边界):backdrop-filter 能否采到桌面?

在窗口面板上施加 `backdrop-filter: blur(50px) saturate(140%)`,与未施加时做全窗口逐像素对比:

```text
采样像素 56024 个
平均差 0.0000   最大差 0   不同像素数 0
```

结论:**完全无效。** `backdrop-filter` 只能模糊"页面内绘制的内容",
**无法访问操作系统合成层(即窗口背后的桌面)**。

这条决定了 UI 结构:

```text
桌面模糊     → 必须由 Tauri 原生材质提供（窗口保持 transparent）
面板玻璃感   → 面板本身只用半透明 tint，不需要 backdrop-filter
应用内磨砂   → 仅当应用自己绘制了内容（白板画布、PDF、图片）且需要浮层压在上面时才用 backdrop-filter
```

这与 Haze 的模型一致:Haze 也是 `hazeSource` 标记应用内某层,再由面板去磨砂它。

## 3. 组件库选择

> **本节于 2026-10-06 重写。** 原文把 Mantine 9.7 写成"定案",但代码随后回到了
> 「无组件库、自绘 + Radix Tooltip」的形态(`package.json` 中已无任何 `@mantine/*`,
> `src/` 里 0 处 import),该定案与实现不符,不再作为依据。
> 重新选型的核验数据与理由在 **`docs/component-library-selection.md`**,这里只留结论。

| 位置 | 结论 |
| --- | --- |
| 交互原语 | `@ark-ui/react`(实测 0 个 CSS 文件、`sideEffects:false`、支持按需子路径);新增交互统一走它 |
| 现有原语 | `@radix-ui/react-tooltip` 保留不重写(29 行,已满足需求) |
| 图标 | `lucide-react`,全仓唯一图标系统 |
| 整套组件库 | 暂不引入。`@mantine/core` 9.7 降级为**触发式备选**(大数据表格 / 完整表单 / 复杂日期选择) |
| 壳层 | 继续自持:`layout/` 的布局树(纯函数 + 15 个单测)、`LayoutView` / `Divider` / `ui/Tooltip` |

### 第三方"玻璃组件库"仍不引入

原因不变:所需能力已由原生材质 + CSS 覆盖,而 npm 上多数 glass 库做的是
"液玻璃折射"(折射 / 色散 / 边缘弯曲),与 Haze 的磨砂不是同一件事:

| 包 | 月下载 | 定位 |
| --- | --- | --- |
| liquid-glass-react | 164,009 | 折射/色散/边缘弯曲,零依赖,基于 SVG 位移滤镜 |
| liquid-glass-web-react | 20,361 | 同类 |
| @samasante/liquid-glass | 43,104 | 同类 |
| @mawtech/glass-ui、quidlass 等 | < 2,000 | 生态过小,不建议生产使用 |

`liquid-glass-react` 仍可用于**少量强调元素**,但它不是面板磨砂的替代品,也不适合大面积铺开。

**当前组合(与代码一致):**

```text
组件与交互   Ark UI 无样式原语(新增) + 现有 Radix Tooltip + 自绘壳层
图标         Lucide
窗口级玻璃   Rust 侧四档材质 none / acrylic(DWM) / system-acrylic
             (WinAppSDK DesktopAcrylicController)/ aero,
             实现在 src-tauri/src/backdrop.rs 与 acrylic.rs,由 set_backdrop 运行时切换
面板磨砂     CSS backdrop-filter(自主写,已实测)
可选折射     liquid-glass-react(仅强调元素,未引入)
```

## 4. 当前实现状态

- 窗口:`transparent: true`、`decorations: false`。材质由 Rust 侧 `src-tauri/src/backdrop.rs`
  通过 DWM 设置 Acrylic(`DWMSBT_TRANSIENTWINDOW`),`tauri.conf.json` 里已移除 `windowEffects`。
- 壳层:`src/App.tsx` 负责工具栏、`LayoutView` 和设置浮层;三个面板是 content-only 组件。
- 所有表面色集中在 `src/ui/tokens.css`,全部为中性灰(R = G = B),见 §6。
- `npm run typecheck`、`npm test`、`npm run build` 全部通过。

## 5. 可调参数

| 目标 | 位置 |
| --- | --- |
| 窗口材质 | 环境变量 `VEDA_BACKDROP`(默认 `acrylic`) |
| 全局暗度(最有效的旋钮) | `src/ui/tokens.css` 的 `--app-scrim`,由 `.app-shell` 使用 |
| 工具栏 / 面板 tint | `src/ui/tokens.css` 的 `--app-toolbar` / `--app-surface*` |
| 布局 | 工具栏入口 + 面板上的横/纵分割按钮;拖拽分隔器改比例 |

**透明度是叠加的**:透出比例 ≈ (1 − scrim) × (1 − 表面 tint)。
多叠一层就少一层透光,这是之前"看不到材质"的直接原因。

## 6. 布局框架(阶段 2 完成)

布局**不是**"Agent 左栏 + 工具右栏",而是一棵可任意分割的树。

### 数据模型(`src/layout/types.ts`)

```text
LayoutNode = split { direction: row|column, ratio, children: [LayoutNode, LayoutNode] }
           | tabs  { paneIds[], activePaneId }        // 叶子:一个标签组
LayoutState = { root, panes: Record<paneId, PaneRecord>, focusedPaneId }
```

- `focusedPaneId` 是全局焦点锚点:工具栏高亮与新建面板的落点都跟随它,
  而不是永远落在树里第一个分组。
- `ratio` 被裁剪到 `[0.15, 0.85]`(`MIN_RATIO` / `MAX_RATIO`)。

### 纯函数(`src/layout/tree.ts`)

`initialState` / `addPane` / `removePane` / `splitPane` / `setRatio` / `focusPane` /
`setPaneStatus` / `prune` / `collectPaneIds` / `groupIds` 全部返回新状态,React 层只调用它们。
于是"关掉一个面板要折叠父级 split"这类逻辑可以脱离 UI 验证:
`src/layout/tree.test.ts` 有 15 个用例(`npm test`)。

> **必须记住的坑**:`mapNode` 若先应用变换再下钻,`splitPane` 生成的子树会被重新展开,
> 而该子树的第一个孩子正是刚被替换掉的叶子 → 无限递归 →
> `RangeError: Maximum call stack size exceeded`,React 卸载整棵树,窗口一片空白(但顶栏仍在)。
> 现在的实现是"叶子只变换一次、不再下钻";测试里
> "把目标分组换成两孩子 split,且不无限递归" 就是这条回归的守卫。

### 渲染(`LayoutView.tsx` + `Divider.tsx`)

- `split` 递归渲染成两个 `.split-part`,比例走 `flex-basis`。
- `tabs` 是唯一绘制 chrome 的节点:标签、关闭、横向/纵向分割。
- 分隔器**不绘制任何像素**,只是命中区 + 键盘可聚焦(`role="separator"`,方向键每次 2%);
  拖拽期间 `setPointerCapture`,指针离开细条仍继续生效。

### 面板与宿主解耦

面板只实现 `PaneViewProps = { pane, onStatus }`(`src/layout/registry.tsx`),自己不带标题栏。
新增一个工具 = 在 `PANE_REGISTRY` 加一条记录,渲染器与布局树都不用改。

### 已实测通过的行为

| 行为 | 结果 |
| --- | --- |
| 工具栏三个入口(Agent / Notes / Board) | 各自独立,不合并 |
| 再点已存在的同类工具 | 聚焦该面板,不重复新建 |
| 同一分组内多标签 | 支持;关闭后焦点让给相邻标签 |
| 横向 / 纵向分割 | 支持,可嵌套(三栏已验证) |
| 拖拽改比例 | 可用(拖 +160px → 68.9%),越界裁剪到 85% |
| 键盘改比例 | 可用(方向键每次 2%) |
| 关掉一侧 | 父级 split 自动折叠,不残留空分组 |
| 布局持久化 | `localStorage` 键 `veda-agent:layout:v1`;重建时丢弃树上已不存在的 pane |

上表的每一项都由 `scripts/verify-layout.mjs` 断言(16 项,全绿)。
跑法:先用 `scripts/launch-tauri-debug.ps1` 启动应用(它会开 CDP 9222),再执行
`node scripts/verify-layout.mjs`。三栏实拍见 `smoke/shell-3col.png`。

### 配色(为什么不再偏紫)

早期表面色是 `rgba(34, 28, 42, …)` 这类 B > R > G 的酒红偏蓝值,叠在 Acrylic 上整体读起来发紫。
现在 `tokens.css` 里所有表面都是 R = G = B 的中性灰。逐像素实测:

- **应用层表面**(工具栏、面板 tint):B − G ≈ **+0.9/255**,肉眼不可辨,紫色消失。
- 整窗亮度偶尔偏暖(实测可达 B − G = **−8.7**):那是 Acrylic 透出的桌面壁纸自己的颜色,
  不是应用配色的问题——它同时也说明材质确实在透。


---

# 附录:亚克力材质实测(Windows 11)

## 问题现象

用户反馈窗口"完全不透"。排查后确认**不是 CSS 问题**——`html/body/#root/.app-shell` 全部为
`transparent`,面板 tint 只有 0.30–0.34。问题出在窗口材质。

## 三种材质的实测对比

用"纯白背景 + 后置白底"的对照法测量(窗口内部亮度;27≈不透明,255≈全透):

| 材质 | 实现方式 | 窗内亮度(白底时) | 结论 |
| --- | --- | --- | --- |
| `none`(无材质) | — | 27.4 | **不透明**,完全无视背后白底 |
| `blur` | 旧 API `ACCENT_ENABLE_BLURBEHIND` | 26.7 | **不透明** |
| `micaDark`(Tauri) | DWM Mica | ~44(与桌面 47.8 相关 r=0.64) | 偏不透明:Mica 只采样壁纸,不透视后方窗口 |
| `acrylic`(Tauri) | 旧 API `ACCENT_ENABLE_ACRYLICBLURBEHIND` | 0.0(纯黑) | **Windows 11 上失效**,渲染成黑窗 |
| **`acrylic`(DWM 现代 API)** | `DwmSetWindowAttribute` + `DWMSBT_TRANSIENTWINDOW` | **124.4** | **透明,约 49% 透出** ✅ |

## 根因

1. **Tauri 的 `windowEffects.acrylic` 走的是 Windows 10 时代的未公开 API**
   (`SetWindowCompositionAttribute` + `ACCENT_ENABLE_ACRYLICBLURBEHIND`)。
   该 API 在 Windows 11 上失效,窗口渲染为纯黑。
2. **`micaDark` 虽然可用,但 Mica 是"不透明材质"**——它把桌面壁纸重度模糊后作为底色,
   并**不显示窗口后方的其他窗口**。所以看起来"完全不透"。
3. Windows 11 上真正透明的材质是 **Acrylic**,且必须通过现代 DWM API 设置:
   `DwmSetWindowAttribute(hwnd, DWMWA_SYSTEMBACKDROP_TYPE, DWMSBT_TRANSIENTWINDOW)`。

## 解决方案

已在 Rust 侧实现 `src-tauri/src/backdrop.rs`:

- 直接调用 `DwmSetWindowAttribute`,不新增 crate 依赖(用 `extern "system"` 声明)
- 同时支持旧 API 路径以便对比(`blur` / `acrylic-legacy`,后者动态解析未公开符号)
- 调用后立刻用 `DwmGetWindowAttribute` **回读校验**并打印结果:
  `backdrop=3 corners=2 dark=1`(3 = DWMSBT_TRANSIENTWINDOW,即 Acrylic)

`tauri.conf.json` 中的 `windowEffects` 已移除,材质完全由 Rust 侧负责,避免两套机制冲突。

## 可选材质

通过环境变量 `VEDA_BACKDROP` 启动即可切换(默认 `acrylic`):

```powershell
$env:VEDA_BACKDROP = "mica"    # 不透明的壁纸采样
$env:VEDA_BACKDROP = "blur"    # 旧 API,Win11 上不透明
$env:VEDA_BACKDROP = "none"    # 无材质
npm run app
```

也存在运行时命令 `set_backdrop(material)`,便于不重启切换。

## 提高透出比例

当前约 49%。若要更透,降低 `src/ui/tokens.css` 里 `--app-scrim` / `--app-surface*` 的 alpha。
材质本身带来的染色由系统控制,应用侧无法调。


## 调暗与模糊(第二轮)

### 现象

DWM Acrylic 本身在白色背景上测得亮度约 **174/255**(偏白),叠加面板 tint 后仍有 124,观感"太过透亮"。

### 关键限制:Acrylic 的染色与模糊都由系统控制

- `DWMWA_SYSTEMBACKDROP_TYPE` **不提供** tint 或模糊半径参数。
- Acrylic 的染色跟随系统强调色与深/浅色模式;模糊强度固定。
- 因此**应用的暗度只能在应用层解决**,模糊也无法调细。

### 解决方式:应用层遮罩 + 提高自身 tint

| 层 | token(`src/ui/tokens.css`) | 当前值 |
| --- | --- | --- |
| 全局遮罩 | `--app-scrim`(用在 `.app-shell`) | `rgba(10, 10, 11, .56)` |
| 工具栏 | `--app-toolbar`(用在 `.topbar`) | `rgba(22, 22, 24, .42)` |
| 面板 | `--app-surface`(用在 `.group`) | `rgba(24, 24, 26, .40)` |
| 浮层元素 | `--app-surface-strong` | `rgba(30, 30, 32, .62)` |
| 输入 / 空态 | `--app-surface-glass` | `rgba(255, 255, 255, .05)` |

全部为 R = G = B 的中性灰。此前那批 `rgba(34, 28, 42, …)` 的酒红偏蓝值已废弃——
它们叠在 Acrylic 上读起来发紫。

`html` / `body` / `#root` 保持完全透明,材质仍然透出。

### 实测(A/B:同一背景、同一时刻,仅切换遮罩)

以遮罩 `.46` 时测得,窗外像素完全相同(证明对比有效):

```text
区域        遮罩关    遮罩开    压暗
工具栏       79.0     60.5    -18.5
面板上/中/下  64~66    38~40   -26.0
```

### 继续调节

所有暗度都在 `src/ui/tokens.css`,改 alpha 即可:

```css
--app-scrim:   rgba(10, 10, 11, .56);   /* 全局暗度，最有效 */
--app-toolbar: rgba(22, 22, 24, .42);
--app-surface: rgba(24, 24, 26, .40);
```

`.app-shell` 的 alpha 是**最直接的旋钮**:它按比例压暗整窗,背景仍可见。

`.app-shell` 的 alpha 是**最直接的旋钮**:它按比例压暗整窗,背景仍可见。
面板 tint 只影响各自区域,杠杆较小。


---

# 附录:Pebrel 参考实现研究(以及为什么它不能直接移植)

研究目标是把 Pebrel 的亚克力面板风格搬到本项目。结论写在最前面:
**它的"代码"移植不过来,能移植的是它的设计决策。**

## Pebrel 是什么技术栈

`D:\Pebrel` 是**编译后的发行版**(108 MB `pebrel.exe`,GPL-3.0),没有源码。
README 说明它用 **Rust + GPUI**(Zed 编辑器的 GPU UI 框架)构建,面向 Windows/macOS/Linux。

也就是说:它是**原生 GPU 自绘**,与本项目的 Tauri + WebView2 是两种渲染模型。
没有 CSS 可抄,也没有可复用的组件代码。

## 来自它真实配置的一手数据

`%APPDATA%\Pebrel\pebrel_settings.txt` —— 用户实际在用的值:

```text
theme=BreezeDark       background=#19194c      opacity=0.20      blur=aero
pane_card_radius=0     pane_card_gutter=0      pane_card_shadow=0  pane_card_divider=1
```

这几个数本身就是一套完整的设计主张:**整窗只有 20% 的着色**(其余八成透出),
面板**无圆角、无间距、无阴影**,结构边界交给**一条 1px 发丝线**。

## 它的材质体系(从二进制的资源字符串里提取)

```text
CompiledPattern ... Mica | MicaAlt | Aero | Acrylic
"Mica 系列开销较低;Aero 和 Acrylic [会模糊] 窗口后方的内容,开销较高。"
DwmSetWindowAttribute(DWMWA_SYSTEMBACKDROP_TYPE, ...) 失败时 ; falling back to Acrylic
```

| 它的名字 | 实现路径 | 行为 |
| --- | --- | --- |
| `Mica` / `MicaAlt` | `DWMWA_SYSTEMBACKDROP_TYPE` | 开销低;**采样壁纸**而非窗口后的内容 |
| `Acrylic` | `DWMWA_SYSTEMBACKDROP_TYPE = DWMSBT_TRANSIENTWINDOW` | 真正模糊窗口后方 |
| `Aero` | `SetWindowCompositionAttribute` + `ACCENT_ENABLE_BLURBEHIND` | 真正模糊,且**允许应用自带 tint** |

它同时导入了 `SetWindowCompositionAttribute` 与 `DwmSetWindowAttribute`,两条路都在用。

### 一个关键差异:Aero 能自带底色,Acrylic 不能

系统的 Acrylic 材质**不接受应用指定的颜色**,只能跟随系统主题——所以
Pebrel 那种"80% 透出 + 20% 你自己的 `#19194c`"只能走 Aero(accent policy 的
`GradientColor`)。本项目已按这条路实现了 `aero` 材质(`src-tauri/src/backdrop.rs`),
含两个容易踩的点:

1. **`DwmExtendFrameIntoClientArea(-1)` 必须调用**。少了它,模糊只画在非客户区边框上,
   客户区照旧按应用背景绘制,表现就是"开了模糊但画面毫无变化"——很容易被误判成
   "Windows 11 上这个 API 失效了"。
2. **`GradientColor` 是 ABGR(0xAABBGGRR),不是 RGBA**。通道顺序反了会红蓝互换。
3. 现代材质会**盖住** accent policy。切换到 legacy 路径前必须先
   `DWMWA_SYSTEMBACKDROP_TYPE = DWMSBT_NONE`,否则看到的永远是 Acrylic。

## 硬约束:本项目拿不到窗口级模糊

实测(白底/条纹对照 + 逐像素统计)结论:

```text
Tauri transparent:true 下 —— none / acrylic / aero 三种材质的窗内像素
亮度 120.5 / 119.2 / 120.5,差异 < 1.5%,细节度 3.71 / 3.52 / 3.71
→ 材质对最终画面没有可测量影响
```

原因不是参数错,而是架构差异:`transparent: true` 让窗口改用 WebView2 的
透明合成表面,DWM 的背景材质**没有可绘制的层**;此时窗口透出的是**未模糊的真实桌面**。
改成 `transparent: false` 则窗口整体不再透明,同样得不到"玻璃"。

> 即:**在 Tauri + WebView2 上,无法既让页面半透明、又让系统模糊桌面。**
> Pebrel 能做到,是因为它自己就是 GPU 渲染器,窗口有正常的 DWM 合成层。
> `backdrop-filter` 也救不了——它只能模糊页面自己绘制的内容(此前已实测:56024 像素全同)。

## 实际迁移过来的部分

能落地的是它的**设计语言**,已写进 `src/ui/tokens.css` 与 `src/styles.css`:

| Pebrel 的决策 | 在本项目的落地 |
| --- | --- |
| gutter 与 hairline **二选一**,不许都画 | 面板无间距,边界交给 1px `--app-hairline`(alpha 仅 7%) |
| 命中区宽度 ≠ 视觉重量 | 分隔器 5px 可抓,只画 1px 线 |
| 浮层用**阴影**建立高度,不用辉光 | 设置浮层改为近不透明底 + 真实投影 |
| 选中态用**中性底色**,强调色一屏只花一次 | 标签/图标的 active 用 `--app-active` 中性白,不用 accent |
| 列表行默认**完全透明**,hover/选中才上色 | 标签、笔记条目、图标按钮均如此 |
| 半透明重叠会**alpha 翻倍**,颜色需按真实底色预合成 | 控件底色统一走 token,不在半透明层上再叠半透明 |

## 还没做、需要决策的一点

Pebrel 的面板边界由那条发丝线承载,而本项目早期的约束里写了"禁止分割线"。
两者只能二选一:

- **保留发丝线**:面板可辨,符合 Pebrel 的做法;
- **去掉发丝线**:面板之间没有任何边界表达,相邻面板会读作一整片
  (Pebrel 对此的解法是给回 gutter,而那又回到"间距")。

当前实现选的是**保留**,alpha 压到 7%,让它读作接缝而不是框。

---

# 附录二:拿到源码之后的修正(含两版表面)

## 它确实是开源的,而且源码能取到

`github.com` 在本机无法解析,但**这两条路径通**:

```text
https://raw.githubusercontent.com/Kuddev/pebrel/main/<path>     直连可用
https://api.github.com/repos/Kuddev/pebrel/git/trees/main?recursive=1   可列全部 2247 个文件
```

于是不再需要从二进制里猜。关键文件:

```text
nebula_app/src/platform/acrylic/bindings.rs       窄 ABI:DesktopAcrylicController
nebula_app/src/platform/acrylic/composition.rs    STA + Compositor + DesktopWindowTarget
architecture/notes/nebula_app/platform/2026-09-22-acrylic-controller.md   设计决策与实测证据
```

## 真正的亚克力路径(推翻本文上一版的结论)

它用的**不是** `DwmSetWindowAttribute(DWMWA_SYSTEMBACKDROP_TYPE)`,而是 WinAppSDK 的
**`Microsoft.UI.Composition.SystemBackdrops.DesktopAcrylicController`**,挂在窗口的
**下层** composition target 上:

```rust
RoInitialize(RO_INIT_SINGLETHREADED)              // STA
Compositor::new()                                  // Windows.UI.Composition
DwmSetWindowAttribute(hwnd, DWMWA_USE_HOSTBACKDROPBRUSH, TRUE)   // ← 关键开关
interop.CreateDesktopWindowTarget(hwnd, /* isTopmost */ false)   // 材质占下层 target
target.SetRoot(container_visual_with_RelativeSizeAdjustment(1,1))
Acrylic::new(); controller.attach(hwnd, &target); controller.configure()
```

它的 `configure()` 只设三个值,其余交给窗口自己的像素 alpha:

```rust
set_tint_color(Color { A: 255, R: 46, G: 52, B: 64 })   // #2E3440
set_tint(0.0); set_luminosity(0.0);
```

> 文档原话:**"Window pixel alpha continues to supply the user's opacity and theme color."**
> 也就是说它**同样**是 transparent 窗口——上一版"transparent 与材质互斥"的推断是错的。

设计文档里另外几条有价值的实测结论:

- **`SetTarget` 之后再设 configuration**,否则失焦会被恢复成"不透明灰";
- AccentPolicy 亚克力在屏幕边缘会留下可见图案,换成控制器后减轻;
- 挂载前要**先清掉** Accent / blur-behind / system backdrop;
- 它要求 Windows build 22621+ 与 **WindowsAppRuntime 1.8 ≥ 8000.946.1701.0**;
- 运行时缺失、API 不支持或挂载失败时,**回落到 Accent**,绝不自行安装/搜索 DLL。

### 为什么本项目暂时没走这条路

1. 本机 `Microsoft.WindowsAppRuntime.1.8` 是 **8000.806.2252.0**,低于它要求的最低版本
   (本机 1.8 之外还有 1.4/1.5/1.7,均不属于 1.8 族);
2. 需要重写约 600 行 COM/STA/DispatcherQueue/生命周期代码,且
   **WebView2 自身已占用窗口的合成层**,`CreateDesktopWindowTarget` 能否与它共存未经证实。

所以它是**待验证的下一步**,不是当前实现。

## `DWMWA_USE_HOSTBACKDROPBRUSH` 的实测:单独用无效

补上这个此前从未设置过的开关后重新测量:

```text
none           窗内 R 37.8  G 39.0  B 39.4
host-backdrop  窗内 R 37.8  G 39.0  B 39.4    与 none 的差 (0.0, 0.0, 0.0)
```

逐像素完全相同。原因就是上面那条:真正起作用的是**下层 composition target**,
而这个 DWM 开关只是为它服务的前提之一,单独拔出来不足以让材质出现。

## 表面方案:只保留中性灰

曾短暂做过一版靛蓝(`#19194c`,取自它配置里的 `background`),**已按明确要求移除**:
不做偏蓝的设计。现在只有一套表面,全部 R = G = B:

```css
--app-scrim:   rgba(10, 10, 11, 0.62);
--app-toolbar: rgba(22, 22, 24, 0.32);
--app-surface: rgba(24, 24, 26, 0.22);
```


> **2026-10-07 更新:这一版已被推翻。** 表面改为**冷灰蓝**(B > G > R),scrim 也从 0.62
> 降到 0.34。原因是一份参考图(用户提供,1468x1375)实测 B−R 在 +11 ~ +53 之间,越亮处
> 偏得越多;按"要这个观感"的明确要求照做。详细取值、净透出与回退方式见 §附录四。
> 下面这段保留为历史记录。
实测窗内 `R 31.0 / G 30.9 / B 30.9`(B − R = **−0.08**),中性。

## 材质配方的修正(此前三处写错 + 一处盲区)

拿到它源码后重写,这是**唯一能让材质真正出画**的组合:

| 项 | 正确值 | 此前 |
| --- | --- | --- |
| `AccentPolicy.flags` | **0** | 2(`DRAW_ALL_BORDERS`) |
| Acrylic `gradient_color` | **`0x0100_0000`**(ABGR,a=1) | a=0x60(38% 染色) |
| Aero `gradient_color` | **`0x982B_2B2B`**(约六成深灰) | 同上 |
| `DwmEnableBlurBehindWindow` | **必须调用** | 没调 |
| 切换后 `SetWindowPos(SWP_FRAMECHANGED)` | **必须刷新 frame** | 没做 |
| 清旧 `ACCENT_POLICY` | 必须在写系统材质**之前** | 顺序反了 |

`gradient_color` 的 alpha 被两条约束夹在很窄的区间:**不能是 0**(部分 DWM 版本会直接
跳过 Acrylic 什么都不画),**也不能给厚**(它是染色强度,给重了模糊就被自己的颜色盖住)。

### 盲区:scrim 会把材质整块埋掉

它文档里的一句原话解释了我们最长一段时间的困惑:

> **验收模糊必须先把不透明度调到 100% 以下**,否则任何实现都会被判成"没修复"。

本项目的 `.app-shell` 一直压着 0.56 的 scrim,而材质就画在它后面。实测同一壁纸:

```text
scrim 0.56 → 窗内亮度 38.7     材质被整块盖住,看起来和没有材质一样
scrim 0.20 → 194.9(Acrylic) / 205.3(Aero)   材质清晰可见
```

所以"材质开了却没变化"的第一嫌疑不该是 API,而是**自己的底色太厚**。

## 材质默认值:aero 试过,回退到 acrylic

`aero` 在 Windows 11 上把窗口渲染**过亮**(实测窗内 244.5,近白),scrim 压不住,
所以默认值回到 `acrylic`。`aero` 的实现保留在 `backdrop.rs` 里,可用
`VEDA_BACKDROP=aero` 或运行时命令 `set_backdrop("aero")` 切换,供后续判断。

## 仍未证实:模糊本身

能证实的只有"材质层存在"——它在均匀背景上确实改变了窗内亮度。**但"模糊"没有直接证据**:

条纹背板测试在修掉一个真实 bug(`New-Object System.Drawing.Bitmap -ArgumentList`
返回 null,导致背板一直是空的)之后能正常生成,却卡在**窗口层序**上:

- 条纹 `TopMost` + 窗口 `HWND_TOPMOST` → 窗口没浮上来(窗内梯度 21.34 ≈ 窗外 18.55)
- 条纹改 `HWND_BOTTOM` → 条纹直接不可见(窗外梯度掉到 1.39)

PowerShell + WinForms 控制不住层序,这条路测不了材质模糊。要坐实"模糊",得换验证手段
或直接上 `DesktopAcrylicController`(它要求 WinAppSDK 1.8 ≥ `8000.946.1701.0`,
本机是 `8000.806.2252.0`)。按当前决定**暂不推进**,保留现状。

截图:`smoke/shell-current.png`。

---

# 附录三:把材质测量做成脚本(2026-10-07)

## 为什么要做

材质这类改动最容易骗过肉眼:它是否生效,取决于背面是什么、以及应用自己的 scrim 有多厚。
此前所有材质对比都是手工截图,而**其中一步是错的**(见下),所以"看起来差不多"不能作为
判断依据。现在有了一支脚本:`scripts/measure-material.mjs`。

## 怎么用

```bash
powershell -File scripts/launch-tauri-debug.ps1   # 应用带 CDP(9222)起来
node scripts/measure-material.mjs
# 可选:VEDA_MEASURE_OUT=smoke 落截图;VEDA_MEASURE_DEBUG=1 打印每次读数
```

它做两件事,每一步都显式摆正窗口层序:

1. 通过 CDP 点开 设置 → Compare materials(应用会自建纹理背板 + 四个材质探针窗口),逐个测探针窗口;
2. 关掉探针,按**同一矩形**再测一次 —— 此时读到的是未经材质处理的背板基线。

口径:`lum` = 平均亮度;`contrast` = 相邻像素的水平亮度差均值(高频细节还剩多少)。
每次读数连采三次取中位数(屏幕合成结果会抖),并且脚本自带两条方法自检:
背板对比度足够高、`none` 不改变背板。

## 它发现的错:纹理背板一直被主窗口盖住

探针窗口是透明的,读数**透过它**看到背板 —— 所以背板必须真的在它下面。
但主窗口(133,73 起、1455x929)建得比背板还早,背板被压在下面。实测沿 y=250 采样:

```text
x=80    对比度 45.2   ← 背板露在主窗口左边缘之外的那 ~77px
x=380   对比度  7.5   ← 已经是主窗口自己的内容
x=680   对比度  0.0
```

也就是说,此前 `smoke/material-*.png` 量到的多半是主窗口的内容,不是背板。
修法(`src-tauri/src/lib.rs`):背板与探针都加 `.always_on_top(true)` —— 背板创建在前,
于是稳定地位于探针之下、主窗口之上。修完基线立刻一致(见下表)。

## 实测(修好之后,同一台机器、同一矩形)

| 材质 | 窗内亮度 | 高频细节被磨平 |
| --- | --- | --- |
| `none` | 96.7 | 14.3%(噪声底) |
| `acrylic`(DWM host-backdrop brush) | 88.3 | **43.2%** |
| `system-acrylic`(WinAppSDK `DesktopAcrylicController`) | 73.7 | **87.5%** |
| `aero`(`SetWindowCompositionAttribute` + 深灰染色) | 23.9 | **79.0%** |

四块基线 71.8 / 73.3 / 73.1 / 72.5 —— 同一张背板,横向可比。

结论与既有记录一致:**`system-acrylic` 是唯一"真的在模糊"的那一档**。`aero` 也模糊(79.0%),
但把整窗压到 23.9(近黑),只作为候选保留;DWM 的 `acrylic` 只磨掉四成,读起来更像染色;
`none` 的 14.3% 是方法噪声(探针自身 UI 造成的固定贡献),低于它的差异没有意义。

## 应用自己的遮罩:改成按 token 计算,不用截屏

原计划是"把主窗口摆到背板上方,按同一矩形测主窗口"。**这条路走不通**,而且原因值得记下来:

| 试过的做法 | 结果 |
| --- | --- |
| 运行期 `set_always_on_top` 摆层序 | 打断透明窗口的合成:探针瞬间变白底(窗内亮度 214–240)、主窗口变纯黑(亮度 10、对比度 0) |
| `hide()` 主窗口 | **静默空操作**:命令返回成功,但 `document.visibilityState` 仍是 `visible`,全屏差分只有 0.2%(两次连拍的噪声底是 0,所以这个差分可信) |
| `set_position` 把主窗口挪走 | 挪动**有效**(实测 141,75 → 199,127 → 1907,1201),但同一矩形读数**完全不变** |

最后一条把根因指向了文档里早就写过的那句话 —— `docs/ui-stack-plan-a-vs-plan-b.md`:
**"GDI 抓取亚克力窗口会返回不可靠数据。"** 所以"用屏幕截图量应用自身透出多少"在这条栈上
根本不成立,不是参数没调对。

改用可靠口径:**遮罩是纯 alpha 混合,透出比可以直接算**。若某层遮罩为 α,它透过的细节就是
(1 − α)(混合是逐像素线性运算,而 contrast 是像素值的线性泛函,所以对比度与亮度用同一个
传递系数);多层叠加则连乘。脚本从**运行中的应用**读 `getComputedStyle` 的实际值:

```text
token                    值                              α       透出
--app-scrim             rgba(10, 10, 11, 0.62)           0.62    38.0%
--app-toolbar           rgba(22, 22, 24, 0.32)           0.32    68.0%
--app-surface           rgba(24, 24, 26, 0.22)           0.22    78.0%
--app-surface-strong    rgba(30, 30, 32, 0.56)           0.56    44.0%
--app-surface-glass     rgba(255, 255, 255, 0.05)        0.05    95.0%

全窗透出(桌面细节透过 .app-scrim 之后):38.0%
```

于是调参有了明确的手感:**想让桌面多透一点,就降 `--app-scrim` 的 alpha** —— α=0.62 → 38%
透出;想要 50% 就把 α 降到 0.50。面板/工具栏叠在 scrim 之上,再按各自的 (1−α) 连乘。

## 层序:创建期定死

探针与背板的层序只由**创建顺序**决定(背板先建且置顶 → 探针后建且置顶 → 稳定压在背板之上,
二者都在主窗口之上),运行期不再改动任何窗口样式。这是唯一稳定的做法:上面那张表里前两条
已经说明,运行期摆层序要么被系统拒绝,要么打断合成。

## 现在的完整输出

```text
一、应用自身透出比(由 token 的 alpha 直接决定,不截屏)
二、材质:高频细节被磨平多少(像素实测)
    none 14.3%(噪声底) / acrylic 43.2% / system-acrylic 87.5% / aero 79.0%
4 passed, 0 failed
```

四条方法自检:背板细节足够、四块基线同源、`none` 不显著改变背板、透出比可解析。


---

# 附录四:表面改为冷灰蓝 + 透明拉到 54%(2026-10-07)

## 触发

用户给了一份参考 UI 图(1468x1375,PNG 24bpp 无 alpha),要求做"这么通透"的效果。先把它**量化**了:

| 指标 | 实测 |
| --- | --- |
| 整体亮度 | mean 58(偏暗);p10 28 / p50 51 / p90 108 |
| 局部梯度 | 绝大多数格子 0.2–6(极平滑),仅少数 8–13 |
| 色偏 | **稳定蓝偏**:B − R = +11 ~ +53,越亮处偏得越多 |
| 纵向趋势 | 上中 (68,84,118) → 下中 (34,44,54):上亮下暗、上蓝下灰 |

结论:那是一种 **低不透明度的暗色面板 + 背后一层被重度模糊的彩色底**。所以"通透"拆成两半:
一半是我们能控的(面板 alpha),另一半是**窗口背后的东西**给的。

## 改动

`src/ui/tokens.css` 换了整套表面色与 alpha(旧值以注释形式留在文件末尾):

```text
--app-scrim          rgba(10, 13, 24, 0.34)   α 0.34  透出 66%
--app-toolbar        rgba(22, 26, 40, 0.28)   0.28    72%
--app-surface        rgba(24, 28, 44, 0.18)   0.18    82%
--app-surface-strong rgba(30, 35, 54, 0.50)   0.50    50%
--app-hairline       rgba(200, 215, 255, 0.075)
--app-text           #eef1f8 / muted #c3cad9 / subtle #8f97a8
--app-accent         #8fa3c8
```

**净透出 = (1 − scrim) × (1 − surface)**:

| | 上一版 | 这一版 |
| --- | --- | --- |
| 面板区 | 29.6% | **54.1%** |
| 工具栏 | 25.8% | **47.5%** |

色偏取值不是抄的:参考图暗色区间对应 +14 ~ +24(亮处能到 +50,但我们的表面本身很暗,
按同一比例的绝对量取即可)。

## 两条纪律

1. **可读性不押在模糊上**。要读准的地方(输入框、设置浮层)继续用 `--app-surface-strong`(50%)
   或近不透明底,不要把文字放在 82% 透出的面上。文档 §2 早就写了这条,这次透明拉高之后更要守。
2. **判断效果必须在真桌面看**。GDI 截取亚克力窗口不可靠(见附录三),而且透出多少取决于
   背后是什么——同一组 alpha,背后是暗壁纸就是一团黑,背后是彩色壁纸才是参考图那种观感。
   所以:窗口拖到彩色壁纸上,再用眼睛判。

## 截图

- `smoke/live-app-cool54.png`(computer-use 抓的主窗口,2182x1393 = 1440x920 @150%)
- `smoke/live-screen-cool54.png`(整屏,1707x1067,能看窗口与桌面的关系)

## 回退

`tokens.css` 末尾注释里有上一版全部取值,原样贴回即可 —— **这是唯一一条回退路径**:仓库至今
没有任何提交(`master` 无 commit),所以既没有 `git checkout` 也没有历史可查。
材质那一档**已改**:默认从 DWM `acrylic` 换成 `system-acrylic`(见 `initial_material()` 与附录六末节)。

---

# 附录五:底色收厚到 46% 透出(2026-10-07 第二次调)

## 触发

附录四把面板净透出拉到 54.1% 之后,用户看着窗口给了一句:"**过于透亮了,文字稍微有些
看不清**"。这不是"模糊不够",而是**底色太薄**——附录三里那条纪律(材质画在 scrim 后面)
在这里反过来咬了一口:scrim 越薄,可读性越由壁纸决定。

## 先量化,再改

拿用户提供的整屏截图(2560x1600,窗口 1400x900 @150% = 物理 2100x1350 位于 x=120,y=90)
反推,并顺手做了一次**口径校准**:用附录四的 `scrim 0.34` 过一遍实测壁纸
`(160,190,202)`,算出 `(109,130,141)`;而截图里窗内实测是 `(110,130,142)`——
最大通道偏差 1。**说明"alpha 在 sRGB 空间线性合成"这个口径是准的**(也说明用户自己截的
整屏图可信,不可信的是附录三那种抓透明窗口的方式,见文末订正)。

于是当时的真实数字是:

| 目标 | 合成色 | 对比度 | 结论 |
| --- | --- | --- | --- |
| 正文 `--app-text` | (109,130,141) | **3.85:1** | 低于 4.5:1,勉强 |
| 次要 `--app-text-muted` | 同上 | **2.67:1** | 不行 |
| 标注 `--app-text-subtle` | 同上 | **1.5:1** | 等于没写 |

## 改动

两条腿一起动:底色收厚 + 提亮最低两级文字(**只加厚底色救不了次要/标注**,
因为它们的亮度本身就低)。

```text
--app-scrim          rgba(10, 13, 24, 0.34) → rgba(9, 12, 22, 0.54)
--app-toolbar        rgba(22, 26, 40, 0.28) → rgba(22, 26, 40, 0.30)
--app-surface        rgba(24, 28, 44, 0.18) → rgba(24, 28, 44, 0.26)
--app-surface-strong rgba(30, 35, 54, 0.50) → rgba(30, 35, 54, 0.60)
--app-text-muted     #c3cad9               → #d3d9e6
--app-text-subtle    #8f97a8               → #c6ccda
```

逐层透出(scrim 先铺满整窗,其余三层叠在它上面):

| | 附录四 | 这一版 |
| --- | --- | --- |
| 窗口底 | 66.0% | **46.0%** |
| 工具栏 | 47.5% | **32.2%** |
| 面板 | 54.1% | **34.0%** |
| 强面 | 33.0% | **18.4%** |

即:比"最早那版"(中性灰 scrim 0.62、面板 29.6%)**仍然更透**,但把读得准的那一档拿回来了。

## 复核方式(可复现)

口径与附录四一致(最亮壁纸 + alpha 线性合成),逐格算对比度,阈值取 正文/次要 4.5:1、
标注 4.0:1:

```text
窗口底(裸 scrim)  合成 (78,94,105)   正文 5.94 / 次要 4.74 / 标注 4.17
工具栏            合成 (62,74,85)    正文 8.07 / 次要 6.45 / 标注 5.67
面板              合成 (64,77,89)    正文 7.68 / 次要 6.13 / 标注 5.40
强面              合成 (49,59,74)    正文 10.05 / 次要 8.03 / 标注 7.06
```

## 订正:附录三"截图"那一节的证据不可靠

这次实测确认:**抓"透明 + 系统合成材质"的窗口,得到的东西和屏幕上看到的不是一回事。**

- 把 `.app-shell` 背景临时设成**不透明绿** `rgb(0,255,0)`(DOM 计算值确认已生效),
  同一窗口再抓一次,背景区**没变**,仍是 `(33,40,48)`。
- 同一位置切材质前后抓两次,行亮度剖面相等到 0.1。

所以附录四里那两张 `smoke/live-*.png` 只能用来看布局/位置,**不能用来判断通透度或模糊**。
判断这类效果有两条可靠路径:① 用户自己截的整屏图(本文就是用它做的校准);
② 解析式算 token 的透出与对比度(本文与附录四的表格)。

## 回退

`src/ui/tokens.css` 末尾现在留了**两档**回退值(档位 A = 附录四的过透版、
档位 B = 最早的中性灰版),原样贴回即可。材质那一档仍未写进默认值,
档位 B = 最早的中性灰版),原样贴回即可。

---

# 附录六:参数控制台 + 窗外那圈"黑雾"(2026-10-07)

## 触发

用户两条要求:①"模糊度可以再增加一点",②"图中它周身不知道为啥看起来有黑雾似的",
并且明确说:**"要不你加个按钮吧,让我来控制参数,然后你再写死"**。

第①③条改变了做法。之前几轮一直是"我改 → 用户截屏 → 我量"的闭环,一轮几分钟,
而且判据(通透度、可读性)本来就在用户眼睛 + 他自己那张壁纸上,不在我的算式里。
所以这一轮交付的是**可调面板**,由用户当场拖到满意,我再把最终值写死。

## 黑雾是什么:查了两条错路,第三条才对

结论先说:**它是窗口阴影**(DWM 给"有框"窗口画的那一圈),由**窗口样式位**决定。

### 错路一:`DWMWA_NCRENDERING_POLICY = DWMNCRP_DISABLED`

最直觉的做法(管"非客户区要不要 DWM 参与渲染"),实测**无效**:开关两态抓同一块
屏幕区域,剖面逐点相同。

### 错路二:`WebviewWindow::set_shadow(false)`

Tauri 确实暴露了这个 API(tao 的 `MARKER_UNDECORATED_SHADOW`),但它**也不动样式**。
实测:`GWL_STYLE` 在开/关两态都是 `0x14CF0000`,一个位都没变。读 tao 0.37.1 源码确认,
那个标记只影响三件事:

```text
window.rs:1354   创建时的尺寸估算(w += insets,仅 undecorated_with_shadows 时)
event_loop.rs:2114   WM_NCCALCSIZE 的 insets
event_loop.rs:2148   WM_NCHITTEST 的顶边拖拽区
```

而 `to_window_styles()` 里 `WS_CAPTION | WS_SYSMENU` 是**无条件**加的 —— tao 对无边框
窗口的做法是"保留边框样式 + 用 WM_NCCALCSIZE 把边框藏起来"。框看不见了,DWM 却仍按
"这是有框窗口"给它画阴影。这就是"关不掉"的根因。

### 对路:去掉能触发阴影的样式位

现在的实现(`backdrop::set_shadow`)直接改 `GWL_STYLE`,去掉
`WS_CAPTION | WS_DLGFRAME | WS_BORDER | WS_THICKFRAME | WS_SYSMENU`,
再 `SWP_FRAMECHANGED` 让 DWM 重算框。实测回读:

```text
关: 0x14CF0000 -> 0x14030000   (TAO_SHADOW_BITS = False)
开: 0x14030000 -> 0x14CF0000
```

**副作用**:去掉 `WS_THICKFRAME` 会连带丢掉系统给的缩放边框。本项目不受影响 ——
窗口是 `decorations: false`,拖拽与缩放本来就由 Tauri 自己按 `WindowFlags` 处理
(窗口上确实挂着 `TAURI_DRAG_RESIZE_WINDOW` 元素),不依赖系统边框。

**回退路径**:`VEDA_FRAME=on` 启动即恢复原样式(两个都开)。写环境变量而不是留一个
面板按钮,是因为面板本身是临时件、已随定稿删掉;环境变量不增加产品代码面。

## 黑雾有多大:两次实测

| 口径 | 结果 |
| --- | --- |
| 用户整屏截图(阴影还在,1400x900 @150%) | 左侧 x=80→128 亮度 89 → 54,**跨度 ~48px** |
| 本机实测(阴影已关):"窗口在屏上" vs "窗口移出屏外",全屏求差 | 差异包围盒只在窗口矩形外溢 **~13px**(x 105→118),振幅远小于上面那条 |

第二条的口径是干净的:窗口只是被移出屏幕,桌面内容没变,差值就是窗口自身画出来的东西
(含那一点圆角抗锯齿)。窗口矩形实测在物理 `x 118..2222, y 88..1440`,即逻辑 ×1.5。

**一个不能忽略的对照陷阱**:把阴影**打开**再对比,整条带子都会差 ~25 —— 因为重新加回
边框位会让 DWM 重新扣掉客户区 insets,内容整体位移。也就是说"开/关"两态不是同一张
画面的 A/B,别拿它当像素级证据。要判它,看上面那两张表。

## 交付:参数控制台(临时件)

`?specimen=1` 页面右侧,可收起。新增/改动文件:

```text
src/features/material/MaterialControls.tsx   面板本体
src/features/material/material-lab.css       面板 + 试片的样式(不污染产品 styles.css)
src/features/material/MaterialSpecimen.tsx   试片:假工具栏 + 面板 + 强面,四个 token 各有对照物
src/main.tsx                                 ?specimen=1 分支
src-tauri/src/backdrop.rs                    set_shadow / set_border
src-tauri/src/lib.rs                         set_window_frame 命令 + 启动默认值
```

面板能调四类东西:

1. **窗口材质** —— 6 档。除原有 4 档,这里额外放出 `blur`(旧 BLURBEHIND、不染色)与
   `acrylic-legacy`(旧 ACRYLICBLURBEHIND)。它俩以前没在设置面板里暴露过,是"最糊那一档
   之下"的两个中间候选。**已逐个切换验证过**:六档来回切,webview 全程存活,没有把窗口
   画成黑块(legacy BLURBEHIND 在部分 DWM 版本上有这个前科)。
2. **窗口阴影 / 1px 描边** —— 见上。
3. **四个表面 alpha** —— 直接改 CSS 变量,即时生效,不动色相。
4. **实时读数** —— 逐层透出比 + 对"亮壁纸(160,190,202)/ 暗壁纸(26,73,89)"两块参照底的
   对比度(正文 / 次要 / 标注三档),外加一段**可复制的当前取值**,用户拖完把那段贴回来,
   我照抄进 `tokens.css` 与 `initial_material()` 即可。

### 后续:面板已删,开关改为环境变量

定稿之后(用户"采用系统配置,就这个吧"),原来的可调面板连同试片一起删掉了
(`MaterialControls.tsx` / `MaterialSpecimen.tsx` / `material-lab.css` / `main.tsx` 的
`?specimen=1` 分支)。面板能调的四类里,留下两条**不改代码就能翻**的路径:

```text
VEDA_BACKDROP=acrylic|aero|none|system-acrylic   # 换材质,默认 system-acrylic
VEDA_FRAME=on                                     # 恢复窗口阴影 + 1px 描边,默认全关
```

表面 alpha 不再有运行期旋钮 —— 它是产品取值,不是调试参数,改它就是改 `tokens.css`
(文末留了两档回退值)。

## 模糊的上限:Windows 上没有"更糊"的旋钮

用户要"再糊一点"。现有可选项里 `system-acrylic`(WinAppSDK `DesktopAcrylicController`)
就是最糊的一档;它暴露的参数只有 tint / luminosity / fallbackColor,**没有模糊半径**。
DWM 那两条(`DWMSBT_TRANSIENTWINDOW`、`DwmEnableBlurBehindWindow`)半径同样由系统定死。

所以能动的其实只有两件事:

- 换档(面板已全给);
- 让被判为"糊"的东西多露出来一点 —— 也就是把 scrim 调**薄**。这与上一轮"读不清"是同一根
  跷跷板的两头,所以最终值只能由用户在两块参照底上拖出来。
