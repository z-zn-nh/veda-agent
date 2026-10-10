# 01 目标架构

## 1. 总体结构

```text
TUI 客户端 ─────┐
                ├── 共享本地应用接口 ── 工作区服务
GUI 宿主 ───────┘                         ├── 笔记服务
                                          ├── 白板服务
                                          ├── 资源与附件服务
                                          └── 保存、恢复、变更通知

共享本地应用接口 ── Agent 会话服务 ── Agent/pi 运行时适配器（占位）
```

这里表示职责，不要求一开始拆成网络微服务。

## 2. 职责边界

### GUI 宿主

负责：

- 顶部工具栏。
- 面板注册、打开、关闭和定位。
- 单栏、双栏、多栏布局。
- 焦点、快捷键、主题、通知和布局恢复。
- 面板的挂载、暂停与卸载生命周期。

不负责：

- Agent 的实际执行。
- 笔记正文保存规则。
- 白板对象的业务写入。
- 直接读写底层数据库表。

### TUI 客户端

负责：

- 连接共享会话服务。
- 展示和操作 Agent 会话。
- 处理终端输入、确认和取消。

不负责：

- 引入 React。
- 复制 GUI 的布局状态。
- 各自启动同一个会话的第二个执行器。

### 工作区与内容服务

负责：

- 工作区身份。
- 笔记、白板、引用、附件和版本。
- 保存队列、冲突检测、恢复和变更事件。
- 给 GUI 和 Agent 提供相同的应用操作。

### Agent 会话服务

负责：

- `sessionId` 和运行 ID。
- 输入排序、取消、状态快照和事件序号。
- TUI/GUI 客户端连接。
- 断开、重连和执行器异常。

### Agent/pi 适配器

当前只保留接口，不选具体实现。未来只允许这一层知道具体 pi SDK、子进程参数或通信协议。

## 3. 推荐依赖方向

```text
GUI ------------------------┐
TUI ------------------------┼── contracts / application services
Agent tools -----------------┘              │
                                            ├── note domain
                                            ├── board domain
                                            ├── workspace storage ports
                                            └── session ports
platform adapters ─────────────────────────┘
```

约束：

- 笔记和白板业务不能导入 Agent 运行时。
- TUI 不能导入 React。
- Agent 工具只能调用应用服务，不能调用 React Hook。
- GUI 面板不能直接调用底层 SQL。
- 平台 API 集中在 `platform` 或等价目录。
- 具体产品名称、包名、CSS 前缀和持久化 key 使用占位符。

## 4. 共享会话

GUI 与 TUI 是客户端，同一 `sessionId` 只有一个执行所有者：

- 客户端可以获取快照。
- 客户端可以订阅带序号的事件。
- 客户端可以提交带请求 ID 的输入。
- 客户端可以按运行 ID 请求取消。
- 客户端断开不自动终止会话。
- 事件历史不足时，客户端必须重新获取快照。

不要以“共同读取一个会话文件”代替会话服务。文件不能处理重复执行、流式事件、并发输入、取消归属和工具确认。

## 5. 面板模型

```ts
type PaneTarget =
  | { kind: 'agent'; workspaceId: string; sessionId: string }
  | { kind: 'note'; workspaceId: string; noteId: string }
  | { kind: 'board'; workspaceId: string; boardId: string }
  | { kind: 'tool'; workspaceId: string; toolId: string };

interface PaneRecord {
  paneId: string;
  target: PaneTarget;
  isActive: boolean;
  status: 'ready' | 'dirty' | 'saving' | 'error';
}
```

布局树示意：

```ts
type LayoutNode =
  | { kind: 'split'; direction: 'row' | 'column'; ratio: number; children: LayoutNode[] }
  | { kind: 'tabs'; activePaneId: string; paneIds: string[] };
```

这只是设计示意，DS 可以选择成熟布局库，但不能退回固定左右栏方案。

## 6. 新项目文件建议

```text
new-project/
├── apps/
│   ├── desktop/        GUI 宿主、工具栏、面板和布局
│   └── tui/            TUI 客户端
├── runtime/
│   ├── sessions/       共享会话状态和事件
│   └── agent-adapter/  pi/Agent 占位适配器
├── features/
│   ├── notes/          笔记领域、服务和面板
│   └── boards/         白板领域、服务和面板
├── workspace/          工作区、资源、保存协调
├── platform/           本地通信、文件、数据库和系统能力
├── contracts/          可序列化协议和 DTO
├── ui/                 设计令牌、Haze 集成和通用组件
└── migrations/         旧能力与旧数据的转换
```

不要求每个目录立刻变成独立包。先保持单一构建入口和清晰依赖方向。
