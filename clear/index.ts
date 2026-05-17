/**
 * CLI 入口 — 演示 Claude Code 架构的所有核心模块
 *
 * 每个命令驱动对应子系统，体现其设计模式:
 *
 *   echo       → Tool Pattern: buildTool → call → ToolResult
 *   tools      → Registry Pattern: getAllBaseTools → assembleToolPool
 *   state      → State Pattern: createStore → setState → selectors
 *   permission → Permission Pattern: 5 层权限检查决策漏斗
 *   execute    → Executor Pattern: validate → permission → call → updateState
 *   query      → Engine Pattern: user → API → tool_use → loop
 *   agents     → Agent Pattern: sub-agent 上下文派生 + 工具过滤
 *   task       → Task Pattern: 生命周期 pending → running → completed
 *   mcp        → MCP Pattern: connect → discover → convert → use
 *   skill      → Skill Pattern: frontmatter → parse → register → activate
 *
 * 用法:
 *   bun run clear/index.ts <command> [args...]
 */

import { EchoTool } from './tools/echo.js'
import { BashTool } from './tools/bash.js'
import { getAllBaseTools, assembleToolPool } from './tools/index.js'
import { buildTool, findToolByName } from './core/tool.js'
import { createStateStore, selectors, updaters } from './core/state.js'
import { checkPermission, createPermissionContext, buildPermissionContext } from './core/permissions.js'
import { createExecutionContext, executeToolCall, executeToolCalls } from './core/executor.js'
import { runQuery, createMockAPIClient, compressMessages } from './query/engine.js'
import { findAgentDefinition, getAllAgents, createSubagentContext, BUILT_IN_AGENTS } from './agent/agent.js'
import { registerTask, startTask, completeTask, failTask, getActiveTasks, getTasksByType } from './task/task.js'
import { McpClient, mcpToolToTool } from './mcp/mcp.js'
import { parseFrontmatter, createSkillFromMarkdown, SkillRegistry } from './skills/loader.js'
import { z } from 'zod/v4'

// ────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────

function header(title: string): void {
  console.log(`\n${'─'.repeat(60)}`)
  console.log(`  ${title}`)
  console.log('─'.repeat(60))
}

function section(title: string): void {
  console.log(`\n▸ ${title}`)
}

function kv(key: string, value: unknown): void {
  console.log(`  ${key}: ${JSON.stringify(value)}`)
}

function createToolUseContext() {
  const store = createStateStore()
  return {
    abortController: new AbortController(),
    getAppState: () => store.getState(),
    setAppState: (u: Parameters<typeof store.setState>[0]) => store.setState(u),
    messages: [] as unknown[],
    debug: false,
  }
}

// ────────────────────────────────────────────
// 1. echo — Tool Pattern
// ────────────────────────────────────────────

async function handleEcho(args: string[]): Promise<void> {
  const message = args[0] ?? ''

  if (!message) {
    console.error('Error: message is required')
    console.log('Usage: bun run clear/index.ts echo "your message"')
    process.exit(1)
  }

  header('Tool Pattern: buildTool → call → ToolResult')
  section('Input')
  kv('message', message)

  section('buildTool 工厂')
  console.log(`  name: ${EchoTool.name}`)
  console.log(`  isReadOnly: ${EchoTool.isReadOnly({ message })}`)
  console.log(`  isConcurrencySafe: ${EchoTool.isConcurrencySafe({ message })}`)
  console.log(`  interruptBehavior: ${EchoTool.interruptBehavior()}`)

  const ctx = createToolUseContext()
  const desc = await EchoTool.description({ message })
  section('description (用户可见)')
  console.log(`  ${desc}`)

  section('call → ToolResult')
  const result = await EchoTool.call({ message }, ctx)
  kv('data', result.data)
  if (result.error) kv('error', result.error)

  section('设计要点')
  console.log('  - Tool<Input, Output> 接口定义完整契约')
  console.log('  - buildTool(ToolDef) 填充安全默认值')
  console.log('  - 工具自描述: description(), prompt(), isReadOnly()')
}

// ────────────────────────────────────────────
// 2. tools — Registry Pattern
// ────────────────────────────────────────────

