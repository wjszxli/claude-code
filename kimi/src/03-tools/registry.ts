/**
 * 工具注册表 (Tool Registry)
 * ============================================================================
 * 设计思想：
 * 原项目 tools.ts 的职责是"动态组装 Tool Pool"：
 * - 合并内置工具与 MCP 工具
 * - 按权限上下文过滤（deniedTools）
 * - 运行时特性开关控制（feature flags）
 *
 * 简化版保留了"注册 → 查询 → 按上下文过滤"的三段式结构。
 * ============================================================================
 */

import type { Tool } from './types.js';
import type { ToolPermissionContext } from '../00-core/types.js';

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
