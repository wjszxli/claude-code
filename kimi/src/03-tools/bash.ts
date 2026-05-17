/**
 * BashTool —— Shell 执行工具
 * ============================================================================
 * 设计思想：
 * BashTool 是使用率最高的工具之一。原项目中它会调用真实的子进程，
 * 并自动将长时间运行的命令注册为后台 `local_bash` 任务，支持通过 TaskManager
 * 查看输出和终止任务。
 *
 * 简化版使用内存 Mock 替代真实子进程，但保留了"任务注册"这一关键行为，
 * 以体现工具层与任务层的状态联动。
 * ============================================================================
 */

import { buildTool } from './factory.js';
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

// 内存 Mock：可预设命令输出，用于测试
export const mockShell = new Map<string, BashOutput>();

let bashTaskCounter = 0;

export const BashTool = buildTool<BashInput, BashOutput>({
  name: 'bash',
  description: 'Execute a bash command in the working directory',
  inputSchema: {
    type: 'object',
    properties: {
      command: { type: 'string' },
      timeout: { type: 'number' },
    },
    required: ['command'],
  },
  isDestructive: () => true, // 修改外部环境，标记为破坏性
  call: async (input, context) => {
    // 模拟任务注册：将 shell 命令记录为 local_bash 任务（无论是否命中 mock）
    const taskId = `shell-${Date.now()}-${++bashTaskCounter}`;
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
        },
      },
    }));

    const mocked = mockShell.get(input.command);
    const output = mocked
      ? mocked
      : { stdout: `Executed: ${input.command}`, stderr: '', exitCode: 0 };

    // 模拟执行完成
    context.setAppState((state) => ({
      ...state,
      tasks: {
        ...state.tasks,
        [taskId]: { ...state.tasks[taskId], status: 'completed', endTime: Date.now() },
      },
    }));

    return output;
  },
});
