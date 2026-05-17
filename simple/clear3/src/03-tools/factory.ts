/**
 * 工具工厂 (Tool Factory)
 * ============================================================================
 * 设计思想：
 * buildTool 对应原项目 Tool.ts 中的同名函数。它为工具定义补充安全默认值，
 * 确保每个 Tool 都具备完整的接口契约，同时让开发者只需关注"业务逻辑"。
 * ============================================================================
 */

import { checkToolPermission } from '../00-core/permissions.js';
import type { Tool, ToolDef, ToolUseContext } from './types.js';

export function buildTool<Input, Output>(def: ToolDef<Input, Output>): Tool<Input, Output> {
  return {
    ...def,
    isEnabled: def.isEnabled ?? (() => true),
    isReadOnly: def.isReadOnly ?? (() => false),
    isDestructive: def.isDestructive ?? (() => false),
    checkPermissions:
      def.checkPermissions ??
      (async (input, ctx) => {
        const result = checkToolPermission(
          def.name,
          ctx.permissionContext,
          def.isDestructive?.() ?? false,
          def.isReadOnly?.() ?? false,
        );
        return { behavior: result.behavior as 'allow' | 'deny' | 'ask', updatedInput: input };
      }),
  };
}

/**
 * 统一执行入口：先过权限检查，再执行 call。
 */
export async function executeTool<Input, Output>(
  tool: Tool<Input, Output>,
  input: Input,
  context: ToolUseContext,
): Promise<Output> {
  const perm = await tool.checkPermissions(input, context);
  if (perm.behavior === 'deny') {
    throw new Error(`Permission denied for tool: ${tool.name}`);
  }
  if (perm.behavior === 'ask') {
    throw new Error(`Permission required for tool: ${tool.name}`);
  }
  return tool.call(perm.updatedInput ?? input, context);
}
