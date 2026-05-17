// 命令层公共 API
export { registerCommand, findCommand, getAllCommands, executeCommand, clearCommands } from './registry.js';
export { processSlashCommand } from './slash.js';
export type { Command, CommandContext, CommandResult, SlashResult } from './types.js';
