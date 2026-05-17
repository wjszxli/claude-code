import { createStateStore } from "./state";
import { findToolByName, ToolResult, Tools, ToolUseContext } from "./tool";
import { PermissionContext, PermissionDecision } from "./types";

export type ExecutionContext = {
  /** 工具注册表 */
  tools: Tools;
  /** 权限上下文 */
  permissionContext: PermissionContext;
  /** 状态 Store */
  store: ReturnType<typeof createStateStore>;
  /** 中断控制器 */
  abortController: AbortController;
  /** 消息列表 (可变引用) */
  messages: unknown[];
};

/** 执行结果 */
export type ExecutionResult = {
  success: boolean;
  toolName: string;
  result?: ToolResult;
  error?: string;
  permissionDecision?: PermissionDecision;
};

export async function executeToolCall(
  toolName: string,
  input: Record<string, unknown>,
  ctx: ExecutionContext,
): Promise<ExecutionResult> {
  // Step 1: 查找工具
  const tool = findToolByName(ctx.tools, toolName);
  if (!tool) {
    return {
      success: false,
      toolName,
      error: `Tool not found ${toolName}`,
    };
  }

  // Step 2: 输入验证
  if (tool.validateInput) {
    const validation = await tool.validateInput(
      input,
      createToolUseContext(ctx),
    );

    if (validation.result === false) {
      return {
        success: false,
        toolName,
        error: validation.message,
      };
    }
  }

  // Step 3: 权限检查
}

function createToolUseContext(ctx: ExecutionContext): ToolUseContext {
  return {
    abortController: ctx.abortController,
    getAppState: () => ctx.store.getState(),
    setAppState: (updater) => ctx.store.setState(updater),
    messages: ctx.messages,
    debug: false,
  };
}
