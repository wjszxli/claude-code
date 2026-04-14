/**
 * 工具系统类型
 * 对应原项目：Tool.ts
 */

import type { AppState, ToolPermissionContext, Message } from '../core/types.js';

export interface ToolUseContext {
  getAppState: () => AppState;
  setAppState: (updater: (state: AppState) => AppState) => void;
  permissionContext: ToolPermissionContext;
  abortController: AbortController;
}

export interface ToolDef<Input, Output> {
  name: string;
  description: string;
  inputSchema: object;
  call: (input: Input, context: ToolUseContext) => Promise<Output>;
  isEnabled?: () => boolean;
  isReadOnly?: () => boolean;
  isDestructive?: () => boolean;
  checkPermissions?: (input: Input, context: ToolUseContext) => Promise<{ behavior: 'allow' | 'deny' | 'ask'; updatedInput?: Input }>;
}

export interface Tool<Input, Output> extends ToolDef<Input, Output> {
  isEnabled: () => boolean;
  isReadOnly: () => boolean;
  isDestructive: () => boolean;
  checkPermissions: (input: Input, context: ToolUseContext) => Promise<{ behavior: 'allow' | 'deny' | 'ask'; updatedInput?: Input }>;
}