async function handleTools(args: string[]): Promise<void> {
  const verbose = args[0] === '-v' || args[0] === '--verbose'
  const builtIn = getAllBaseTools()

  header('Registry Pattern: getAllBaseTools → assembleToolPool')
  const sampleInputs: Record<string, Record<string, unknown>> = {
    Bash: { command: 'git status' },
    Read: { file_path: '/tmp/test.txt' },
    Edit: { file_path: '/tmp/test.txt', old_string: 'a', new_string: 'b' },
    Write: { file_path: '/tmp/test.txt', content: 'hello' },
    Glob: { pattern: '*.ts' },
    Grep: { pattern: 'TODO' },
    echo: { message: 'test' },
  }

  section('内置工具')
  for (const tool of builtIn) {
    const sample = sampleInputs[tool.name] ?? {}
    const desc = await tool.description(sample as any)
    const ro = tool.isReadOnly(sample as any)
    const safe = tool.isConcurrencySafe(sample as any)
    const interrupt = tool.interruptBehavior()
    console.log(`  ${tool.name.padEnd(8)} readOnly=${String(ro).padEnd(5)} safe=${String(safe).padEnd(5)} interrupt=${interrupt}`)
    if (verbose) {
      console.log(`           desc: ${desc}`)
    }
  }

  section('assembleToolPool — 内置 + MCP 合并')
  const mockMcpTool = buildTool({
    name: 'mcp__search__web',
    maxResultSizeChars: 50_000,
    inputSchema: z.object({ q: z.string() }),
    call: async (input) => ({ data: `[search: ${input.q}]` }),
    description: async () => 'Search the web',
    prompt: async () => 'Search',
    isReadOnly: () => true,
    isConcurrencySafe: () => true,
  })

  const pool = assembleToolPool(builtIn, [mockMcpTool])
  console.log(`  合并后: ${pool.length} tools (${builtIn.length} built-in + 1 MCP)`)

  section('denyList 过滤')
  const filtered = assembleToolPool(builtIn, [], ['Bash', 'Write'])
  console.log(`  过滤 Bash,Write 后: ${filtered.length} tools`)
  console.log(`  ${filtered.map(t => t.name).join(', ')}`)

  section('设计要点')
  console.log('  - 内置工具优先 (同名覆盖 MCP)')
  console.log('  - denyList 黑名单过滤')
  console.log('  - 按名称排序保证缓存稳定性')
}

// ────────────────────────────────────────────
// 3. state — State Pattern
// ────────────────────────────────────────────

function handleState(): void {
  header('State Pattern: createStore → setState → selectors')

  const store = createStateStore()

  section('初始状态')
  const initial = store.getState()
  kv('model', initial.settings.model)
  kv('permissionMode', initial.settings.permissionMode)
  kv('messages', `${initial.messages.length} 条`)
  kv('tasks', `${Object.keys(initial.tasks).length} 个`)

  section('subscribe — 订阅状态变化')
  let changeCount = 0
  const unsubscribe = store.subscribe(() => {
    changeCount++
    console.log(`  [notify #${changeCount}] state changed`)
  })

  section('updaters — 不可变更新')
  store.setState(updaters.setModel('claude-opus-4-20250514'))
  store.setState(updaters.appendMessage({
    role: 'user',
    content: 'Hello',
    timestamp: Date.now(),
  }))
  store.setState(updaters.appendMessage({
    role: 'assistant',
    content: [{ type: 'text', text: 'Hi there' }],
    timestamp: Date.now(),
  }))
  store.setState(updaters.registerTask({
    id: 'b_test0001',
    type: 'local_bash',
    status: 'pending',
    description: 'npm test',
    startTime: Date.now(),
  }))

  section('selectors — 状态查询')
  const state = store.getState()
  kv('getModel', selectors.getModel(state))
  kv('getMessages', `${selectors.getMessages(state).length} 条`)
  kv('getActiveTasks', `${selectors.getActiveTasks(state).length} 个`)
  kv('isStreaming', selectors.isStreaming(state))

  section('updaters — 任务状态推进')
  store.setState(updaters.updateTaskStatus('b_test0001', 'running'))
  store.setState(updaters.updateTaskStatus('b_test0001', 'completed', Date.now()))
  kv('completed tasks', Object.keys(store.getState().tasks).length)

  unsubscribe()

  section('设计要点')
  console.log('  - 单一 AppState: 唯一真相源')
  console.log('  - 不可变更新: setState(updater) 创建新引用')
  console.log('  - selectors: 纯函数查询状态切片')
  console.log('  - subscribe: 发布-订阅通知 UI')
}

// ────────────────────────────────────────────
// 4. permission — Permission Pattern
// ────────────────────────────────────────────

