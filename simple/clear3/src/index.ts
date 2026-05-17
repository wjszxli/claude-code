/**
 * Claude Code 简化版 —— 统一导出
 * ============================================================================
 * 使用方式：
 *   import { createApp, BashTool, FileReadTool } from 'claude-code-simplified';
 *
 *   const app = createApp({
 *     tools: [BashTool, FileReadTool],
 *     systemPrompt: 'You are a helpful coding assistant.',
 *   });
 *
 *   const result = await app.submitUserInput('Read the README file');
 * ============================================================================
 */

// 核心层
export { createStore } from './00-core/store.js';
export { checkToolPermission } from './00-core/permissions.js';
export { getDefaultAppState } from './00-core/types.js';
export type { AppState, Message, TaskState, ToolPermissionContext, PermissionMode } from './00-core/types.js';

// 命令层
export { registerCommand, findCommand, getAllCommands, executeCommand, processSlashCommand, clearCommands } from './01-commands/index.js';
export type { Command, CommandContext, CommandResult, PromptCommand, LocalCommand } from './01-commands/types.js';

// 引擎层
export { QueryEngine } from './02-engine/QueryEngine.js';
export type { EngineConfig, EngineMessage, QueryResponse, ToolCall, ToolResult } from './02-engine/types.js';

// 工具层
export { buildTool, executeTool } from './03-tools/factory.js';
export { registerTool, getTool, getAllTools, getToolsForContext, clearRegistry } from './03-tools/registry.js';
export { BashTool, mockShell } from './03-tools/bash.js';
export { FileReadTool, FileEditTool, mockFs } from './03-tools/file.js';
export { AgentTool } from './03-tools/agent.js';
export type { Tool, ToolDef, ToolUseContext } from './03-tools/types.js';

// 任务层
export { TaskManager } from './04-tasks/TaskManager.js';
export type { Task, TaskContext, TaskState as TaskStateType, TaskEvent, TaskEventType } from './04-tasks/types.js';

// 桥接层
export { createBridge } from './05-bridge/Bridge.js';
export type { Bridge, BridgeConfig, Session, BridgeMessage } from './05-bridge/types.js';

// 编排层
export { App, createApp } from './06-orchestrator/App.js';
export type { AppConfig, SubmitResult } from './06-orchestrator/types.js';
