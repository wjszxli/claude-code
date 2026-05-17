/**
 * 工具工厂与执行
 * 对应原项目：Tool.ts 中的 buildTool
 */

import type { Tool, ToolDef, ToolUseContext } from './types.js';
import { checkToolPermission } from '../core/permissions.js';

export function buildTool<Input, Output>(def: ToolDef<Input, Output>): Tool<Input, Output> {
  return {
    ...def,
    isEnabled: def.isEnabled ?? (() => true),
    isReadOnly: def.isReadOnly ?? (() => false),
    isDestructive: def.isDestructive ?? (() => false),
    checkPermissions:
      def.checkPermissions ??
      (async (input, ctx) => {
        const result = checkToolPermission(def.name, ctx.permissionContext, def.isDestructive?.() ?? false, def.isReadOnly?.() ?? false);
        return { behavior: result.behavior as 'allow' | 'deny' | 'ask', updatedInput: input };
      }),
  };
}

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