async function handlePermission(args: string[]): Promise<void> {
  const toolName = args[0] ?? 'Bash'
  const toolInput = args[1] ? JSON.parse(args[1]) : { command: 'git status' }

  header('Permission Pattern: 5 层权限决策漏斗')

  const tools = getAllBaseTools()
  const tool = findToolByName(tools, toolName)
  if (!tool) {
    console.error(`Tool not found: ${toolName}`)
    process.exit(1)
  }

  const ctx = createToolUseContext()

  section(`目标: ${toolName}(${JSON.stringify(toolInput)})`)
  console.log(`  isReadOnly: ${tool.isReadOnly(toolInput)}`)

  const modes = ['bypass', 'auto', 'default'] as const

  for (const mode of modes) {
    const permCtx = createPermissionContext(mode, {
      alwaysDenyRules: [{
        source: 'userSettings',
        behavior: 'deny',
        toolName: 'Bash',
        ruleContent: 'rm -rf *',
      }],
      alwaysAllowRules: [{
        source: 'projectSettings',
        behavior: 'allow',
        toolName: 'Bash',
        ruleContent: 'git *',
      }],
    })

    const decision = await checkPermission(tool, toolInput, permCtx, ctx)
    section(`mode=${mode}`)
    kv('behavior', decision.behavior)
    if (decision.behavior === 'deny') kv('reason', (decision as any).message)
  }

  section('检查流程')
  console.log('  Layer 0: bypass → 直接 allow')
  console.log('  Layer 1: alwaysDenyRules → deny (最高优先)')
  console.log('  Layer 2: alwaysAllowRules → allow')
  console.log('  Layer 3: alwaysAskRules → ask')
  console.log('  Layer 4: tool.checkPermissions() → 工具级决策')
  console.log('  Layer 5: mode 默认行为 (auto=readOnly allow / default=ask)')

  section('buildPermissionContext — 从设置构建')
  const ctx2 = buildPermissionContext(
    { permissionMode: 'auto' },
    {
      allow: [{ source: 'userSettings', behavior: 'allow', toolName: 'Read' }],
      deny: [{ source: 'localSettings', behavior: 'deny', toolName: 'Write' }],
    },
  )
  kv('mode', ctx2.mode)
  kv('allowRules', `${ctx2.alwaysAllowRules.length} 条`)
  kv('denyRules', `${ctx2.alwaysDenyRules.length} 条`)
}

// ────────────────────────────────────────────
// 5. execute — Executor Pattern
// ────────────────────────────────────────────

async function handleExecute(args: string[]): Promise<void> {
  const toolName = args[0] ?? 'echo'
  const inputJson = args[1] ?? '{"message":"hello"}'

  header('Executor Pattern: validate → permission → call → updateState')

  section('准备执行上下文')
  const tools = getAllBaseTools()
  const permCtx = createPermissionContext('auto')
  const execCtx = createExecutionContext(tools, permCtx)
  console.log(`  tools: ${tools.length} 个`)
  console.log(`  permissionMode: ${permCtx.mode}`)

  const input = JSON.parse(inputJson)
  section(`Step 1: validate + permission + call`)
  console.log(`  tool: ${toolName}`)
  kv('input', input)

  const result = await executeToolCall(toolName, input, execCtx)

  section('Step 2: 结果')
  kv('success', result.success)
  if (result.result) kv('data', result.result.data)
  if (result.error) kv('error', result.error)
  if (result.permissionDecision) kv('permission', result.permissionDecision.behavior)

  section('Step 3: 状态已更新')
  const state = execCtx.store.getState()
  kv('messages after execute', `${state.messages.length} 条`)

  section('批量执行 — 并发策略')
  const calls = [
    { name: 'echo', input: { message: 'task-1' } },
    { name: 'echo', input: { message: 'task-2' } },
  ]
  console.log(`  提交 ${calls.length} 个调用 (echo isConcurrencySafe=true → 并行)`)

  const batch = await executeToolCalls(calls, execCtx)
  kv('allSucceeded', batch.allSucceeded)
  kv('results', batch.results.map(r => `${r.toolName}=${r.success}`))
  kv('durationMs', batch.durationMs)
}

// ────────────────────────────────────────────
// 6. query — Engine Pattern
// ────────────────────────────────────────────

