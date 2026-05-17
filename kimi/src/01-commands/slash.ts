/**
 * Slash 命令解析器 (Slash Command Parser)
 * ============================================================================
 * 设计思想：
 * 用户输入如果以 "/" 开头，优先进入命令系统而非 LLM 对话。
 * 这是 REPL 层与 QueryEngine 之间的"前置拦截器"。
 * ============================================================================
 */

import { findCommand, executeCommand } from './registry.js';
import type { CommandContext, CommandResult } from './types.js';

export interface SlashResult {
  commandName: string;
  args: string[];
  result: CommandResult;
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
