/**
 * 命令系统类型
 * 对应原项目：types/command.ts
 */

import type { Message, ToolPermissionContext } from '../core/types.js';

export type CommandType = 'prompt' | 'local' | 'local-jsx';

export interface CommandBase {
  name: string;
  description: string;
  aliases?: string[];
  type: CommandType;
  isEnabled?: () => boolean;
  loadedFrom?: 'builtin' | 'skill' | 'plugin' | 'mcp';
}

export interface PromptCommand extends CommandBase {
  type: 'prompt';
  context: 'inline' | 'fork';
  getPromptForCommand: (args: string[]) => Promise<string>;
  allowedTools?: string[];
}

export interface LocalCommand extends CommandBase {
  type: 'local';
  call: (args: string[]) => Promise<string>;
}

export interface LocalJSXCommand extends CommandBase {
  type: 'local-jsx';
  call: (onDone: (result: string) => void, args: string[]) => void;
}

export type Command = PromptCommand | LocalCommand | LocalJSXCommand;

export interface CommandContext {
  permissionContext: ToolPermissionContext;
  cwd: string;
}