async function handleQuery(args: string[]): Promise<void> {
  const message = args[0] ?? 'Run echo hello, then tell me done'

  header('Engine Pattern: user → API → tool_use → execute → loop')

  const EchoQueryTool = buildTool({
    name: 'echo',
    maxResultSizeChars: 1000,
    inputSchema: z.object({ message: z.string() }),
    call: async (input) => ({ data: input.message }),
    description: async () => 'Echo',
    prompt: async () => 'Echo the input',
    isConcurrencySafe: () => true,
  })

  // 模拟一个两轮对话: 第 1 轮 tool_use, 第 2 轮 end_turn
  let callCount = 0
  const api = createMockAPIClient(() => {
    callCount++
    if (callCount === 1) {
      section(`Turn ${callCount}: API 返回 tool_use`)
      console.log('  stopReason=tool_use → 需要执行工具')
      return [{ type: 'tool_use' as const, id: 'tu_1', name: 'echo', input: { message: 'hello from engine' } }]
    }
    section(`Turn ${callCount}: API 返回 end_turn`)
    console.log('  stopReason=end_turn → 最终响应')
    return [{ type: 'text' as const, text: 'All done. The echo returned "hello from engine".' }]
  })

  section('查询请求')
  kv('message', message)

  const execCtx = createExecutionContext([EchoQueryTool])
  const result = await runQuery(
    {
      message,
      systemPrompt: 'You are a helpful assistant.',
      tools: [EchoQueryTool],
      maxTurns: 5,
    },
    api,
    execCtx,
  )

  section('查询结果')
  kv('turns', result.turns)
  kv('durationMs', result.durationMs)
  kv('inputTokens', result.totalUsage.inputTokens)
  kv('outputTokens', result.totalUsage.outputTokens)
  kv('finalMessage', result.message.content)

  section('消息历史')
  for (const msg of result.messages) {
    const role = (msg as any).role
    if (role === 'user') console.log(`  [user] ${(msg as any).content}`)
    else if (role === 'assistant') console.log(`  [assistant] ${JSON.stringify((msg as any).content)}`)
    else if (role === 'tool_result') console.log(`  [tool_result] ${(msg as any).content}`)
  }

  section('上下文压缩')
  const manyMsgs = Array.from({ length: 30 }, (_, i) => ({
    role: 'user' as const,
    content: `message ${i}`,
    timestamp: Date.now(),
  }))
  const compressed = compressMessages(manyMsgs, 20)
  kv('before', `${manyMsgs.length} 条`)
  kv('after', `${compressed.messages.length} 条`)
  kv('wasCompressed', compressed.wasCompressed)
}

// ────────────────────────────────────────────
// 7. agents — Agent Pattern
// ────────────────────────────────────────────

async function handleAgents(args: string[]): Promise<void> {
  const agentType = args[0]

  header('Agent Pattern: sub-agent 上下文派生 + 工具过滤')

  section('内置代理')
  for (const agent of BUILT_IN_AGENTS) {
    console.log(`  ${agent.type.padEnd(18)} model=${agent.model ?? 'inherit'}  ${agent.description}`)
  }

  if (agentType) {
    section(`查找代理: ${agentType}`)
    const found = findAgentDefinition(agentType)
    kv('type', found.type)
    kv('displayName', found.displayName)
    kv('model', found.model ?? 'inherit')
    kv('allowedTools', found.allowedTools ?? '(all)')
    kv('prompt', found.prompt.slice(0, 80) + '...')

    const allTools = getAllBaseTools()
    section('创建子代理上下文')
    const parentCtx = createToolUseContext()
    const subCtx = createSubagentContext(parentCtx, found, allTools)

    kv('filtered tools', `${subCtx.tools.length}/${allTools.length}`)
    console.log(`  tools: ${subCtx.tools.map(t => t.name).join(', ')}`)
    kv('permissionMode', subCtx.permissionContext.mode)
    console.log('  (降级为 auto — 子代理不能弹权限弹窗)')
  }

  section('自定义代理')
  const custom = getAllAgents([{
    type: 'reviewer',
    displayName: 'Code Reviewer',
    description: 'Reviews code for quality',
    allowedTools: ['Read', 'Grep', 'Glob'],
    prompt: 'You review code.',
  }])
  console.log(`  全部代理: ${custom.map(a => a.type).join(', ')}`)

  section('设计要点')
  console.log('  - Agent = 带独立上下文的工具调用循环')
  console.log('  - allowedTools 白名单过滤工具')
  console.log('  - 权限降级: 子代理用 auto 模式')
  console.log('  - 同步执行: 直接返回; 异步: 注册 Task')
}

