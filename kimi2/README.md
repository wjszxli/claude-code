# Claude Code Simplified (`/kimi`)

本项目是 `cloud-code-source`（Claude Code CLI 源码）的**体系化简化版本**，以**测试驱动**的方式重新组织，帮助快速理解其核心架构、设计细节与模块交互。

## 设计原则

1. **保留核心抽象**：与原项目保持接口和概念一致（Store、Tool、Command、Task、Bridge、QueryEngine）。
2. **去除复杂细节**：去掉真实文件系统、网络请求、React/Ink UI、OAuth 等外部依赖，全部使用内存 Mock。
3. **测试驱动**：每个核心模块都有对应的 `.test.ts`，通过测试来学习其设计意图。
4. **分层清晰**：按原项目的目录结构分层：`core/`、`tools/`、`commands/`、`tasks/`、`bridge/`、`engine/`。

## 与原项目的对应关系

| `/kimi/src` | 原项目 (`src/`) | 说明 |
|-------------|-----------------|------|
| `core/store.ts` | `state/AppStateStore.ts`, `state/store.ts` | 全局状态管理简化 |
| `core/mailbox.ts` | `utils/mailbox.ts`, `context/mailbox.tsx` | 异步消息总线简化 |
| `core/permissions.ts` | `utils/permissions/` | 权限检查机制简化 |
| `tools/` | `Tool.ts`, `tools.ts`, `tools/*/` | 工具接口、注册表与执行 |
| `commands/` | `types/command.ts`, `commands.ts`, `commands/*/` | 命令接口、注册与执行 |
| `tasks/` | `Task.ts`, `tasks.ts`, `tasks/*/` | 任务接口、生命周期与轮询 |
| `bridge/` | `bridge/` | 桥接协议与传输层简化 |
| `engine/` | `QueryEngine.ts` | LLM 调用循环简化 |

## 快速开始

```bash
cd /kimi
bun install   # 或 npm install
bun test      # 运行所有测试
```

## 架构总览

```
┌─────────────────────────────────────────────────────────────┐
│  Engine (QueryEngine)                                       │
│  模拟 LLM 循环：接收消息 → 选择 Tool → 执行 → 返回结果        │
└─────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│   Commands    │    │    Tools      │    │    Tasks      │
│  /command 解析 │◄──►│  工具注册/执行 │◄──►│  任务生命周期  │
└───────────────┘    └───────────────┘    └───────────────┘
        │                     │                     │
        └─────────────────────┼─────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Core (Store + Mailbox + Permissions)                       │
│  统一状态树、异步消息总线、权限控制                            │
└─────────────────────────────────────────────────────────────┘
```
