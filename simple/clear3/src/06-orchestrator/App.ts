/**
 * App —— 全系统编排器 (System Orchestrator)
 * ============================================================================
 * 设计思想：
 * 这是简化版中最关键的"串联者"。它将之前所有分散的模块按以下数据流组合：
 *
 *   用户输入
 *      │
 *      ▼
 *   [Slash Command Interceptor] ──是命令──► 执行 Command → 返回 messages
 *      │ 不是命令
 *      ▼
 *   [QueryEngine] ──► 调用模型 → 得到 assistant message
 *      │
 *      ▼ 包含 tool_use
 *   [Tool Execution] ──► 权限检查 → 工具调用 → 更新 AppState → 生成 tool_result
 *      │
 *      ▼ tool_result 回注
 *   [QueryEngine Follow-up] ──► 再次调用模型
 *      │
 *      ▼
 *   返回最终响应给调用方
 *
 * 核心职责：
 * 1. 管理全局 AppState（通过 Store）。
 * 2. 协调命令层、引擎层、工具层、任务层的交互。
 * 3. 将 QueryEngine 的 EngineMessage 同步到 AppState.messages，
 *    使得 UI 层或外部观察者只需要订阅 Store 即可看到完整对话历史。
 * ============================================================================
 */

import { createStore, type Store } from '../00-core/store.js';
import { getDefaultAppState, type AppState, type Message } from '../00-core/types.js';
import { registerCommand, processSlashCommand } from '../01-commands/index.js';
import { QueryEngine } from '../02-engine/QueryEngine.js';
import type { EngineMessage } from '../02-engine/types.js';
import { registerTool } from '../03-tools/registry.js';
import type { Tool, ToolUseContext } from '../03-tools/types.js';
import { TaskManager } from '../04-tasks/TaskManager.js';
import { createBridge, type Bridge } from '../05-bridge/Bridge.js';
import type { AppConfig, SubmitResult } from './types.js';

export class App {
  readonly store: Store<AppState>;
  readonly engine: QueryEngine;
  readonly taskManager: TaskManager;
  readonly bridge: Bridge;

  constructor(config: AppConfig = {}) {
    // 1. 初始化状态层
    this.store = createStore(config.initialState ?? getDefaultAppState());

    // 2. 初始化对话引擎
    this.engine = new QueryEngine({ maxTurns: 10, timeout: 30000 });
    if (config.systemPrompt) {
      this.engine.setSystemPrompt(config.systemPrompt);
    }

    // 3. 注册命令
    config.commands?.forEach((cmd) => registerCommand(cmd));

    // 4. 注册工具
    config.tools?.forEach((tool) => {
      registerTool(tool);
      this.engine.registerTool(tool);
    });

    // 5. 初始化任务管理器和桥接器
    this.taskManager = new TaskManager();
    this.bridge = createBridge({ id: 'local-bridge', maxSessions: 5, dir: '/tmp/bridge' });
  }

  /**
   * 提交用户输入，执行完整对话流程。
   * 这是外部调用方（如 REPL、CLI、Bridge）与系统交互的唯一入口。
   */
  async submitUserInput(input: string): Promise<SubmitResult> {
    const state = this.store.getState();

    // ── Step 1: Slash 命令拦截 ─────────────────────────────────────────────
    const slashResult = await processSlashCommand(input, {
      permissionContext: state.permissionContext,
      cwd: '/',
    });

    if (slashResult) {
      if (slashResult.result.type === 'messages') {
        // 将命令产生的系统消息注入状态
        this.appendMessages(slashResult.result.messages);
      }
      return {
        responseText: `[Command: /${slashResult.commandName}]`,
        hadToolCalls: false,
        messageCount: this.store.getState().messages.length,
        taskCount: Object.keys(this.store.getState().tasks).length,
      };
    }

    // ── Step 2: 普通用户消息进入 QueryEngine ───────────────────────────────
    this.appendMessages([
      { id: `msg-${Date.now()}`, source: 'user', content: input, timestamp: Date.now() },
    ]);

    const toolContext = this.createToolContext();
    const response = await this.engine.query(input, toolContext, { allowToolErrors: true });

    // 将 Engine 历史同步到 AppState
    this.syncEngineHistoryToState();

    // ── Step 3: 判断是否有工具调用 ──────────────────────────────────────────
    const hadToolCalls = response.stopReason === 'tool_use';

    return {
      responseText: response.message.content,
      hadToolCalls,
      messageCount: this.store.getState().messages.length,
      taskCount: Object.keys(this.store.getState().tasks).length,
    };
  }

  /**
   * 注册动态工具（如 MCP 工具在运行时连接后动态注入）。
   */
  registerDynamicTool(tool: Tool<any, any>): void {
    registerTool(tool);
    this.engine.registerTool(tool);
  }

  /**
   * 设置权限模式。
   */
  setPermissionMode(mode: AppState['permissionContext']['mode']): void {
    this.store.setState((state) => ({
      ...state,
      permissionContext: { ...state.permissionContext, mode },
    }));
  }

  // ── 私有辅助方法 ─────────────────────────────────────────────────────────

  private createToolContext(): ToolUseContext {
    return {
      getAppState: () => this.store.getState(),
      setAppState: (updater) => this.store.setState(updater),
      permissionContext: this.store.getState().permissionContext,
      abortController: new AbortController(),
    };
  }

  private appendMessages(msgs: Message[]): void {
    if (msgs.length === 0) return;
    this.store.setState((state) => ({
      ...state,
      messages: [...state.messages, ...msgs],
    }));
  }

  private syncEngineHistoryToState(): void {
    const history = this.engine.getHistory();
    // 将 EngineMessage 转换为 AppState Message
    const mapped: Message[] = history.map((h, idx) => ({
      id: `engine-${idx}`,
      source: this.mapRoleToSource(h.role),
      content: h.content,
      timestamp: h.timestamp,
      toolUseId: h.toolUseId,
    }));
    this.store.setState((state) => ({
      ...state,
      messages: mapped,
    }));
  }

  private mapRoleToSource(role: EngineMessage['role']): Message['source'] {
    switch (role) {
      case 'user':
        return 'user';
      case 'assistant':
        return 'assistant';
      case 'system':
        return 'system';
      case 'tool':
        return 'tool';
    }
  }
}

/**
 * 工厂函数：创建并配置一个完整的 App 实例。
 */
export function createApp(config?: AppConfig): App {
  return new App(config);
}
