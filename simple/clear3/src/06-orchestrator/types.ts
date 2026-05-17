/**
 * Orchestrator 类型定义
 * ============================================================================
 * 设计思想：
 * Orchestrator 是整个系统的"胶水层"。它本身不实现具体业务逻辑，而是：
 * 1. 持有并初始化各层模块（Store、CommandRegistry、QueryEngine、TaskManager、Bridge）
 * 2. 定义标准数据流：用户输入 → 命令拦截 → LLM 对话 → 工具执行 → 状态更新
 * 3. 提供对外的统一 API，隐藏内部模块的交互细节
 *
 * 这对应原项目中 main.tsx + REPL.tsx + ask() 的协同作用。
 * ============================================================================
 */

import type { AppState } from '../00-core/types.js';
import type { Command } from '../01-commands/types.js';
import type { Tool } from '../03-tools/types.js';

export interface AppConfig {
  initialState?: AppState;
  commands?: Command[];
  tools?: Tool<any, any>[];
  systemPrompt?: string;
}

export interface SubmitResult {
  /** 最终响应文本 */
  responseText: string;
  /** 是否执行了工具 */
  hadToolCalls: boolean;
  /** 当前消息历史长度 */
  messageCount: number;
  /** 当前任务数量 */
  taskCount: number;
}
