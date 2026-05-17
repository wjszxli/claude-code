# Claude Code 简化版 —— 架构设计详解

本文档说明本简化版如何体现原项目的核心架构思想，以及各个模块之间的设计决策。

---

## 1. 为什么需要 Orchestrator？

原项目的代码分布在 `main.tsx`、`screens/REPL.tsx`、`ask()`、`QueryEngine.ts` 等多个文件中。对于初次阅读源码的人来说，最大的困难不是理解单个类，而是**看不清数据如何在类之间流动**。

因此，本简化版引入了一个显式的 **Orchestrator（`App.ts`）**，它的唯一职责就是把"用户输入"翻译为"状态更新"，将分散的模块串联成一条清晰的数据流水线。

> **设计原则**：Orchestrator 只负责"调度"，不实现具体业务逻辑。业务逻辑仍然由 Engine、Tools、Tasks 等模块各自负责。

---

## 2. 状态管理层：极简 Store 的哲学

原项目没有使用 Redux、Zustand 或 MobX，而是自研了一个不到 40 行的 `createStore`：

```ts
export function createStore<T>(initialState: T): Store<T> {
  let state = initialState;
  const listeners = new Set<Listener>();
  // ...
}
```

这背后有三个关键决策：

1. **不可变更新**：所有状态变更必须通过 `(state) => nextState` 完成，旧对象绝不修改。这确保了订阅者可以通过简单的引用比较来判断是否需要重新渲染或处理。
2. **引用相等优化**：如果 updater 返回的对象引用与旧状态相同，不触发任何订阅者。这个细节在高频更新场景下能节省大量性能。
3. **去中心化订阅**：没有 Selector、没有 Middleware。任何模块都可以 `subscribe`，但没有任何模块能拿到全局 setter 去随意修改不相关的状态。

在简化版中，整个系统只有一个 `Store<AppState>`，由 `App` 持有并注入到所有需要的子模块中。

---

## 3. 权限系统：多层决策漏斗

原项目的权限检查是一个多层漏斗：

```
PermissionMode (default / auto / plan / yolo)
    ↓
Tool Rules (alwaysAllow / alwaysDeny / alwaysAsk)
    ↓
PreToolUse Hooks
    ↓
Auto Classifier (安全分类器，auto 模式下运行)
    ↓
Interactive Dialog (弹窗询问用户)
```

简化版将这个漏斗收敛为两个维度：

| 维度 | 控制点 | 说明 |
|------|--------|------|
| 全局策略 | `PermissionMode` | 决定默认行为 |
| 工具元数据 | `isDestructive` / `isReadOnly` | 决定工具自身的风险等级 |
| 显式黑名单 | `deniedTools` | 最高优先级拒绝 |

例如：
- `plan` 模式 + `FileReadTool(isReadOnly=true)` → **自动允许**
- `plan` 模式 + `BashTool(isDestructive=true)` → **需要确认**
- `yolo` 模式 → **全部自动允许**

这种设计让权限决策变得可预测且可测试，同时保留了原项目"按工具元数据决策"的核心思想。

---

## 4. QueryEngine：对话循环的心脏

`QueryEngine` 的职责可以用一句话概括：**Owning the query lifecycle and session state for a conversation**。

关键设计点：

### 4.1 状态持久性
一个 `QueryEngine` 实例对应一个完整对话 session。`messages`、`file cache`、`token usage` 在多次 `submit` 之间持久保留。

### 4.2 工具循环 (Tool Loop)
当模型返回 `tool_use` 时，引擎不会结束，而是：
1. 执行工具
2. 将结果追加到 `messages` 历史
3. 自动发起 **follow-up query**

这个循环可能持续多轮，直到模型不再请求工具。

### 4.3 并发编排
原项目中，`toolOrchestration.ts` 将 read-only 工具批量并发执行，写操作强制串行。简化版中为了降低复杂度，采用了顺序串行执行，但保留了"将 tool result 回注历史并自动 follow-up"的核心逻辑。

---

## 5. 工具系统：统一接口的威力

无论是内置的 `BashTool`、`FileReadTool`，还是外部的 MCP 工具、Agent 子任务，最终都实现同一个 `Tool` 接口：

```ts
interface Tool<Input, Output> {
  name: string;
  description: string;
  call(input, context): Promise<Output>;
  isReadOnly(): boolean;
  isDestructive(): boolean;
  checkPermissions(input, context): Promise<PermissionResult>;
}
```

这意味着 `QueryEngine` 完全不需要关心工具的内部实现来源。它只需要：
1. 从注册表中取出工具
2. 调用 `checkPermissions`
3. 调用 `call`
4. 将结果格式化为 `tool_result` 消息

