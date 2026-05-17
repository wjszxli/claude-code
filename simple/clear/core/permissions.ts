/**
 * 权限系统 — 三层权限检查
 * 简化自 src/utils/permissions/ (原文件 61KB+)
 *
 * 检查流程 (对应源码中的 checkToolPermission):
 *
 *   ┌──────────────────────────────────────────────────────────┐
 *   │  1. bypass 模式?  → 直接 allow                          │
 *   │  2. 全局拒绝规则匹配?  → deny                            │
 *   │  3. 全局允许规则匹配?  → allow                           │
 *   │  4. 工具自检 (checkPermissions)  → 工具级决策            │
 *   │  5. 默认: 按 mode 决定                                   │
 *   │     auto → allow (只读) / ask (写操作)                   │
 *   │     default → ask                                       │
 *   └──────────────────────────────────────────────────────────┘
 */

import type {
  PermissionContext,
  PermissionDecision,
  PermissionRule,
  PermissionBehavior,
} from './types.js'
import type { Tool, ToolUseContext, AnySchema } from './tool.js'

// ────────────────────────────────────────────
// Rule Matching — 规则匹配
// ────────────────────────────────────────────

/**
 * 规则匹配 — 支持通配符
 *
 * 匹配规则:
 *   "Bash"        → 精确匹配工具名
 *   "Bash(git *)" → 匹配工具名 + 命令模式 (glob)
 *   "mcp__server" → 匹配 MCP 服务器前缀
 */
export function ruleMatchesTool(
  rule: PermissionRule,
  toolName: string,
  toolInput?: Record<string, unknown>,
): boolean {
  if (rule.toolName !== toolName) {
    // 检查前缀匹配 (MCP 工具: mcp__serverName__toolName)
    if (!toolName.startsWith(rule.toolName)) return false
  }

  // 无内容规则 → 匹配整个工具
  if (!rule.ruleContent) return true

  // 有内容规则 → 匹配工具输入
  if (!toolInput) return false
  return matchRuleContent(rule.ruleContent, toolInput)
}

/**
 * 规则内容匹配 — 简化版 glob
 *
 * "git *"     → 匹配以 "git " 开头的输入
 * "rm -rf *"  → 匹配以 "rm -rf " 开头的输入
 */
function matchRuleContent(
  pattern: string,
  input: Record<string, unknown>,
): boolean {
  // 尝试匹配 Bash 工具的 command 字段
  const command = input.command as string | undefined
  if (command) {
    return globMatch(pattern, command)
  }

  // 尝试匹配文件路径
  const path = (input.file_path || input.path) as string | undefined
  if (path) {
    return globMatch(pattern, path)
  }

  return false
}

/** 简化版 glob 匹配 (仅支持尾部 *) */
function globMatch(pattern: string, text: string): boolean {
  if (pattern.endsWith('*')) {
    return text.startsWith(pattern.slice(0, -1))
  }
  return pattern === text
}

// ────────────────────────────────────────────
// Permission Check — 权限检查主流程
// ────────────────────────────────────────────

/**
 * 查找匹配的规则并返回行为
 * 按优先级: deny > allow > ask
 */
function findMatchingBehavior(
  rules: PermissionRule[],
  toolName: string,
  toolInput?: Record<string, unknown>,
): PermissionBehavior | null {
  for (const rule of rules) {
    if (ruleMatchesTool(rule, toolName, toolInput)) {
      return rule.behavior
    }
  }
  return null
}

/**
 * checkPermission — 权限检查入口
 *
 * 对应源码 src/utils/permissions/permissions.ts 中的核心逻辑
 */
export async function checkPermission(
  tool: Tool,
  input: Record<string, unknown>,
  context: PermissionContext,
  toolContext: ToolUseContext,
): Promise<PermissionDecision> {
  // Layer 0: bypass 模式
  if (context.mode === 'bypass') {
    return { behavior: 'allow', updatedInput: input }
  }

  const toolName = tool.name

  // Layer 1: 全局拒绝规则 (最高优先级)
  const denyBehavior = findMatchingBehavior(
    context.alwaysDenyRules, toolName, input,
  )
  if (denyBehavior === 'deny') {
    return { behavior: 'deny', message: `Blocked by deny rule for ${toolName}` }
  }

  // Layer 2: 全局允许规则
  const allowBehavior = findMatchingBehavior(
    context.alwaysAllowRules, toolName, input,
  )
  if (allowBehavior === 'allow') {
    return { behavior: 'allow', updatedInput: input }
  }

  // Layer 3: 全局询问规则
  const askBehavior = findMatchingBehavior(
    context.alwaysAskRules, toolName, input,
  )
  if (askBehavior === 'ask') {
    return { behavior: 'ask', message: `Rule requires confirmation for ${toolName}` }
  }

  // Layer 4: 工具自身权限检查
  const toolDecision = await tool.checkPermissions(input, toolContext)
  if (toolDecision.behavior !== 'allow') {
    return toolDecision
  }

  // Layer 5: 根据模式决定默认行为
  if (context.mode === 'auto') {
    // auto 模式: 只读操作自动允许，写操作需要确认
    if (tool.isReadOnly(input)) {
      return { behavior: 'allow', updatedInput: input }
    }
    return { behavior: 'ask', message: `${toolName} requires confirmation (write operation)` }
  }

  // default 模式: 询问用户
  return { behavior: 'ask', message: `Allow ${toolName} to execute?` }
}

// ────────────────────────────────────────────
// Permission Context Builder
// ────────────────────────────────────────────

/** 创建默认权限上下文 */
export function createPermissionContext(
  mode: PermissionContext['mode'] = 'default',
  overrides?: Partial<PermissionContext>,
): PermissionContext {
  return {
    mode,
    alwaysAllowRules: [],
    alwaysDenyRules: [],
    alwaysAskRules: [],
    ...overrides,
  }
}

/** 从设置构建权限上下文 */
export function buildPermissionContext(
  settings: { permissionMode: string },
  rules: {
    allow?: PermissionRule[]
    deny?: PermissionRule[]
    ask?: PermissionRule[]
  } = {},
): PermissionContext {
  return {
    mode: settings.permissionMode as PermissionContext['mode'],
    alwaysAllowRules: rules.allow ?? [],
    alwaysDenyRules: rules.deny ?? [],
    alwaysAskRules: rules.ask ?? [],
  }
}
