/**
 * 命令注册表 (Command Registry)
 * ============================================================================
 * 设计思想：
 * 原项目中 commands.ts 是所有命令的统一注册中心。内置命令、skills、plugins
 * 最终都收敛到同一个注册表中。
 *
 * 这里保持简化：一个全局 Map + 别名展开。实际生产代码会在此基础上增加：
 * - 按来源去重 (builtin < skill < plugin < mcp)
 * - 运行时可用性过滤 (isEnabled)
 * - 命令自动补全和描述聚合
 * ============================================================================
 */

import type { Command, CommandResult, CommandContext } from './types.js';

const commandRegistry = new Map<string, Command>();

export function registerCommand(command: Command): void {
  commandRegistry.set(command.name, command);
  command.aliases?.forEach((alias) => commandRegistry.set(alias, command));
}

export function findCommand(name: string): Command | undefined {
  return commandRegistry.get(name);
}

export function getAllCommands(): Command[] {
  const seen = new Set<string>();
  const result: Command[] = [];
  for (const cmd of commandRegistry.values()) {
    if (!seen.has(cmd.name)) {
      seen.add(cmd.name);
      if (cmd.isEnabled?.() !== false) result.push(cmd);
    }
  }
  return result;
}

export async function executeCommand(
  command: Command,
  args: string[],
  context: CommandContext,
): Promise<CommandResult> {
  if (command.type === 'local') {
    const text = await command.call(args);
    return { type: 'text', text };
  }

  if (command.type === 'local-jsx') {
    let resolve!: (value: string) => void;
    const promise = new Promise<string>((res) => {
      resolve = res;
    });
    command.call(resolve, args);
    return { type: 'jsx', promise };
  }

  // prompt command: 将命令转换为消息注入对话
  const promptText = await command.getPromptForCommand(args);
  const messages = [
    {
      id: `cmd-${Date.now()}`,
      source: 'system' as const,
      content: promptText,
      timestamp: Date.now(),
    },
  ];

  if (command.context === 'fork') {
    messages.push({
      id: `fork-${Date.now()}`,
      source: 'system' as const,
      content: `[Forked to sub-agent with tools: ${command.allowedTools?.join(', ') ?? 'all'}]`,
      timestamp: Date.now(),
    });
  }

  return { type: 'messages', messages };
}

export function clearCommands(): void {
  commandRegistry.clear();
}
