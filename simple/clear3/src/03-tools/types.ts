/**
 * 工具系统类型 (Tool System Types)
 * ============================================================================
 * 设计思想：
 * 工具是 Claude Code 最核心的"扩展点"。无论是内置能力（Bash、FileIO）还是
 * 外部集成（MCP、Agent、Workflow），最终都统一实现为 Tool 接口。
 *
 * Tool 接口的关键字段：
 * - call: 实际执行逻辑
 * - isReadOnly / isDestructive: 用于权限漏斗和并发编排
 * - checkPermissions: 可自定义的权限检查，支持按参数细粒度控制
 *
 * 这种统一接口使得 QueryEngine 无需关心工具的内部实现来源。
 * ============================================================================
 */

import type { AppState, ToolPermissionContext } from '../00-core/types.js';

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
  /** 是否为只读操作，影响并发编排策略 */
  isReadOnly?: () => boolean;
  /** 是否为破坏性操作，影响权限决策 */
  isDestructive?: () => boolean;
  /** 自定义权限检查；若未提供，则使用全局权限规则 */
  checkPermissions?: (
    input: Input,
    context: ToolUseContext,
  ) => Promise<{ behavior: 'allow' | 'deny' | 'ask'; updatedInput?: Input }>;
}

export interface Tool<Input, Output> extends ToolDef<Input, Output> {
  isEnabled: () => boolean;
  isReadOnly: () => boolean;
  isDestructive: () => boolean;
  checkPermissions: (
    input: Input,
    context: ToolUseContext,
  ) => Promise<{ behavior: 'allow' | 'deny' | 'ask'; updatedInput?: Input }>;
}
