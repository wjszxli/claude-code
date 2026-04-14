# Claude Code 架构设计概览

> 版本: 2.1.88 | 更新时间: 2026-04-13

## 目录

- [项目概述](#项目概述)
- [整体架构](#整体架构)
- [模块结构](#模块结构)
- [核心组件](#核心组件)
- [工具系统](#工具系统)
- [状态管理](#状态管理)
- [UI 渲染层](#ui-渲染层)
- [服务层](#服务层)
- [构建系统](#构建系统)

---

## 项目概述

Claude Code 是一个基于 TypeScript + React + Ink 构建的命令行 AI 编码助手，通过 MCP (Model Context Protocol) 实现工具扩展能力。该项目是从 `@anthropic-ai/claude-code` npm 包还原的完整源码。

### 核心特性

- **REPL 模式**: 交互式命令行体验，支持实时流式输出
- **MCP 集成**: 通过 Model Context Protocol 扩展工具能力
- **多会话管理**: 支持后台任务、远程控制、Agent 协作
- **Vim 模式**: 终端内代码编辑器
- **插件系统**: 支持技能 (Skills) 和动态工具加载
- **IDE 集成**: 与 VS Code、JetBrains 等 IDE 深度集成
- **任务系统**: Todo 列表、Agent 任务追踪

---

## 整体架构

### 入口点

```
src/entrypoints/cli.tsx (Bootstrap)
    ↓
src/main.tsx (REPL 主循环)
    ↓
QueryEngine (查询引擎)
    ↓
Anthropic API (流式响应)
    ↓
Tools (工具执行)
```

### 执行流程

```
用户输入 → 命令解析 → 查询构建
    ↓
上下文分析 (文件读取、历史、记忆)
    ↓
API 调用 (系统提示 + 消息)
    ↓
工具调用 (权限检查 → 并发执行)
    ↓
结果处理 (渲染 + 状态更新)
```

### 分层架构

| 层级 | 职责 | 核心模块 |
|------|--------|----------|
| **CLI 层** | 命令行解析、参数处理 | `cli/` |
| **入口层** | 快速路径分发、启动配置 | `entrypoints/` |
| **查询层** | 请求构建、上下文管理 | `QueryEngine.ts`, `query.ts` |
| **工具层** | 工具定义、执行、权限 | `tools/`, `Tool.ts` |
| **UI 层** | 终端渲染、React 组件 | `ink/`, `components/` |
| **状态层** | 应用状态管理 | `state/AppState.tsx` |
| **服务层** | 外部服务集成 | `services/` |
| **Hook 层** | 生命周期钩子 | `hooks/` |
| **工具层** | 通用工具函数 | `utils/` |

---

## 模块结构

### 目录树概览

```
src/
├── entrypoints/          # CLI 入口点
├── main.tsx              # 主 REPL 循环
├── Tool.ts               # 工具类型定义
├── Task.ts               # 任务类型定义
├── QueryEngine.ts         # 查询引擎
├── query.ts              # 查询逻辑
├── assistant/            # 会话历史管理
├── bridge/               # IDE 桥接层
├── buddy/               # 子代理系统 (Team/Swarm)
├── cli/                 # CLI 参数解析
├── commands/            # 斜杠命令
├── components/          # React 组件库
├── constants/           # 全局常量
├── context/             # 上下文管理
├── hooks/              # 生命周期钩子
├── ink/                # 自研终端渲染引擎
├── keybindings/        # 键盘快捷键
├── services/            # 核心服务
├── skills/             # 技能系统
├── state/              # 状态管理
├── tasks/              # 任务执行器
├── tools/              # 工具实现
├── types/              # 类型定义
├── utils/              # 工具函数
├── vim/                # Vim 模式
└── ...
```

---

## 核心组件

### 1. CLI 入口 (`entrypoints/cli.tsx`)

**职责**: 快速路径分发和启动配置

```typescript
// 快速路径
- --version          → 输出版本后退出
- --dump-system-prompt → 输出系统提示
- --daemon-worker    → Daemon 工作进程
- remote-control     → 桥接模式
- daemon            → 长运行守护进程
- ps/logs/attach/kill → 会话管理
- --bg/--background   → 后台任务
```

### 2. 主循环 (`main.tsx`)

**职责**: REPL 核心循环

- 消息处理队列
- 工具调用调度
- 状态同步
- UI 渲染触发
- 中断/恢复处理

### 3. 查询引擎 (`QueryEngine.ts`)

**职责**: 构建 Anthropic API 请求

- 系统提示生成
- 消息上下文管理
- 工具定义序列化
- 流式响应处理
- 令牌预算管理

### 4. 工具系统 (`tools/`)

**工具类型**:

| 类别 | 工具 | 用途 |
|------|------|------|
| **核心工具** | BashTool, FileReadTool, FileEditTool, FileWriteTool | 基础代码操作 |
| **搜索工具** | GlobTool, GrepTool, WebSearchTool, WebFetchTool | 代码/网络搜索 |
| **代理工具** | AgentTool, TaskCreateTool, TaskGetTool, TaskUpdateTool, TaskListTool | 多任务/代理执行 |
| **交互工具** | AskUserQuestionTool, SkillTool, ConfigTool | 用户交互 |
| **协作工具** | SendMessageTool, TeamCreateTool, TeamDeleteTool | 团队协作 |
| **MCP 工具** | MCPTool, ReadMcpResourceTool, ListMcpResourcesTool | MCP 资源访问 |
| **LSP 工具** | LSPTool | 语言服务器集成 |
| **工作流工具** | WorkflowTool, CronCreateTool, CronDeleteTool, CronListTool | 工作流/定时任务 |
| **其他** | NotebookEditTool, BriefTool, TaskStopTool, EnterPlanModeTool, ExitPlanModeToolV2 | 专项功能 |

### 5. 任务系统 (`tasks/`)

**任务类型**:

| 类型 | 说明 | 实现路径 |
|------|------|----------|
| `local_bash` | 本地 Shell 命令 | `tasks/LocalShellTask/` |
| `local_agent` | 本地子代理 | `tasks/LocalAgentTask/` |
| `remote_agent` | 远程子代理 | `tasks/RemoteAgentTask/` |
| `in_process_teammate` | 进程内队友 | `tasks/InProcessTeammateTask/` |
| `local_workflow` | 本地工作流 | `tasks/LocalWorkflowTask/` |
| `monitor_mcp` | MCP 监控 | - |
| `dream` | Dream 任务 | `tasks/DreamTask/` |

**任务状态**: `pending` → `running` → `completed`/`failed`/`killed`

### 6. Bridge 系统 (`bridge/`)

**职责**: IDE 桥接和远程控制

- `bridgeApi.ts` - 桥接 API
- `bridgeMain.ts` - 桥接主循环
- `replBridge.ts` - REPL 桥接
- `remoteBridgeCore.ts` - 远程桥接核心
- `sessionRunner.ts` - 会话运行器

**桥接特性**:
- VS Code 集成
- JetBrains 集成
- 代码同步
- 运行远程代码

---

## UI 渲染层

### Ink 终端渲染引擎 (`ink/`)

自研终端渲染框架，基于 React + 原生终端控制。

**核心模块**:

| 模块 | 职责 |
|------|------|
| `ink.tsx` | 主渲染器 |
| `terminal.ts` | 终端仿真 |
| `render-to-screen.ts` | 屏幕渲染 |
| `render-node-to-output.ts` | 节点渲染 |
| `reconciler.ts` | 协调算法 |
| `optimizer.ts` | 渲染优化 |

**特性**:
- ANSI 颜色支持
- 双向文本处理 (bidi-js)
- 超链接支持
- 语法高亮

### React 组件库 (`components/`)

**核心组件**:

| 组件 | 功能 |
|--------|------|
| `App.tsx` | 主应用容器 |
| `Message.tsx` | 消息渲染 |
| `Spinner.tsx` | 加载动画 |
| `TextInput.tsx` | 输入框 |
| `MessageSelector.tsx` | 消息选择器 |
| `TaskListV2.tsx` | 任务列表 |
| `Settings/` | 设置面板 |
| `skills/` | 技能界面 |
| `teams/` | 团队界面 |
| `mcp/` | MCP 管理界面 |
| `diff/` | Diff 视图 |
| `HighlightedCode/` | 代码高亮 |

**自定义 hooks** (`hooks/`):

| Hook | 功能 |
|------|------|
| `useCanUseTool.tsx` | 工具权限检查 |
| `useCommandKeybindings.tsx` | 命令快捷键 |
| `useClipboard.ts` | 剪贴板操作 |
| `useTypeahead.tsx` | 智能提示 |
| `useIDEIntegration.tsx` | IDE 集成 |
| `useRemoteSession.ts` | 远程会话 |
| `useTasksV2.ts` | 任务管理 |
| `useVoice.tsx` | 语音集成 |

---

## 状态管理

### AppState (`state/AppState.tsx`)

**全局状态结构**:

```typescript
interface AppState {
  // 会话状态
  messages: Message[]
  currentModel: string

  // 工具状态
  inProgressToolUseIDs: Set<string>
  tools: Tools
  mcp: MCPState

  // 任务状态
  tasks: Map<string, TaskState>

  // UI 状态
  streamMode: SpinnerMode
  theme: ThemeName

  // 配置状态
  settings: UserSettings

  // ...
}
```

**状态更新**:
- `setAppState()` - 状态更新入口
- `onChangeAppState()` - 状态变更监听

### 选择器 (`state/selectors.ts`)

提供高效的状态查询接口。

---

## 服务层

### 核心服务 (`services/`)

| 服务 | 功能 |
|------|------|
| `api/` | Anthropic API 调用 |
| `mcp/` | MCP 服务器连接和管理 |
| `policyLimits/` | 策略限制管理 |
| `analytics/` | 分析数据收集 |
| `SessionMemory/` | 会话记忆 |
| `teamMemorySync/` | 团队记忆同步 |
| `PromptSuggestion/` | 提示建议 |
| `rateLimitMessages.ts` | 速率限制处理 |
| `claudeAiLimits.ts` | AI 限制管理 |
| `voice.ts` | 语音服务 |
| `tokenEstimation.ts` | 令牌估算 |
| `compact/` | 上下文压缩 |
| `lsp/` | LSP 集成 |
| `oauth/` | OAuth 认证 |
| `remoteManagedSettings.ts` | 远程设置 |

---

## 工具系统

### Tool 接口 (`Tool.ts`)

```typescript
interface Tool<Input, Output, Progress> {
  // 标识
  name: string
  aliases?: string[]
  searchHint?: string

  // 定义
  inputSchema: z.ZodType
  outputSchema?: z.ZodType

  // 执行
  call(args, context): Promise<ToolResult<Output>>

  // 描述
  description(input, options): Promise<string>

  // 权限
  checkPermissions(input, context): Promise<PermissionResult>

  // 特性标记
  isEnabled(): boolean
  isConcurrencySafe(input): boolean
  isReadOnly(input): boolean
  isDestructive?(input): boolean

  // 渲染
  renderToolUseMessage(input): React.ReactNode
  renderToolResultMessage(output): React.ReactNode
  renderToolUseProgressMessage(progress): React.ReactNode
  getActivityDescription(input): string | null
}
```

### 工具注册 (`tools.ts`)

```typescript
export function getAllBaseTools(): Tools
export function getTools(permissionContext: ToolPermissionContext): Tools
export function assembleToolPool(
  permissionContext: ToolPermissionContext,
  mcpTools: Tools
): Tools
```

---

## 构建系统

### Bun 构建 (`build.ts`)

**构建特性**:

1. **特性开关** - 通过 `bun:bundle` 实现死代码消除
   ```typescript
   import { feature } from 'bun:bundle'
   if (feature('SOME_FEATURE')) {
     // 仅在启用时包含此代码
   }
   ```

2. **MACRO 常量** - 编译期常量注入
   ```typescript
   // MACRO.VERSION, MACRO.BUILD_TIME 等在构建时被替换
   ```

3. **文本文件导入** - `.md`/`.txt` 作为字符串导入

4. **External 排除** - 原生模块和可选云 SDK 不打包

### Postinstall 脚本 (`scripts/postinstall.js`)

1. 创建私有包存根
   - `color-diff-napi`
   - `modifiers-napi`
   - `@ant/claude-for-chrome-mcp`
   - `@anthropic-ai/mcpb`
   - `@anthropic-ai/sandbox-runtime`

2. 补丁 commander
   - 支持多字符短选项 (`-d2e`)

### Vendor 目录

原生模块加载层：

| 模块 | 功能 |
|------|------|
| `modifiers-napi-src/` | macOS 键盘修饰键检测 |
| `url-handler-src/` | macOS URL scheme 监听 |
| `audio-capture-src/` | 麦克风录音/播放 |
| `image-processor-src/` | 图片处理 |

---

## MCP 集成

### MCP 服务 (`services/mcp/`)

**核心能力**:

| 能力 | 说明 |
|------|------|
| 工具注册 | 动态加载外部工具 |
| 资源访问 | 读取外部资源 |
| Prompt 注入 | 向工具传递上下文 |
| SSE 流式 | 实时事件推送 |

### MCP 工具

- `MCPTool` - MCP 工具包装器
- `ReadMcpResourceTool` - 读取 MCP 资源
- `ListMcpResourcesTool` - 列出 MCP 资源

---

## 关键设计模式

### 1. 工具模式

```typescript
// buildTool() 模式: 默认方法填充
function buildTool<D extends ToolDef>(def: D): BuiltTool<D>
```

### 2. 权限模式

```typescript
// 三层权限检查
1. 工具级别 - tool.checkPermissions()
2. 拦截器级别 - hooks (pre/post)
3. 全局规则 - alwaysAllow/alwaysDeny/alwaysAsk
```

### 3. 上下文传递

```typescript
// ToolUseContext 传递执行上下文
type ToolUseContext = {
  getAppState(): AppState
  setAppState(f): void
  options: ToolOptions
  abortController: AbortController
  messages: Message[]
  // ...
}
```

### 4. 进度流式

```typescript
// 流式进度更新
type ToolCallProgress<P> = (progress: ToolProgress<P>) => void

// 子代理进度转发
type SubagentProgressHandler = (progress) => void
```

### 5. 状态压缩

**内存优化策略**:

1. **Hook 摘要** - 只保留摘要
2. **后台任务压缩** - 移除后台任务输出
3. **历史折叠** - 折叠旧消息
4. **工具结果限制** - 大结果持久化到文件

---

## 扩展机制

### 技能系统 (`skills/`)

**技能加载路径**:
- `~/.claude/skills/` - 用户技能目录
- `~/.claude/projects/<project>/skills/` - 项目技能目录

**技能类型**:
- 独立技能文件 (`.md`)
- 技能目录 (多文件)

### 插件系统 (`plugins/`)

- 内置插件打包 (`plugins/bundled/`)
- 外部插件动态加载

### LSP 集成

- 语言服务器协议支持
- 代码导航、补全
- 诊断集成

---

## 数据流

```
用户输入
    ↓
processUserInput/ (斜杠命令解析)
    ↓
QueryEngine (构建 API 请求)
    ↓
Anthropic API
    ↓
Tools (工具调用)
    ↓
Task (后台执行)
    ↓
Result (返回给 AI)
    ↓
AppState (状态更新)
    ↓
Components (UI 渲染)
```

---

## 技术栈

| 类别 | 技术 |
|------|------|
| **语言** | TypeScript |
| **运行时** | Node.js / Bun |
| **UI 框架** | React + Ink |
| **API** | Anthropic SDK |
| **协议** | MCP (Model Context Protocol) |
| **构建** | Bun bundler |
| **包管理** | npm + bun.lock |

---

## 配置与常量

### 常量 (`constants/`)

- `prompts.ts` - 系统提示模板
- `tools.ts` - 工具配置常量
- `querySource.ts` - 查询来源定义

### 用户设置 (`services/settings/`)

- 模型选择
- 主题配置
- 权限模式
- 编辑器偏好

---

## 特性开关

通过 `bun:bundle` 实现的条件编译：

| 开关 | 说明 |
|------|------|
| `DUMP_SYSTEM_PROMPT` | 导出系统提示 |
| `BRIDGE_MODE` | 桥接模式 |
| `DAEMON` | 守护进程 |
| `BG_SESSIONS` | 后台会话 |
| `TEMPLATES` | 模板系统 |
| `BYOC_ENVIRONMENT_RUNNER` | 环境运行器 |
| `SELF_HOSTED_RUNNER` | 自托管运行器 |
| `WORKFLOW_SCRIPTS` | 工作流脚本 |
| `WEB_BROWSER_TOOL` | Web 浏览器工具 |
| `COORDINATOR_MODE` | 协调器模式 |
| `OVERFLOW_TEST_TOOL` | 溢出测试工具 |
| `CONTEXT_COLLAPSE` | 上下文折叠 |
| `TERMINAL_PANEL` | 终端面板 |
| `AGENT_TRIGGERS` | 代理触发器 |
| `MONITOR_TOOL` | 监控工具 |

---

## 安全与权限

### 权限模式

```typescript
type PermissionMode = 'default' | 'auto' | 'bypass'
```

### 拒绝追踪

```typescript
// 本地拒决追踪
type DenialTrackingState = {
  denialCount: number
  lastDenialTime: number
}
```

### 工具权限规则

```typescript
type ToolPermissionContext = {
  mode: PermissionMode
  alwaysAllowRules: ToolPermissionRulesBySource
  alwaysDenyRules: ToolPermissionRulesBySource
  alwaysAskRules: ToolPermissionRulesBySource
  // ...
}
```

---

## 性能优化

### 1. LRU 缓存

- `fileReadCache.ts` - 文件读取缓存
- `completionCache.ts` - 补全缓存
- `toolSchemaCache.ts` - 工具模式缓存

### 2. 流式处理

- 流式 UI 更新
- 增量渲染
- 虚拟滚动

### 3. 死代码消除

- 特性开关未启用时代码完全移除
- Tree-shaking 优化
- 构建时常量内联

---

## 总结

Claude Code 是一个精心设计的终端 AI 编程助手，其架构具有以下特点：

1. **模块化设计** - 清晰的分层架构，职责分明
2. **可扩展性** - MCP、技能、插件系统提供多种扩展方式
3. **性能优化** - LRU 缓存、流式处理、死代码消除
4. **用户体验** - React + Ink 提供流畅的终端体验
5. **IDE 集成** - 深度的编辑器桥接能力
6. **多模式支持** - REPL、Vim、远程控制、后台任务

---

## 版本历史

当前版本: **2.1.88**

从 `@anthropic-ai/claude-code` npm 包的 `cli.js.map` 还原。