### 5.1 AgentTool 的特殊性
`AgentTool` 是"工具中的工具"。它创建一个 `local_agent` 任务并写入 `AppState.tasks`。这体现了原项目的核心架构特点：

> **任务即子会话 (Task as Sub-Session)**

子代理有自己的 QueryEngine、自己的消息历史、自己的上下文，但与主会话共享同一个全局 `tasks` 记录表。主会话可以通过 `TaskListTool` / `TaskOutputTool` 查询子任务的输出。

---

## 6. 任务系统：前台与后台分离

`TaskManager` 管理的是"后台任务"，与 `QueryEngine` 的前台对话循环形成互补：

| 场景 | 负责模块 |
|------|----------|
| 用户发送消息，LLM 回复 | `QueryEngine` |
| Bash 命令长时间运行 | `TaskManager` (local_bash) |
| 子代理在后台分析代码 | `TaskManager` (local_agent) |
| 远程代理执行复杂任务 | `TaskManager` (remote_agent) |

`TaskManager` 不直接执行命令，而是：
- 维护 `Map<string, Task>`
- 调度状态流转
- 广播事件给 UI / Bridge
- 回收已完成的任务资源

---

## 7. Bridge：边缘计算模式

`Bridge` 是 Claude Code 的"边缘计算"能力。它让本地 CLI 成为 Claude.ai 网页端的远程执行 Worker：

1. **云端**发送一个 work item（如"帮我编辑这个文件"）
2. **Bridge** 接收并创建一个本地 `Session`
3. **Session** 中启动一个子 CLI 进程执行对话
4. 本地产生的所有活动（tool_start、result、error）通过消息总线**实时回传**给云端

这种设计的核心挑战是**会话隔离**。原项目支持 `worktree` spawn mode，为每个远程会话创建独立的 git worktree，避免文件冲突。简化版保留了"Session + 消息总线"的抽象，但用内存实现替代了真实进程管理。

---

## 8. 模块依赖规则

```
00-core        (无依赖)
  ↑
01-commands    依赖 00-core
02-engine      依赖 00-core, 03-tools
03-tools       依赖 00-core
04-tasks       依赖 00-core
05-bridge      依赖 00-core
  ↑
06-orchestrator 依赖 01~05
```

这个依赖图确保了：
- **无循环依赖**：任何两个模块之间不会出现 A→B→A 的循环。
- **可测试性**：每一层都可以独立单元测试，只需 mock 下层接口。
- **可替换性**：如果你想替换 Store 实现、替换 QueryEngine 的 LLM 后端，或者替换 Bridge 的通信协议，都不会影响其他模块。

---

## 9. 与原项目的映射关系

| 简化版模块 | 原项目对应文件/目录 |
|-----------|---------------------|
| `00-core/store.ts` | `state/store.ts` |
| `00-core/types.ts` | `state/AppStateStore.ts`, `types/command.ts`, `Task.ts` |
| `00-core/permissions.ts` | `utils/permissions/`, `Tool.ts` |
| `01-commands/registry.ts` | `commands.ts` (命令聚合) |
| `01-commands/slash.ts` | `utils/processUserInput/processSlashCommand.tsx` |
| `02-engine/QueryEngine.ts` | `QueryEngine.ts` |
| `03-tools/factory.ts` | `Tool.ts` 中的 `buildTool()` |
| `03-tools/registry.ts` | `tools.ts` 中的 `getTools()`, `assembleToolPool()` |
| `03-tools/bash.ts` | `tools/BashTool/BashTool.ts` |
| `03-tools/file.ts` | `tools/FileReadTool/`, `tools/FileEditTool/` |
| `03-tools/agent.ts` | `tools/AgentTool/AgentTool.ts` |
| `04-tasks/TaskManager.ts` | `Task.ts`, `tasks/` 目录 |
| `05-bridge/Bridge.ts` | `bridge/bridgeMain.ts`, `bridge/` 目录 |
| `06-orchestrator/App.ts` | `main.tsx` + `screens/REPL.tsx` + `ask()` 的协同 |

---

## 10. 总结

本简化版的核心价值不是"把大文件拆成小函数"，而是：

1. **体系化**：按照原项目的真实架构层次重新组织代码。
2. **串联**：通过 `App.ts` 将用户输入 → 命令 → 引擎 → 工具 → 任务 → 状态更新 的完整链路显式地呈现出来。
3. **设计思想显性化**：每个模块的头部注释都说明了它对应原项目的哪部分，以及背后的架构决策（如为什么用极简 Store、为什么工具要统一接口、为什么 Task 和 QueryEngine 要分离）。

如果你要深入研究原项目源码，建议的阅读路径是：

```
00-core → 01-commands → 03-tools → 02-engine → 04-tasks → 05-bridge → 06-orchestrator
```

最后，打开 `tests/integration.test.ts`，你就能看到一条完整的端到端数据流。
