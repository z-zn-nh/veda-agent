# 03 内容与 Agent 占位契约

## 1. 目标

在 pi 和 Agent 运行时未确定前，先定义可替换的业务接口。界面、笔记和白板不应等待真实 Agent SDK 才能开发。

所有示例都是设计契约，不是已存在 API。DS 需要实现内存适配器或文件适配器供 GUI 验证，接口命名也可以在确认运行时后调整。

## 2. 工作区接口

```ts
interface WorkspaceSummary {
  id: string;
  title: string;
  rootPath?: string;
  createdAt: number;
  updatedAt: number;
}

interface WorkspaceService {
  list(): Promise<WorkspaceSummary[]>;
  create(input: { title: string; rootPath?: string }): Promise<WorkspaceSummary>;
  open(workspaceId: string): Promise<WorkspaceSummary>;
  close(workspaceId: string): Promise<void>;
}
```

工作区不要求有代码目录。代码目录可以作为 Agent 工具上下文或外部项目关联项。

## 3. 笔记接口

```ts
interface NoteSnapshot {
  id: string;
  workspaceId: string;
  title: string;
  content: string;
  version: string;
  updatedAt: number;
}

interface NoteService {
  list(workspaceId: string): Promise<NoteSnapshot[]>;
  read(input: { workspaceId: string; noteId: string }): Promise<NoteSnapshot>;
  create(input: { workspaceId: string; title?: string; content?: string }): Promise<NoteSnapshot>;
  save(input: {
    workspaceId: string;
    noteId: string;
    content: string;
    expectedVersion?: string;
    requestId: string;
  }): Promise<{ note: NoteSnapshot } | { conflict: true; current: NoteSnapshot }>;
  delete(input: { workspaceId: string; noteId: string; requestId: string }): Promise<void>;
}
```

正文只能有一个权威来源。数据库索引、预览和缓存不能冒充正文。

## 4. 白板接口

白板必须区分原生对象和引用对象：

```ts
type BoardObject =
  | {
      id: string;
      kind: 'text' | 'sticky' | 'shape' | 'image' | 'line';
      x: number;
      y: number;
      width: number;
      height: number;
      payload: unknown;
    }
  | {
      id: string;
      kind: 'note-reference';
      noteId: string;
      x: number;
      y: number;
      width: number;
      height: number;
      display: 'compact' | 'card' | 'preview';
    };

interface BoardSnapshot {
  id: string;
  workspaceId: string;
  title: string;
  objects: BoardObject[];
  version: string;
  updatedAt: number;
}

interface BoardService {
  list(workspaceId: string): Promise<BoardSnapshot[]>;
  read(input: { workspaceId: string; boardId: string }): Promise<BoardSnapshot>;
  create(input: { workspaceId: string; title?: string }): Promise<BoardSnapshot>;
  apply(input: {
    workspaceId: string;
    boardId: string;
    operations: BoardOperation[];
    expectedVersion?: string;
    requestId: string;
  }): Promise<{ board: BoardSnapshot } | { conflict: true; current: BoardSnapshot }>;
}
interface BoardGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
}

type BoardOperation =
  | { kind: 'create-object'; object: BoardObject }
  | { kind: 'update-object'; objectId: string; patch: Record<string, unknown> }
  | { kind: 'delete-object'; objectId: string }
  | { kind: 'create-note-reference'; noteId: string; geometry: BoardGeometry }
  | { kind: 'remove-note-reference'; objectId: string };
```

不要让 Agent 通过鼠标坐标或截图完成白板核心写入。结构化操作更可靠；截图只作为辅助观察能力。
```ts
interface AgentRunState {
  sessionId: string;
  runId: string;
  status: 'running' | 'waiting' | 'completed' | 'failed' | 'interrupted';
}
```

## 5. Agent 会话占位接口

```ts
interface AgentRuntimeAdapter {
  start(input: { workspaceId: string; sessionId: string }): Promise<AgentRunState>;
  snapshot(input: { workspaceId: string; sessionId: string }): Promise<AgentSessionSnapshot>;
  subscribe(input: {
    workspaceId: string;
    sessionId: string;
    afterEventId?: string;
    onEvent: (event: AgentEvent) => void;
  }): () => void;
  submit(input: {
    workspaceId: string;
    sessionId: string;
    clientId: string;
    requestId: string;
    text: string;
  }): Promise<void>;
  cancel(input: { workspaceId: string; sessionId: string; runId: string }): Promise<void>;
}

interface AgentSessionSnapshot {
  sessionId: string;
  workspaceId: string;
  status: 'idle' | 'running' | 'waiting' | 'completed' | 'failed' | 'interrupted';
  runId?: string;
  lastEventId?: string;
}

interface AgentEvent {
  eventId: string;
  sessionId: string;
  runId?: string;
  type: 'message' | 'tool-call' | 'tool-result' | 'approval' | 'status' | 'error';
  payload: unknown;
}
```

当前实现使用 `MockAgentRuntimeAdapter` 或 `UnavailableAgentRuntimeAdapter`：

- 可以展示明确的占位状态。
- 可以验证会话面板、连接、事件订阅和布局。
- 不伪装成真实模型执行。
- 不引入猜测的 pi 包。

## 6. Agent 工具接口

Agent 工具适配层只调用业务服务：

```ts
interface WorkspaceTools {
  searchNotes(input: { workspaceId: string; query: string }): Promise<unknown>;
  readNote(input: { workspaceId: string; noteId: string }): Promise<unknown>;
  updateNote(input: { workspaceId: string; noteId: string; patch: unknown; expectedVersion?: string }): Promise<unknown>;
  readBoard(input: { workspaceId: string; boardId: string }): Promise<unknown>;
  applyBoardOperations(input: { workspaceId: string; boardId: string; operations: BoardOperation[]; expectedVersion?: string }): Promise<unknown>;
}
```

未来把这些注册给具体 Agent/pi 时，注册代码只能位于 `runtime/agent-adapter`。业务服务不得反向导入具体运行时。

## 7. 变更通知

所有共享内容变更事件至少携带：

```ts
interface ContentChangedEvent {
  eventId: string;
  workspaceId: string;
  entity: { kind: 'note' | 'board'; id: string };
  version: string;
  source: 'user' | 'agent' | 'external';
}
```

事件丢失后必须能够重新读取快照。不能把事件总线当作唯一数据源。
