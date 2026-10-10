# 02 GUI 布局与 Haze 亚克力 UI

## 1. Haze 的定位

Haze 是新 GUI 的亚克力风格 UI 基础能力，属于界面层依赖，不是工作区、笔记、白板或 Agent 的业务层。

当前仓库没有可核实的 Haze 包、版本或 API，因此 DS 必须先确认：

- Haze 的真实仓库、包名和版本。
- 支持的 React/桌面容器版本。
- 是否提供窗口材质、Backdrop、透明度、模糊、阴影或仅提供视觉组件。
- 是否需要原生窗口配置、权限或平台特定资源。
- 是否支持浅色、深色、高对比度和无透明度模式。
- 是否提供可访问性语义、焦点管理和减少动态效果选项。

在确认之前，不得凭 `haze` 这个名字导入未知模块，也不得伪造 Haze 组件 API。可以先用本地适配接口和静态占位样式开发布局。

## 2. 视觉原则

目标是轻盈的亚克力桌面工作区，而不是把所有内容都做成半透明玻璃：

- 背景层负责材质和氛围。
- 面板层负责分组、层级和可读性。
- 编辑区域和白板内容区域优先保证清晰与性能。
- 重要文本不能依赖背景模糊才能阅读。
- 透明、模糊、阴影应集中在宿主容器，不要散落到业务组件。
- 白板画布可以保持相对不透明，避免影响对象边界和拖拽判断。
- 笔记正文区域默认使用高对比、稳定背景。

建议视觉层次：

```text
Window background / Haze material
  └── top toolbar material
      └── pane frame material
          ├── agent surface
          ├── note surface
          └── board surface
```

## 3. 设计令牌

不要在组件内散落颜色、透明度和阴影值。使用中性占位前缀，例如 `--app-*`，正式产品命名确认后再统一替换。

至少定义：

```css
:root {
  --app-bg: ...;
  --app-surface: ...;
  --app-surface-strong: ...;
  --app-surface-glass: ...;
  --app-surface-glass-border: ...;
  --app-text: ...;
  --app-text-muted: ...;
  --app-border: ...;
  --app-accent: ...;
  --app-shadow-panel: ...;
  --app-blur-panel: ...;
  --app-radius-panel: ...;
  --app-toolbar-height: ...;
  --app-pane-min-width: ...;
}
```

具体值由视觉原型和 Haze 实际能力决定。不要把旧项目的品牌色、产品名或 CSS 前缀复制到新项目。

## 4. 工具栏

顶部工具栏是宿主公共区域，至少包含：

```text
[工作区] [Agent] [笔记] [白板] [固定工具...]        [新建] [布局] [设置]
```

规则：

- Agent、笔记、白板是独立入口，不合并成一个“知识”按钮。
- 点击入口应打开、定位或创建面板，不应强制切换整个应用模式。
- 顶部显示运行中、未保存、保存失败等状态，但不把所有细节堆在按钮上。
- 固定工具数量较多时进入工具菜单，避免顶部无限增长。
- 工具栏自身不读取笔记正文或白板数据；只调用面板管理器。
- 工具栏和面板内容之间使用清晰焦点边界。

## 5. 任意分栏

推荐分割树或成熟布局组件。布局状态至少支持：

- 分割方向：行、列。
- 分割比例。
- 任意嵌套分割。
- 标签组。
- 当前活动面板。
- 面板拖拽移动、关闭和恢复。
- 最小宽度和窄屏降级。
- 布局持久化。

不要为每种组合写一个组件：

```text
禁止：AgentAndNoteLayout、NoteAndBoardLayout、ThreeColumnLayout...
推荐：LayoutTree + PaneRegistry + PanelRenderer
```

## 6. Haze 适配层

建议在 `ui/haze` 或等价目录建立本地适配层：

```ts
interface MaterialAdapter {
  kind: 'acrylic' | 'solid' | 'transparent';
  className: string;
  style?: Record<string, string | number>;
}

interface HazeAdapter {
  toolbar(): MaterialAdapter;
  paneFrame(active: boolean): MaterialAdapter;
  popover(): MaterialAdapter;
  supportsReducedTransparency(): boolean;
}
```

这是内部示意，不是 Haze 的真实 API。真实 Haze API 只能在适配层中出现，业务面板只使用本地抽象。

如果 Haze 不支持某个平台或某种浏览器环境，适配层必须提供不透明降级，而不是让整个应用无法启动。

## 7. 性能与可访问性

- 模糊和透明效果不能覆盖大面积高频刷新的画布对象。
- 面板隐藏时暂停重型渲染、预览和不必要的订阅。
- 支持减少透明度和减少动画。
- 半透明面板仍需满足文本、图标、焦点环和禁用态对比度。
- 键盘焦点不能只通过颜色变化表示。
- 工具栏、分割器、标签和关闭按钮必须提供可访问名称。
- 分割器应支持键盘调整比例，至少提供合理的可操作退化。
- UI 错误状态不能只靠红色或透明度表达。
