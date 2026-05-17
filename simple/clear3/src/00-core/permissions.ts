/**
 * 权限决策层 (Permission Layer)
 * ============================================================================
 * 设计思想：
 * 原项目的权限系统是"多层决策漏斗"：
 *   mode (default/auto/plan/yolo)
 *   → rule (alwaysAllow / alwaysDeny / alwaysAsk)
 *   → classifier (auto 模式下的安全分类器)
 *   → interactive dialog (弹窗询问)
 *
 * 在简化版中，我们将这个漏斗收敛为两个维度：
 * 1. 全局模式 (PermissionMode) —— 决定默认策略。
 * 2. 工具元数据 (isDestructive / isReadOnly) —— 决定工具自身的风险等级。
 * 3. 显式黑名单 (deniedTools) —— 最高优先级拒绝。
 * ============================================================================
 */

import type { ToolPermissionContext } from './types.js';

export type PermissionBehavior = 'allow' | 'deny' | 'ask';

export interface PermissionCheck<T> {
  behavior: PermissionBehavior;
  updatedInput?: T;
}

export function checkToolPermission(
  toolName: string,
  context: ToolPermissionContext,
  isDestructive: boolean,
  isReadOnly: boolean,
): PermissionCheck<unknown> {
  // 最高优先级：显式拒绝
  if (context.deniedTools.includes(toolName)) {
    return { behavior: 'deny' };
  }

  switch (context.mode) {
    case 'yolo':
      // yolo 模式：完全自动，用户不介入
      return { behavior: 'allow' };

    case 'auto':
      // auto 模式：只拦截破坏性操作，只读操作自动放行
      // 对应原项目中 auto 分类器的行为
      return isDestructive ? { behavior: 'ask' } : { behavior: 'allow' };

    case 'plan':
      // plan 模式：仅允许只读操作，任何可能修改状态的操作都需要确认
      return isReadOnly ? { behavior: 'allow' } : { behavior: 'ask' };

    case 'default':
    default:
      // default 模式：与 auto 类似，但通常对更多操作要求确认
      if (isDestructive) return { behavior: 'ask' };
      return { behavior: 'allow' };
  }
}
