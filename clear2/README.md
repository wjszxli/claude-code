# Clear — Claude Code 架构示例

## 项目说明

使用 **TDD（测试驱动开发）** 方式创建的 Claude Code 架构示例。

**目的**: 演示 Claude Code 的核心设计模式，而非实际功能的完整实现。

**注意**: 此代码位于项目根目录的 `clear/` 文件夹，独立于主项目源码。

---

## 目录结构

```
clear/
├── index.ts              # CLI 入口
├── package.json          # 依赖和脚本
├── tsconfig.json         # TypeScript 配置
├── vitest.config.ts      # 测试配置
│
├── core/                 # 核心类型和抽象
│   ├── types.ts          # 统一类型系统 (Message, Permission, Task, ToolResult)
│   ├── tool.ts           # Tool 接口 + buildTool 工厂
│   ├── state.ts          # 不可变状态管理 + selectors/updaters
│   ├── permissions.ts    # 三层权限检查系统
│   └── executor.ts       # 工具执行引擎 (验证 → 权限 → 执行 → 状态更新)
│
├── query/                # 查询引擎
│   └── engine.ts         # 主循环 (API call → tool_use → 循环)
│
├── tools/                # 工具实现
│   ├── index.ts          # 工具注册表 (getAllBaseTools + assembleToolPool)
│   ├── echo.ts           # Echo 工具 (示例)
│   ├── bash.ts           # Bash 工具
│   ├── fileRead.ts       # 文件读取
│   ├── fileEdit.ts       # 文件编辑
│   ├── fileWrite.ts      # 文件写入
│   ├── glob.ts           # 文件匹配
│   └── grep.ts           # 内容搜索
│
├── agent/                # 子代理系统
│   └── agent.ts          # Agent 定义 + 子代理上下文创建
│
├── task/                 # 任务管理
│   └── task.ts           # 异步任务生命周期 (pending → running → completed/failed)
│
├── mcp/                  # MCP 协议集成
│   └── mcp.ts            # MCP 客户端 + 工具发现
│
├── skills/               # 技能系统
│   └── loader.ts         # Frontmatter 解析 + 技能注册表
│
└── test/                 # 测试文件 (镜像源码结构)
    ├── core/
    │   ├── types.test.ts
    │   ├── tool.test.ts
    │   ├── state.test.ts
    │   ├── permissions.test.ts
    │   └── executor.test.ts
    ├── query/
    │   └── engine.test.ts
    ├── tools/
    │   └── tools.test.ts
    ├── task/
    │   └── task.test.ts
    ├── agent/
    │   └── agent.test.ts
    ├── mcp/
    │   └── mcp.test.ts
    └── skills/
        └── loader.test.ts
```

---

## 如何运行

### 前置条件

```bash
# 在项目根目录安装依赖 (如果尚未安装)
npm install
```

### 运行 CLI

```bash
# Echo 工具
bun run clear/index.ts echo "hello world"

# 列出所有工具
bun run clear/index.ts tools

# 帮助
bun run clear/index.ts help
```

### 运行测试

```bash
cd clear
npm install
npm test

# 或使用 watch 模式
npm run test:watch

# 或使用 bun
bun test
```

---

## 核心模块说明

### 1. 核心模块 (core/)

#### core/types.ts
统一类型系统，包含:
- **Message** — 用户/助手/系统/工具结果消息 (discriminated union)
- **Permission** — 权限模式 (`default`/`auto`/`plan`/`bypass`) + 三态决策 (`allow`/`deny`/`ask`)
- **Task** — 异步任务类型 + 线性状态机 + 终态判断
- **ToolResult** — 工具执行结果
- **API** — 用量统计和响应类型

#### core/tool.ts
工具接口和工厂:
- `Tool<Input, Output>` — 工具完整契约 (name, call, description, prompt, permissions)
- `buildTool(ToolDef)` — 工厂函数，填充安全默认值
- 开发者只需实现 `name`, `inputSchema`, `call`, `description`, `prompt`

#### core/state.ts
不可变状态管理:
- `AppState` — 全局唯一状态源 (settings, messages, tools, tasks, mcp, ui)
- `StateStore` — 闭包封装的状态容器 (getState/setState/subscribe/reset)
- `selectors` — 状态查询函数
- `updaters` — 不可变状态更新函数

#### core/permissions.ts
三层权限检查:
1. bypass 模式 → 直接 allow
2. 全局拒绝规则 → deny
3. 全局允许规则 → allow
4. 工具自检 (`checkPermissions`) → 工具级决策
5. 默认按 mode 决定 (`auto`/`default`)

#### core/executor.ts
工具执行管线:
```
validateInput → checkPermission → call → updateState
```
支持批量并发执行 (`isConcurrencySafe` 区分)

### 2. 查询引擎 (query/)

#### query/engine.ts
核心循环:
```
userMessage → API Call → stopReason?
  ├── end_turn    → 返回响应
  ├── max_tokens  → 压缩上下文，继续
  └── tool_use    → 执行工具 → 追加结果 → 循环
```
包含 Mock API Client 和上下文压缩。

### 3. 工具模块 (tools/)

7 个内置工具 + 注册表:
- `getAllBaseTools()` — 获取所有内置工具
- `assembleToolPool()` — 内置 + MCP 工具合并，去重，内置优先

### 4. 高级系统

- **agent/** — 子代理调度，支持同步/异步，权限降级
- **task/** — 异步任务管理，ID 编码类型前缀
- **mcp/** — MCP 协议集成，工具发现和转换
- **skills/** — Markdown + Frontmatter 技能加载，条件激活

---

## 架构设计模式

### 1. Tool Pattern
```typescript
interface Tool<Input> {
  name: string
  call(input, context): Promise<ToolResult>
  description(input): Promise<string>
  prompt(): Promise<string>
  checkPermissions(input, context): Promise<PermissionDecision>
  isReadOnly(input): boolean
  isConcurrencySafe(input): boolean
}
```

### 2. State Pattern
```typescript
// 不可变更新
store.setState(prev => ({ ...prev, messages: [...prev.messages, msg] }))
// 选择器查询
const messages = selectors.getMessages(store.getState())
```

### 3. Permission Pattern
```
bypass → deny rules → allow rules → ask rules → tool check → mode default
```

### 4. Executor Pattern
```
validate → permission → execute → update state
```

---

## 对比原项目

| 维度 | clear/ | Claude Code |
|------|--------|-------------|
| 代码量 | ~1000 行 | 19,000+ 行 |
| 依赖 | zod, vitest | 数十个 |
| 模块 | 8 目录 | 完整 CLI |
| API | Mock | 真实 Anthropic API |
| UI | CLI | React TUI |