// ────────────────────────────────────────────
// 8. task — Task Pattern
// ────────────────────────────────────────────

function handleTask(): void {
  header('Task Pattern: 生命周期 pending → running → completed/failed')

  const store = createStateStore()

  section('注册任务')
  const task1 = registerTask({ type: 'local_bash', description: 'npm test' }, store)
  const task2 = registerTask({ type: 'local_agent', description: 'explore codebase' }, store)
  const task3 = registerTask({ type: 'remote_agent', description: 'deploy to prod' }, store)

  console.log(`  task1: id=${task1.id}  (前缀 'b' = local_bash)`)
  console.log(`  task2: id=${task2.id}  (前缀 'a' = local_agent)`)
  console.log(`  task3: id=${task3.id}  (前缀 'r' = remote_agent)`)

  section('状态推进')
  startTask(task1.id, store)
  console.log(`  ${task1.id}: pending → running`)

  startTask(task2.id, store)
  console.log(`  ${task2.id}: pending → running`)

  completeTask(task1.id, store)
  console.log(`  ${task1.id}: running → completed`)

  failTask(task2.id, store)
  console.log(`  ${task2.id}: running → failed`)

  section('查询活跃任务')
  const active = getActiveTasks(store)
  console.log(`  活跃: ${active.length} 个`)
  for (const t of active) {
    console.log(`    ${t.id} [${t.type}] ${t.status}: ${t.description}`)
  }

  section('按类型查询')
  const bashTasks = getTasksByType('local_bash', store)
  console.log(`  local_bash 任务: ${bashTasks.length} 个`)

  section('ID 编码规则')
  console.log('  b = local_bash, a = local_agent, r = remote_agent, d = dream')
  console.log('  格式: {prefix}{8_random_chars} (36^8 ≈ 2.8 万亿)')

  section('设计要点')
  console.log('  - 线性状态机: pending → running → completed/failed/killed')
  console.log('  - 终态不可逆: isTerminalStatus()')
  console.log('  - ID 编码类型: 一眼识别任务类型')
}

// ────────────────────────────────────────────
// 9. mcp — MCP Pattern
// ────────────────────────────────────────────

async function handleMcp(): Promise<void> {
  header('MCP Pattern: connect → discover → convert → use')

  const client = new McpClient()

  section('连接 MCP 服务器')
  const server1 = await client.connect('filesystem', {
    type: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem'],
    scope: 'project',
  })
  console.log(`  filesystem: ${server1.status}`)

  const server2 = await client.connect('search', {
    type: 'sse',
    url: 'http://localhost:3001/sse',
    scope: 'user',
  })
  console.log(`  search: ${server2.status}`)

  section('工具发现')
  const serverInfo = client.getServers()
  for (const s of serverInfo) {
    console.log(`  ${s.name}: status=${s.status} tools=${s.status === 'connected' ? s.toolCount : 0}`)
  }

  section('MCP 工具转换 → Tool 接口')
  const mcpToolDef = {
    name: 'search_web',
    description: 'Search the web for information',
    inputSchema: { type: 'object', properties: { query: { type: 'string' } } },
  }
  const converted = mcpToolToTool('search', mcpToolDef)
  console.log(`  原始: search/${mcpToolDef.name}`)
  console.log(`  转换: ${converted.name}`)
  console.log(`  isReadOnly: ${converted.isReadOnly({})}`)

  const result = await converted.call({ query: 'test' }, createToolUseContext())
  kv('call result', result.data)

  section('获取所有 MCP 工具')
  const allMcpTools = client.getAllTools()
  console.log(`  总计: ${allMcpTools.length} 个 MCP 工具`)

  section('断开连接')
  await client.disconnect('filesystem')
  console.log('  filesystem: disconnected')

  section('设计要点')
  console.log('  - 传输层: stdio / sse / http / ws')
  console.log('  - 生命周期: connect → discover → use → disconnect')
  console.log('  - mcpToolToTool: 将 MCP schema 转为 Tool 接口')
  console.log('  - 命名规则: mcp__{server}__{tool}')
}

// ────────────────────────────────────────────
// 10. skill — Skill Pattern
// ────────────────────────────────────────────

