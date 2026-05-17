/**
 * BashTool 简化版
 * 对应原项目：tools/BashTool/
 * 使用内存 Mock 替代真实子进程
 */

import { buildTool } from './index.js';
import type { ToolUseContext } from './types.js';

export interface BashInput {
  command: string;
  timeout?: number;
}

export interface BashOutput {
  stdout: string;
  stderr: string;
  exitCode: number;
}

// 内存 Mock：模拟命令执行
export const mockShell = new Map<string, BashOutput>();

export const BashTool = buildTool<BashInput, BashOutput>({
  name: 'bash',
  description: 'Execute a bash command',
  inputSchema: {
    type: 'object',
    properties: {
      command: { type: 'string' },
      timeout: { type: 'number' },
    },
    required: ['command'],
  },
  isDestructive: () => true,
  call: async (input, context) => {
    const mocked = mockShell.get(input.command);
    if (mocked) return mocked;

    // 模拟任务注册（简化版：直接写入 state）
    const taskId = `shell-${Date.now()}`;
    context.setAppState((state) => ({
      ...state,
      tasks: {
        ...state.tasks,
        [taskId]: {
          id: taskId,
          type: 'local_bash',
          status: 'running',
          description: input.command,
          startTime: Date.now(),
          output: [],
          notified: false,
          toolUseId: 'bash-use',
        },
      },
    }));

    // 模拟执行完成
    context.setAppState((state) => ({
      ...state,
      tasks: {
        ...state.tasks,
        [taskId]: { ...state.tasks[taskId], status: 'completed', endTime: Date.now() },
      },
    }));

    return { stdout: `Executed: ${input.command}`, stderr: '', exitCode: 0 };
  },
});
