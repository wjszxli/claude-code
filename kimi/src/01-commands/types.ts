/**
 * 命令系统类型 (Command System Types)
 * ============================================================================
 * 设计思想：
 * 命令是用户与系统交互的第一入口。原项目的 commands.ts 不仅是 slash 命令注册表，
 * 还整合了 skills、plugins、workflows、MCP commands。
 *
 * 命令分为三类：
 * 1. local / local-jsx —— 本地执行，如 /config、/clear，直接产生副作用或 UI。
 * 2. prompt (inline) —— 将命令转换为 prompt 注入当前对话上下文。
 * 3. prompt (fork) —— 创建子代理会话，限制可用工具集，实现上下文隔离。
 * ============================================================================
 */

import type { Message, ToolPermissionContext } from '../00-core/types.js';

export type CommandType = 'prompt' | 'local' | 'local-jsx';

export interface CommandBase {
  name: string;
  description: string;
  aliases?: string[];
  type: CommandType;
  isEnabled?: () => boolean;
  /** 命令来源：builtin / skill / plugin / mcp */
  loadedFrom?: 'builtin' | 'skill' | 'plugin' | 'mcp';
}

export interface PromptCommand extends CommandBase {
  type: 'prompt';
  context: 'inline' | 'fork';
  getPromptForCommand: (args: string[]) => Promise<string>;
  /** fork 模式下限制子代理可用工具 */
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

export type CommandResult =
  | { type: 'messages'; messages: Message[] }
  | { type: 'text'; text: string }
  | { type: 'jsx'; promise: Promise<string> };
