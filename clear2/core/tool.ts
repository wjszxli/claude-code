import type { z } from "zod/v4";
import { AppState } from "./state";
import { PermissionDecision } from "./types";

export type AnySchema = z.ZodType<Record<string, unknown>>;

/** 工具执行上下文 — 提供给每个工具 call() 的运行环境 */
export type ToolUseContext = {
  /** 中断信号 */
  abortController: AbortController;
  /** 读取当前全局状态 */
  getAppState(): AppState;
  /** 不可变更新全局状态 */
  setAppState(updater: (prev: AppState) => AppState): void;
  /** 当前对话消息列表 */
  messages: unknown[];
  /** 调试模式 */
  debug: boolean;
};

// ────────────────────────────────────────────
// 4. Tool Result Types
// ────────────────────────────────────────────

/** 工具执行结果 */
export type ToolResult<T = unknown> = {
  data: T;
  error?: string;
};

/**
 * Tool<Input, Output> — 工具接口
 *
 * 这是 Claude Code 工具系统的核心抽象。
 * 每个工具必须实现:
 *   - name + inputSchema: 身份和输入验证
 *   - call(): 核心执行逻辑
 *   - description(): 人类可读的描述
 *   - prompt(): 发送给 LLM 的系统提示
 *
 * 可选实现:
 *   - checkPermissions(): 工具级权限逻辑
 *   - isReadOnly(): 是否只读
 *   - isConcurrencySafe(): 是否可并发
 *   - validateInput(): 输入验证 (在权限检查前)
 */
export type Tool<Input extends AnySchema = AnySchema, Output = unknown> = {
  /** 工具名称 — 全局唯一标识 */
  readonly name: string;

  /** 输入 schema — Zod schema，用于验证和类型推断 */
  readonly inputSchema: Input;

  /** 工具结果最大字符数，超过则持久化到磁盘 */
  readonly maxResultSizeChars: number;

  // ── 核心方法 ──

  /** 执行工具 */
  call(
    input: z.infer<Input>,
    context: ToolUseContext,
  ): Promise<ToolResult<Output>>;

  /** 返回用户可见的描述文本 */
  description(input: z.infer<Input>): Promise<string>;

  /** 返回给 LLM 的系统提示 — 描述工具如何使用 */
  prompt(): Promise<string>;

  /** 用户可见名称 */
  userFacingName(input: Partial<z.infer<Input>> | undefined): string;

  // ── 权限 & 安全 ──
  checkPermissions(
    input: z.infer<Input>,
    context: ToolUseContext,
  ): Promise<PermissionDecision>;

  /** 是否只读操作 */
  isReadOnly(input: z.infer<Input>): boolean;

  /** 是否可并发执行 */
  isConcurrencySafe(input: z.infer<Input>): boolean;

  /** 是否为破坏性操作 */
  isDestructive(input: z.infer<Input>): boolean;

  /** 是否启用 (支持 feature flag) */
  isEnabled(): boolean;

  // ── 输入验证 ──

  /** 输入验证 — 在权限检查前调用，返回 true 或错误信息 */
  validateInput?(
    input: z.infer<Input>,
    context: ToolUseContext,
  ): Promise<{ result: true } | { result: false; message: string }>;

  // -- 路径提取 --

  /** 提取工具操作的文件路径 (用于权限规则匹配) */
  getPath?(input: z.infer<Input>): string;

  // ── UI 相关 ──

  /** 用户中断行为: cancel=中断执行, block=继续等待 */
  interruptBehavior(): "cancel" | "block";

  /** 搜索/读操作标记 (UI 折叠用) */
  isSearchOrReadCommand?(input: z.infer<Input>): {
    isSearch: boolean;
    isRead: boolean;
    isList?: boolean;
  };
};

/** 工具集合类型 */
export type Tools = readonly Tool[];

/** 可选方法 key — ToolDef 中这些方法可以省略 */
type DefaultableKeys =
  | "isEnabled"
  | "isConcurrencySafe"
  | "isReadOnly"
  | "isDestructive"
  | "checkPermissions"
  | "userFacingName"
  | "interruptBehavior";

/**
 * ToolDef — 工具定义 (允许省略有默认值的方法)
 *
 * 开发者只需要实现 name, inputSchema, call, description, prompt
 * 其他方法有安全默认值
 */
export type ToolDef<
  Input extends AnySchema = AnySchema,
  Output = unknown,
> = Omit<Tool<Input, Output>, DefaultableKeys> &
  Partial<Pick<Tool<Input, Output>, DefaultableKeys>>;

/** 安全默认值 */
const TOOL_DEFAULTS = {
  isEnabled: () => true,
  isConcurrencySafe: (_input?: unknown) => false,
  isReadOnly: (_input?: number) => false,
  isDestructive: (_input?: unknown) => false,
  checkPermissions: async (input: Record<string, unknown>) => ({
    behavior: "allow" as const,
    updatedInput: input,
  }),
  userFacingName: function (this: { name: string }, _input?: unknown) {
    return this.name;
  },
  interruptBehavior: () => "block" as const,
};

/**
 * buildTool(def) → Tool
 *
 * 用法:
 *   export const MyTool = buildTool({
 *     name: 'my_tool',
 *     inputSchema: z.object({ path: z.string() }),
 *     maxResultSizeChars: 100_000,
 *     call: async (input, ctx) => ({ data: readFile(input.path) }),
 *     description: async (input) => `Reading ${input.path}`,
 *     prompt: async () => 'Read a file from disk',
 *   })
 */
export function buildTool<
  Input extends AnySchema = AnySchema,
  Output = unknown,
>(def: ToolDef<Input, Output>): Tool<Input, Output> {
  return {
    ...TOOL_DEFAULTS,
    userFacingName: () => def.name,
    ...def,
  } as Tool<Input, Output>;
}

// ────────────────────────────────────────────
// 工具查找辅助
// ────────────────────────────────────────────

/** 按名称查找工具 */
export function findToolByName(tools: Tools, name: string): Tool | undefined {
  return tools.find((t) => t.name === name);
}
