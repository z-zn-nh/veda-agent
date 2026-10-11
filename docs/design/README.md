# 设计参考（定稿，2026-10-11）

本目录是 GUI 实现的**视觉验收基准**。规则以 `docs/architecture/08-final-ui-spec.md` 为准；图与文字冲突时以 08 为准，并提出来，不要自行取舍。

- 来源：Figma Make 发布页 care-pony-43706533.figma.site（截图于 2026-10-11，1440×900，DPR 1）。
- 发布页是 JS 渲染的，普通抓取只能拿到空壳；**以本目录截图为准**，不要依赖在线页面（可能改动或失效）。
- 图中文字（会话名、项目名、路径、笔记内容）都是示意，不是需求。
- 壁纸、毛玻璃、字体抗锯齿的细微差异可以接受；**位置、间距、层级、尺寸、状态**必须对上。

## 帧索引

| 文件 | 内容 | 尺寸 |
| --- | --- | --- |
| `01-home.png` | Home (before): composer on the glass, project chip, first message typed | 1440×900 |
| `02-agent-card-after-send.png` | After send: the composer became an Agent card | 1440×900 |
| `02b-agent-multi-project-plus-menu.png` | One Agent card, sessions from several projects · + menu | 1440×900 |
| `03-note-only-frameless-folder-menu.png` | Note only · list in card, folder menu, subfolders | 1440×900 |
| `04-board-only-frameless.png` | Board only · list collapsed | 1440×900 |
| `05-note-agent-note-focused.png` | Note + Agent · Note focused | 1440×900 |
| `06-board-agent-browser-panel.png` | Board + Agent · browser panel | 1440×900 |
| `07-agent-split-two-sessions-notifications.png` | One Agent card split right: two sessions, own tabs + composer · notifications | 1440×900 |
| `08-note-card-split-plus-agent.png` | One Note card split right (list + A | B) + Agent | 1440×900 |
| `09-tab-overflow-grouped.png` | Tab overflow · list grouped by project | 1440×900 |
| `10-drag-tab-open-to-side.png` | Drag a tab: open to the side | 1440×900 |
| `11-narrow-1100.png` | Narrow window 1100px · list hidden, Agent at min width | 1100×900 |
| `12-ctrl-k.png` | Ctrl K over frame 5 | 1440×900 |
| `12b-hover-menu-agent.png` | Agent hover menu open | 1440×900 |
| `12c-hover-menu-note.png` | Note hover menu open | 1440×900 |
| `14-first-run-no-folder.png` | First run, no folder yet | 1440×900 |
| `15-sidebar-folder-menu.png` | Sidebar folder menu open · subfolder groups | 1440×900 |
| `17-agent-needs-review.png` | Agent needs review: inline diff + tool approval | 1440×900 |
| `18-note-save-states.png` | Note save states: Saving…, Save failed, conflict | 1440×900 |
| `19-reduce-transparency.png` | Reduce transparency: solid graphite cards | 1440×900 |
| `20-very-narrow-900.png` | Very narrow window 900px · Note collapsed to a strip | 900×900 |
| `21-tab-context-menu.png` | Tab context menu on an Agent tab | 1440×900 |
| `22-settings-appearance.png` | Settings tab > Appearance | 1440×900 |
| `22b-settings-agent.png` | Settings tab > Agent | 1440×900 |
| `22c-settings-shortcuts-search.png` | Settings tab > Keyboard shortcuts · search filled | 1440×900 |
| `23-drag-tab-merge-tabbar.png` | Drag a Note tab onto the other pane's tab bar | 1440×900 |
| `ref-frameless-no-jump.png` | 自绘对比：上排为**错误**做法（去边框后内容右移约 18px），下排为正确做法（预留布局空间，内容不动） | — |

## 已剔除（生成有误，不作参考）

- 13 · 一张 Board 卡片内两个白板分屏：左右画布内容完全相同（标签分别为 Roadmap / Pane model），是生成错误。白板分屏按帧 08 的笔记分屏模式实现。
- 16 · 首页 → Agent 两帧并排：把两个窗口压缩到各 720px，尺寸会误导；内容与帧 01、02 重复。
- 24 · 单 Note 无边框 vs 卡片对比（半比例）：半比例图不能用于量尺寸；改用帧 03/05 和 `ref-frameless-no-jump.png`。

## 图上看不出、必须按文字实现的规则

1. **单工具无边框**：只显示一个 Note 或 Board 时，没有卡片背景、描边、阴影、圆角，但**保留卡片外缝和内边距**；第二个工具出现时，只淡入背景、描边、阴影、噪点（约 150ms）。标签栏、侧栏、正文起点在两种状态下坐标一致（帧 03 与 05 的标签栏起点都在 x≈48）。Agent 单独显示时仍是卡片（帧 02）。开启「减少透明度」时一律实底。
2. **分屏内的标签栏**：同一卡片内左右分屏时，每个分屏区有自己的标签栏（以帧 07、23 为准）。帧 08 画成一条共享标签栏，按 07/23 修正。
3. **悬停菜单**：顶栏 Agent/Note/Board 悬停 300ms 后弹出，移出即收；点击只切换显示/隐藏。
4. **窄窗收起顺序**：卡片侧栏 → Agent 附属内容 → Note/Board 卡片变窄 → 非焦点卡片收成窄条。Agent 对话列不低于 520px。
5. **焦点**：没有蓝色外圈；焦点卡片发丝线更亮，活动标签更亮并加粗一级。
