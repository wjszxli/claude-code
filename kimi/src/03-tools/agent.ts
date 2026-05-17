/**
 * AgentTool —— 子代理委派工具
 * ============================================================================
 * 设计思想：
 * AgentTool 是"工具中的工具"，它创建一个独立的 LocalAgentTask，让子代理在
 * 受限的工具集和上下文中完成子任务。主会话通过 TaskListTool / TaskOutputTool
 * 与子任务交互。
 *
 * 这体现了原项目的一个核心架构特点：
 * **任务即子会话 (Task as Sub-Session)** —— 子代理有自己的 QueryEngine、
 * 自己的消息历史、自己的状态，但与主会话共享同一个 AppState 中的 tasks 记录。
 * ============================================================================
 */

import { buildTool } from './factory.js';
import type { ToolUseContext } from './types.js';

export interface AgentInput {
  prompt: string;
  allowedTools?: string[];
}

export const AgentTool = buildTool<AgentInput, string>({
  name: 'agent',
  description: 'Delegate a task to a sub-agent with a restricted tool set',
  inputSchema: {
    type: 'object',
    properties: {
      prompt: { type: 'string' },
      allowedTools: { type: 'array', items: { type: 'string' } },
    },
    required: ['prompt'],
  },
  isDestructive: () => false,
  call: async (input, context) => {
    const taskId = `agent-${Date.now()}`;

    // 1. 在全局状态中注册子代理任务
    context.setAppState((state) => ({
      ...state,
      tasks: {
        ...state.tasks,
        [taskId]: {
          id: taskId,
          type: 'local_agent',
          status: 'running',
          description: input.prompt.slice(0, 50),
          startTime: Date.now(),
          output: [`Allowed tools: ${input.allowedTools?.join(', ') ?? 'all'}`],
          notified: false,
        },
      },
    }));

    // 2. 模拟子代理执行（实际会启动一个新的 QueryEngine）
    context.setAppState((state) => ({
      ...state,
      tasks: {
        ...state.tasks,
        [taskId]: {
          ...state.tasks[taskId],
          status: 'completed',
          endTime: Date.now(),
          output: [...state.tasks[taskId].output, 'Sub-agent finished successfully'],
        },
      },
    }));

    return `Agent task ${taskId} completed`;
  },
});
