/**
 * AgentTool 简化版
 * 对应原项目：tools/AgentTool/
 * 创建子代理任务（LocalAgentTask）
 */

import { buildTool } from './index.js';
import type { ToolUseContext } from './types.js';

export interface AgentInput {
  prompt: string;
  allowedTools?: string[];
}

export const AgentTool = buildTool<AgentInput, string>({
  name: 'agent',
  description: 'Delegate a task to a sub-agent',
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
          toolUseId: 'agent-use',
        },
      },
    }));

    // 模拟子代理执行完成
    context.setAppState((state) => ({
      ...state,
      tasks: {
        ...state.tasks,
        [taskId]: { ...state.tasks[taskId], status: 'completed', endTime: Date.now(), output: [...state.tasks[taskId].output, 'Done'] },
      },
    }));

    return `Agent task ${taskId} completed`;
  },
});
