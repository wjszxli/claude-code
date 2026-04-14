/**
 * Agent 系统 — 子代理调度
 * 简化自 src/tools/AgentTool/ (原目录 20+ 文件)
 *
 * 核心设计:
 *   - Agent = 带独立上下文的工具调用循环
 *   - 支持同步 (foreground) 和异步 (background) 执行
 *   - 内置代理类型: explore, plan, general-purpose
 *   - 子代理继承父代理的权限上下文 (可降级)
 *
 * Agent 执行模型:
 *
 *   Parent (main session)
 *     └── AgentTool.call()
 *           ├── sync: 直接在当前进程执行，返回结果
 *           └── async: 注册为后台 Task，返回 taskId
 *
 *   SubAgent context:
 *     - 继承 tools (可能受限)
 *     - 继承 permissionContext (可降级)
 *     - 独立 messages
 *     - 独立 abortController
 */

import type { Tool, Tools, ToolUseContext } from '../core/tool.js'
import type { PermissionContext, TaskState } from '../core/types.js'
import type { StateStore } from '../core/state.js'

// ────────────────────────────────────────────
// Agent Types
// ────────────────────────────────────────────

/** 代理定义 — 描述一个可用代理 */
export type AgentDefinition = {
  /** 代理类型标识 */
  type: string
  /** 显示名称 */
  displayName: string
  /** 描述 */
  description: string
  /** 可用工具白名单 (空=所有工具) */
  allowedTools?: string[]
  /** 模型覆盖 */
  model?: 'sonnet' | 'opus' | 'haiku'
  /** 系统提示 */
  prompt: string
}

/** 代理输入 */
export type AgentInput = {
  /** 任务描述 (3-5 词) */
  description: string
  /** 详细 prompt */
  prompt: string
  /** 代理类型 */
  subagent_type?: string
  /** 模型覆盖 */
  model?: 'sonnet' | 'opus' | 'haiku'
  /** 是否后台运行 */
  run_in_background?: boolean
}

/** 代理输出 */
export type AgentOutput =
  | { status: 'completed'; result: string }
  | { status: 'async_launched'; taskId: string; outputFile: string }

/** 内置代理类型 */
export const BUILT_IN_AGENTS: AgentDefinition[] = [
  {
    type: 'general-purpose',
    displayName: 'General Purpose',
    description: 'General-purpose agent for complex tasks',
    prompt: 'You are a general-purpose agent. Complete the task thoroughly.',
  },
  {
    type: 'explore',
    displayName: 'Explore',
    description: 'Fast agent for codebase exploration',
    model: 'sonnet',
    prompt: 'You are a fast exploration agent. Find information efficiently.',
  },
  {
    type: 'plan',
    displayName: 'Plan',
    description: 'Architecture planning agent',
    model: 'opus',
    prompt: 'You are a planning agent. Design implementation plans.',
  },
]

// ────────────────────────────────────────────
// Agent Context — 子代理执行上下文
// ────────────────────────────────────────────

/** 子代理执行上下文 — 从父上下文派生 */
export type SubagentContext = {
  /** 代理定义 */
  agent: AgentDefinition
  /** 过滤后的工具列表 */
  tools: Tools
  /** 权限上下文 (可能降级) */
  permissionContext: PermissionContext
  /** 独立消息列表 */
  messages: unknown[]
  /** 中断信号 */
  abortController: AbortController
  /** 父级状态引用 (用于注册任务) */
  parentStore: StateStore
  /** 父级 setAppState (子代理可能为 no-op) */
  setAppState: (f: (prev: unknown) => unknown) => void
}

/**
 * 创建子代理上下文
 *
 * 对应源码 createSubagentContext():
 *   - 工具列表过滤 (移除不允许的工具)
 *   - 权限上下文降级 (async agent 不能弹 UI)
 *   - 独立消息列表
 */
export function createSubagentContext(
  parent: ToolUseContext,
  agentDef: AgentDefinition,
  allTools: Tools,
): SubagentContext {
  // 过滤工具
  const tools = agentDef.allowedTools
    ? allTools.filter(t => agentDef.allowedTools!.includes(t.name))
    : allTools

  // 降级权限 (子代理不能弹权限弹窗)
  const permissionContext: PermissionContext = {
    mode: 'auto',
    alwaysAllowRules: [],
    alwaysDenyRules: [],
    alwaysAskRules: [],
  }

  return {
    agent: agentDef,
    tools,
    permissionContext,
    messages: [],
    abortController: new AbortController(),
    parentStore: {
      getState: parent.getAppState as () => unknown as any,
      setState: parent.setAppState as any,
      subscribe: () => () => {},
      reset: () => {},
    },
    setAppState: parent.setAppState as any,
  }
}

// ────────────────────────────────────────────
// Agent Lookup
// ────────────────────────────────────────────

/** 按类型查找代理定义 */
export function findAgentDefinition(
  type: string | undefined,
  customAgents: AgentDefinition[] = [],
): AgentDefinition {
  const all = [...BUILT_IN_AGENTS, ...customAgents]
  const found = type ? all.find(a => a.type === type) : all[0]
  if (!found) {
    throw new Error(`Unknown agent type: ${type}`)
  }
  return found
}

/** 获取所有可用代理 */
export function getAllAgents(customAgents: AgentDefinition[] = []): AgentDefinition[] {
  return [...BUILT_IN_AGENTS, ...customAgents]
}
