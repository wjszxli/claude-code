# Clear - Claude Code 架构示例

## 项目说明

这是一个使用 **TDD（测试驱动开发）** 方式创建的 Claude Code 架构示例。

**目的**: 演示 Claude Code 的核心设计模式，而非实际功能的完整实现。

**注意**: 此代码位于项目根目录的 `clear/` 文件夹，独立于主项目源码。

---

## 目录结构

```
clear/
├── core/           # 核心类型定义
│   ├── Tool.ts
│   ├── AppState.ts
│   └── permissions.ts
├── test/            # 测试文件
│   ├── echoTool.test.ts
│   └── README.md
├── tools/
│   ├── echo.ts
│   └── index.ts
└── README.md        # 本文档
```

---

## 核心文件说明

### 1. 核心模块 (core/)

#### core/Tool.ts
- **用途**: 定义工具接口的类型系统
- **核心类型**:
  ```typescript
  export type ToolResult<T>
  export type PermissionResult
  export type PermissionMode
  export type ToolContext
  export interface Tool<Input>
  ```

#### core/AppState.ts
- **用途**: 应用状态管理，使用不可变更新模式
- **核心功能**:
  ```typescript
  export function getAppState(): AppState
  export function setAppState(): void
  export function resetState(): void
  export const selectors = { ... }
  ```

#### core/permissions.ts
- **用途**: 三层权限检查系统
- **核心设计**:
  1. 工具级：工具自身的 `isReadOnly()` 判断
  2. 拦截器级：全局 `alwaysDenyRules`/`alwaysAllowRules` 检查
  3. 默认：所有操作默认允许
- **核心函数**:
  ```typescript
  export function checkToolPermissions()
  export function isToolReadOnly()
  ```

#### core/executor.ts
- **用途**: 工具调用执行引擎
- **核心功能**:
  ```typescript
  export async function executeTool()
  export function createExecutionContext()
  ```
- **流程**: 权限检查 → 输入验证 → 工具执行 → 状态更新

---

### 2. 工具模块 (tools/)

#### tools/echo.ts
- **用途**: Echo 工具实现，演示完整的工具开发模式
- **核心特点**:
  - 使用 Zod 进行输入验证
- 实现 `description()` 方法返回工具描述
  - 实现 `checkPermissions()` 方法进行权限检查
  - 实现 `isReadOnly()` 标记为只读
  - 实现 `isConcurrencySafe()` 标记为不安全
  - 实现 `call()` 异步执行方法
  - 添加输入验证逻辑

---

### 3. 测试模块 (test/)

#### test/echoTool.test.ts
- **用途**: 测试 Echo 工具的所有核心功能
- **TDD 开发流程**:
  1. RED - 编写失败测试（预期失败）
  2. GREEN - 编写最简实现通过测试
  3. Verify GREEN - 确认测试通过
- **测试覆盖**:
  - ✅ 工具基本调用
  - ✅ 输入验证
  - ✅ 权限系统（默认、拒绝、全局规则）
  - ✅ 状态管理集成

---

### 4. 入口模块

#### tools/index.ts
- **用途**: 主入口，处理 CLI 命令
- **核心功能**: 路由 `echo` 命令到对应处理器

---

## 如何运行

### 1. 运行 Echo 工具

```bash
bun run clear/index.ts echo "hello world"
```

### 2. 运行测试

```bash
cd clear && bun test test
```

---

## 架构设计模式说明

### 1. 工具接口模式 (Tool Pattern)
```typescript
interface Tool<Input> {
  name: string;
  description(input): Promise<string>;
  checkPermissions(input): Promise<PermissionResult>;
  isReadOnly(input): boolean;
  isConcurrencySafe(input): boolean;
  call(input): Promise<ToolResult<unknown>>;
}
```

**设计要点**:
- 工具自描述（`description()` 返回用户可见的描述
- 权限检查（`checkPermissions()`）返回行为决策（allow/deny/prompt）
- 只读标记（`isReadOnly()`）标识是否只读
- 并发安全（`isConcurrencySafe()`）标识是否可并发执行

### 2. 状态管理模式 (AppState Pattern)

```typescript
let currentState: AppState = { ... };

export function getAppState(): AppState {
  return { ...currentState };
}

export function setAppState(updater: (prev: AppState) => AppState): void {
  const newState = updater(currentState);
  currentState = { ...newState };
}

export function resetState(): void {
  currentState = { /* 重置为初始状态 */ };
}

export const selectors = {
  getMessages: () => currentState.messages,
  getTools: () => currentState.tools,
  // ...
};
```

**设计要点**:
- 不可变更新（`setAppState()` 创建新对象引用）
- 选择器模式（`selectors`）提供高效状态查询
- 简单状态存储（直接导出 `currentState`）

### 3. 权限系统 (Three-Layer Permission)

```
Layer 1: 工具自检 (isReadOnly)
Layer 2: 工具级检查 (checkPermissions)
Layer 3: 全局规则 (alwaysDenyRules / alwaysAllowRules)
```

**检查顺序**:
1. 工具是否标记为只读
2. 检查全局拒绝规则
3. 检查全局允许规则
4. 默认：允许

---

### 4. 执行引擎模式 (Executor Pattern)

```
权限检查 → 输入验证 → 工具调用 → 状态更新
```

**设计要点**:
- 统一的执行入口（`executeTool()`）
- 执行上下文封装（`createExecutionContext()`）
- 自动状态更新（调用 `setAppState()`）

---

## TDD 开发演示

### RED 阶段（失败测试）

**目的**: 验证功能未实现时测试正确失败

**示例**: 测试 Echo 工具的 `call()` 方法

```typescript
test('should return output matching input', async () => {
  const { echoTool } = await import('../tools/echo.js');
  const result = await echoTool.call({ message: 'hello' });
  expect(result.data).toBe('hello');
});
```

### GREEN 阶段（通过测试）

**目的**: 编写最简实现使测试通过

**示例**: 实现 Echo 工具的 `call()` 方法

```typescript
export const echoTool = {
  name: 'echo',
  inputSchema: z.object({ message: z.string() }),
  description: async () => 'Echo: ${input.message}',
  call: async (input) => {
    await new Promise((resolve) => setTimeout(resolve, 1));
    return { data: input.message };
  },
  // ...
};
```

---

## 运行示例

```bash
# 运行 Echo 工具（输入测试）
bun run clear/index.ts echo "test message"

# 运行空消息测试（应返回错误）
bun run clear/index.ts echo ""

# 运行测试
cd clear && bun test
```

---

## 总结

这个示例成功演示了 Claude Code 项目的以下核心架构模式：

1. ✅ **工具系统** - 统一的 Tool 接口，支持类型检查和权限控制
2. ✅ **状态管理** - 不可变更新模式，使用选择器进行状态查询
3. ✅ **权限系统** - 三层权限检查，支持全局规则配置
4. ✅ **执行引擎** - 统一的执行入口，自动状态更新
5. ✅ **测试驱动开发** - 先写失败测试，再写实现通过，最后验证

**对比原项目**:
- **代码量**: 约 400 行（vs 原项目 19,000+ 行）
- **复杂度**: 极简 - 只保留核心架构模式
- **依赖**: 仅 zod（vs 数十个依赖）
- **模块**: 仅 7 个核心文件

这个示例展示了如何使用 TDD 方式构建可测试的代码，同时保持了 Claude Code 的架构设计原则。
