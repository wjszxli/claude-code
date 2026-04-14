/**
 * Slash 命令解析简化版
 * 对应原项目：utils/processUserInput/processSlashCommand.tsx
 */

import { findCommand, executeCommand } from './index.js';
import type { CommandContext } from './types.js';

export interface SlashResult {
  commandName: string;
  args: string[];
  result: Awaited<ReturnType<typeof executeCommand>>;
}

export async function processSlashCommand(
  input: string,
  context: CommandContext,
): Promise<SlashResult | null> {
  if (!input.startsWith('/')) return null;

  const parts = input.slice(1).trim().split(/\s+/);
  const name = parts[0];
  const args = parts.slice(1);

  const command = findCommand(name);
  if (!command) throw new Error(`Unknown command: /${name}`);

  const result = await executeCommand(command, args, context);
  return { commandName: command.name, args, result };
}
