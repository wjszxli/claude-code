# Claude Code 简化版 —— 体系化架构实现

> 本项目是对 `@anthropic-ai/claude-code` 源码的**体系化简化**。与单纯的"函数拆解"不同，这里的代码按照原项目的真实架构层次重新组织，并通过 **Orchestrator** 将各个模块串联成一条完整的数据流。

---

## 一、核心架构层次

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CLI / REPL / Bridge                               │
│                         (外部调用方：用户输入入口)                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        06-orchestrator / App.ts                             │
│   系统编排器：将用户输入翻译为「状态更新」，隐藏各层交互细节                        │
│   • Slash Command 拦截                                                      │
│   • QueryEngine 调用与 Follow-up Loop                                       │
│   • 工具结果回注 & 状态同步                                                  │
└─────────────────────────────────────────────────────────────────────────────┘
                                       │
           ┌───────────────┬───────────┼───────────┬───────────────┐
           ▼               ▼           ▼           ▼               ▼
    ┌──────────┐    ┌──────────┐ ┌──────────┐ ┌──────────┐   ┌──────────┐
    │ 01-commands│    │ 02-engine│ │ 03-tools │ │ 04-tasks │   │ 05-bridge│
    │ 命令系统   │    │ 对话引擎 │ │ 工具工厂 │ │ 任务管理 │   │ 远程桥接 │
    └──────────┘    └──────────┘ └──────────┘ └──────────┘   └──────────┘
           │               │           │           │               │
           └───────────────┴───────────┴───────────┴───────────────┘
                                       │
                                       ▼
                        ┌──────────────────────────┐
                        │    00-core / Store       │
                        │   单一全局状态 (AppState) │
                        └──────────────────────────┘
```

---

## 二、关键数据流

一条用户消息从输入到输出的完整流程：

```
用户输入
    │
    ▼
[App.submitUserInput]
    │
    ├─► 是 "/" 开头 ? ──是──► [01-commands] 执行 Slash 命令
    │                          └─► 生成系统消息注入 AppState
    │                           ──► 返回命令结果
    │
    └─► 不是命令 ──► [02-engine / QueryEngine] 启动对话循环
                     │
                     ├─► 模拟/真实 LLM 调用 ──► 得到 assistant message
                     │
                     ├─► 包含 tool_use ? ──是──► [03-tools] 权限检查 → 执行
                     │                          └─► 更新 AppState (tasks/messages)
                     │                          └─► tool_result 回注历史
                     │                          └─► 自动 Follow-up Query
                     │
                     └─► 无 tool_use ──► 返回最终响应
```

---

## 三、目录结构与职责

| 目录 | 职责 | 对应原项目模块 |
|------|------|----------------|
| `00-core/` | 基础设施：类型定义、极简 Store、权限决策 | `state/store.ts`, `state/AppStateStore.ts`, `utils/permissions/` |
| `01-commands/` | 命令注册表与 Slash 解析器 | `commands.ts`, `utils/processUserInput/processSlashCommand.tsx` |
| `02-engine/` | QueryEngine：核心对话循环与工具调用编排 | `QueryEngine.ts`, `query.ts` |
| `03-tools/` | 工具工厂、注册表与内置工具实现 | `Tool.ts`, `tools.ts`, `tools/BashTool/`, `tools/FileReadTool/` |
| `04-tasks/` | TaskManager：后台任务生命周期管理 | `Task.ts`, `tasks/` |
| `05-bridge/` | Bridge：远程会话桥接与状态同步 | `bridge/bridgeMain.ts`, `bridge/` |
| `06-orchestrator/` | **App.ts：串联全系统的编排器** | `main.tsx` + `screens/REPL.tsx` + `ask()` 的协同作用 |

---

## 四、核心设计思想

### 1. 分层解耦与显式边界
每一层只依赖下层（`00-core` → `01~05` → `06-orchestrator`），不存在循环依赖。类型定义集中在 `00-core`，上层模块通过类型契约交互。

### 2. 单一事实源 (Single Source of Truth)
所有跨模块状态收敛到 `AppState`（`messages`、`tasks`、`permissionContext`），并通过同一个 `Store` 驱动。任何模块的状态变更都通过不可变更新完成，订阅者自动感知。

### 3. 工具即扩展点 (Tool as Extension Point)
无论是 Bash、FileIO、Agent 子任务还是 MCP 外部工具，最终都统一实现 `Tool` 接口。`isReadOnly` / `isDestructive` 元数据决定了权限决策和并发编排策略。

### 4. 任务与对话分离 (Foreground vs Background)
`QueryEngine` 负责前台对话循环，`TaskManager` 负责后台长时间运行任务。二者共享 `AppState.tasks`，但生命周期独立管理。

### 5. Bridge：本地即 Worker
`Bridge` 让 CLI 可以作为远程执行节点运行。每个远程会话有独立的 `Session` 状态，通过消息总线将本地活动实时同步给云端。

---

## 五、快速开始

```bash
cd /Users/huasheng/study/claude-code/kimi
bun install
bun test
```

### 使用 Orchestrator 编写代码

```typescript
import { createApp, BashTool, FileReadTool } from './src/index.js';

const app = createApp({
  tools: [BashTool, FileReadTool],
  systemPrompt: 'You are a helpful coding assistant.',
});

// 订阅状态变化
app.store.subscribe(() => {
  console.log('Messages:', app.store.getState().messages.length);
  console.log('Tasks:', Object.keys(app.store.getState().tasks).length);
});

// 提交用户输入
const result = await app.submitUserInput('Use the bash tool');
console.log(result.responseText);
```

---

## 六、测试覆盖

- `tests/core.test.ts` —— Store、Permissions、AppState
- `tests/commands.test.ts` —— 命令注册、执行、Slash 解析
- `tests/engine.test.ts` —— QueryEngine 对话循环
- `tests/tools.test.ts` —— 工具工厂、BashTool、FileTool、AgentTool
- `tests/tasks.test.ts` —— TaskManager 生命周期
- `tests/bridge.test.ts` —— Bridge 会话管理
- `tests/integration.test.ts` —— **端到端完整流程**
