/**
 * 命令注册表简化版
 * 对应原项目：commands.ts
 */

import type { Command, CommandContext } from './types.js';

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
): Promise<{ type: 'messages'; messages: Message[] } | { type: 'text'; text: string } | { type: 'jsx'; promise: Promise<string> }> {
  if (command.type === 'local') {
    const text = await command.call(args);
    return { type: 'text', text };
  }

  if (command.type === 'local-jsx') {
    let resolve!: (value: string) => void;
    const promise = new Promise<string>((res) => { resolve = res; });
    command.call(resolve, args);
    return { type: 'jsx', promise };
  }

  // prompt command
  const promptText = await command.getPromptForCommand(args);
  const messages: Message[] = [
    {
      id: `cmd-${Date.now()}`,
      source: 'system',
      content: promptText,
      timestamp: Date.now(),
    },
  ];

  if (command.context === 'fork') {
    messages.push({
      id: `fork-${Date.now()}`,
      source: 'system',
      content: `[Forked to sub-agent with tools: ${command.allowedTools?.join(', ') ?? 'all'}]`,
      timestamp: Date.now(),
    });
  }

  return { type: 'messages', messages };
}

export function clearCommands(): void {
  commandRegistry.clear();
}
