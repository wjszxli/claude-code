/** 权限模式
 *  default: 标准模式，敏感操作需确认
 *  auto:    自动批准安全操作
 *  plan:    计划模式，受限执行
 *  bypass:  跳过所有权限检查
 */
export type PermissionMode = "default" | "auto" | "plan" | "bypass";

/** 权限行为 — 三态决策 */
export type PermissionBehavior = "allow" | "deny" | "ask";

/** 权限规则来源 */
export type PermissionRuleSource =
  | "userSettings" // 用户全局设置 (~/.claude/settings.json)
  | "projectSettings" // 项目设置 (.claude/settings.json)
  | "localSettings" // 本地设置 (.claude/settings.local.json)
  | "session"; // 会话级临时规则

/** 权限规则 — 匹配工具名 + 可选的内容模式 */
export type PermissionRule = {
  source: PermissionRuleSource;
  behavior: PermissionBehavior;
  toolName: string;
  ruleContent?: string; // e.g. "git *" 表示匹配 git 开头的命令
};

/** 用户消息 */
export type UserMessage = {
  role: "user";
  content: string;
  timestamp: number;
};

/** 权限上下文 — 传入工具权限检查的完整上下文 */
export type PermissionContext = {
  mode: PermissionMode;
};

export type AssistantMessage = {
  role: "assistant";
  content: AssistantContent[];
  timestamp: number;
  // TODO: 这里为什么要 model
  model?: string;
};

/** 助手消息内容块 — 区分文本输出和工具调用 */
export type AssistantContent =
  | { type: "text"; text: string }
  | {
      type: "tool_use";
      id: string;
      name: string;
      input: Record<string, unknown>;
    };

export type ToolResultMessage = {
  role: "tool_result";
  toolUseId: string;
  content: string;
  isError: boolean;
};

/** 系统消息 */
export type SystemMessage = {
  role: "system";
  content: string;
  timestamp: number;
};

export type Message =
  | UserMessage
  | AssistantMessage
  | SystemMessage
  | ToolResultMessage;

export type TaskType =
  | "local_bash" // 本地 shell 命令
  | "local_agent" // 本地子代理
  | "remote_agent" // 远程代理
  | "dream"; // 后台推理任务

/** 任务状态 — 线性状态机 */
export type TaskStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "killed";

/** 任务状态快照 */
export type TaskState = {
  id: string;
  type: TaskType;
  status: TaskStatus;
  description: string;
  startTime: number;
  endTime?: number;
};

export type PermissionDecision<Input = Record<string, unknown>> =
  | { behavior: "allow"; updatedInput?: Input }
  | { behavior: "deny"; message: string }
  | { behavior: "ask"; message: string; updatedInput?: Input };
