/**
 * 工具注册表简化版
 * 对应原项目：tools.ts 中的 getTools, assembleToolPool, getMergedTools
 */

import type { Tool } from './types.js';
import type { ToolPermissionContext } from '../core/types.js';

const registry = new Map<string, Tool<unknown, unknown>>();

export function registerTool<Input, Output>(tool: Tool<Input, Output>): void {
  registry.set(tool.name, tool as Tool<unknown, unknown>);
}

export function getTool(name: string): Tool<unknown, unknown> | undefined {
  return registry.get(name);
}

export function getAllTools(): Tool<unknown, unknown>[] {
  return Array.from(registry.values()).filter((t) => t.isEnabled());
}

export function getToolsForContext(permissionContext: ToolPermissionContext): Tool<unknown, unknown>[] {
  return getAllTools().filter((t) => !permissionContext.deniedTools.includes(t.name));
}

export function clearRegistry(): void {
  registry.clear();
}