function handleSkill(args: string[]): void {
  const rawMarkdown = args[0] ?? `---
name: my-review-skill
description: Review code changes
allowedTools: [Read, Grep, Glob]
userInvocable: true
paths:
  - "*.ts"
  - "*.tsx"
---
# Code Review Skill

Review the changed files for:
- Code quality
- Security issues
- Performance problems`

  header('Skill Pattern: frontmatter → parse → register → activate')

  section('原始 Markdown')
  console.log(rawMarkdown.split('\n').map(l => `  ${l}`).join('\n'))

  section('parseFrontmatter — 解析 YAML 头')
  const { frontmatter, body } = parseFrontmatter(rawMarkdown)
  kv('name', frontmatter.name)
  kv('description', frontmatter.description)
  kv('allowedTools', frontmatter.allowedTools)
  kv('userInvocable', frontmatter.userInvocable)
  kv('paths', frontmatter.paths)
  kv('body length', `${body.trim().length} chars`)

  section('createSkillFromMarkdown — 创建技能对象')
  const skill = createSkillFromMarkdown(rawMarkdown, '/skills/review.md', 'project')
  kv('name', skill.name)
  kv('source', skill.source)
  kv('userInvocable', skill.userInvocable)
  kv('conditionalPaths', skill.conditionalPaths)
  kv('allowedTools', skill.allowedTools)

  section('SkillRegistry — 注册 + 激活')
  const registry = new SkillRegistry()

  // 注册普通技能
  registry.register(createSkillFromMarkdown(
    '---\nname: commit\n---\nCreate a commit',
    '/commit.md', 'user',
  ))
  registry.register(createSkillFromMarkdown(
    '---\nname: hidden-skill\nuserInvocable: false\n---\nInternal',
    '/hidden.md', 'project',
  ))

  // 注册条件技能
  registry.register(skill)

  console.log(`  注册后: ${registry.size} 个可见技能`)
  console.log(`  getAll() (userInvocable): ${registry.getAll().map(s => s.name).join(', ')}`)

  section('条件激活 — activateForPaths')
  const activated = registry.activateForPaths(['src/index.ts', 'src/App.tsx'])
  console.log(`  匹配 *.ts, *.tsx:`)
  console.log(`  激活: ${activated.map(s => s.name).join(', ')}`)

  const noMatch = registry.activateForPaths(['README.md'])
  console.log(`  匹配 README.md: ${noMatch.length} 个激活`)

  section('设计要点')
  console.log('  - 技能 = Markdown + YAML frontmatter')
  console.log('  - 多来源: user/project/managed/bundled/plugin')
  console.log('  - 条件激活: paths glob 匹配当前文件')
  console.log('  - 去重: 先注册优先 (高优先级来源先加载)')
}

// ────────────────────────────────────────────
// help
// ────────────────────────────────────────────

function handleHelp(): void {
  console.log(`
Clear — Claude Code 架构示例

Commands:
  echo <message>            演示 Tool Pattern
  tools [-v]                演示 Registry Pattern
  state                     演示 State Pattern
  permission [tool] [json]  演示 Permission Pattern (default: Bash {"command":"git status"})
  execute [tool] [json]     演示 Executor Pattern (default: echo {"message":"hello"})
  query [message]           演示 Engine Pattern
  agents [type]             演示 Agent Pattern
  task                      演示 Task Pattern
  mcp                       演示 MCP Pattern
  skill [markdown]          演示 Skill Pattern

Examples:
  bun run clear/index.ts echo "hello world"
  bun run clear/index.ts tools -v
  bun run clear/index.ts permission Bash '{"command":"rm -rf /"}'
  bun run clear/index.ts execute echo '{"message":"test"}'
  bun run clear/index.ts query "List files then summarize"
  bun run clear/index.ts agents explore
`)
}

// ────────────────────────────────────────────
// Main
// ────────────────────────────────────────────

async function main(): Promise<void> {
  const command = process.argv[2]
  const args = process.argv.slice(3)

  switch (command) {
    case 'echo':
      await handleEcho(args)
      break
    case 'tools':
      await handleTools(args)
      break
    case 'state':
      handleState()
      break
    case 'permission':
      await handlePermission(args)
      break
    case 'execute':
      await handleExecute(args)
      break
    case 'query':
      await handleQuery(args)
      break
    case 'agents':
      await handleAgents(args)
      break
    case 'task':
      handleTask()
      break
    case 'mcp':
      await handleMcp()
      break
    case 'skill':
      handleSkill(args)
      break
    case 'help':
    case '--help':
    case '-h':
      handleHelp()
      break
    default:
      console.error(`Unknown command: ${command ?? '(none)'}`)
      handleHelp()
      process.exit(1)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
