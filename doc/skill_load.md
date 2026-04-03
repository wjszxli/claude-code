# 技能（Skill）加载流程解析

## 一、启动入口：从命令行到 main()

```
cli.tsx (命令行解析)
    │
    ▼
main.tsx : main() 函数
    │
    ├── 1. initBuiltinPlugins()   ←── 同步执行，注册内置插件
    ├── 2. initBundledSkills()    ←── 同步执行，注册内嵌技能（纯内存操作，<1ms）
    │
    ├── 3. setup(...)             ←── 异步执行，与环境、权限、socket 初始化相关
    ├── 4. getCommands(cwd)       ←── 异步执行，加载所有命令（含技能）
    │
    │   注意: 3 和 4 并行执行（Promise.all 模式）
    │         但 1 和 2 必须在 4 之前同步完成，否则 getCommands 读不到内嵌技能
    │
    ▼
进入 REPL 渲染循环
```

关键代码位置：`src/main.tsx:1918-1932`

```typescript
// 同步注册：必须在 getCommands 之前完成
if (process.env.CLAUDE_CODE_ENTRYPOINT !== 'local-agent') {
  initBuiltinPlugins();
  initBundledSkills();
}
// 并行启动
const setupPromise = setup(preSetupCwd, ...);
const commandsPromise = worktreeEnabled ? null : getCommands(preSetupCwd);
```

**设计意图**：`initBundledSkills()` 是纯内存的数组 push 操作（`bundledSkills.push(skill)`），耗时 <1ms。它必须在 `getCommands()` 启动前完成，否则 `getBundledSkills()` 返回空数组，导致技能丢失。

---

## 二、技能加载全景图

```
getCommands(cwd)
    │
    ▼
loadAllCommands(cwd)   ←── memoize 缓存（按 cwd），避免重复磁盘 I/O
    │
    ├── getSkills(cwd)                    ←── 并行
    │   ├── getSkillDirCommands(cwd)      ←── 磁盘 I/O：扫描 .claude/skills/ 目录
    │   ├── getPluginSkills()             ←── 插件系统
    │   ├── getBundledSkills()            ←── 内存读取（同步，从 initBundledSkills 注册的数组）
    │   └── getBuiltinPluginSkillCommands() ←── 内置插件技能
    │
    ├── getPluginCommands()               ←── 并行：插件命令
    ├── getWorkflowCommands(cwd)          ←── 并行：工作流脚本命令
    │
    ▼
合并 + 去重 + 过滤
    │
    ▼
返回 Command[]
```

`loadAllCommands` 的合并顺序（优先级从高到低）：

```typescript
return [
  ...bundledSkills,          // 内嵌技能
  ...builtinPluginSkills,    // 内置插件技能
  ...skillDirCommands,       // 磁盘上的技能（用户/项目/管理）
  ...workflowCommands,       // 工作流命令
  ...pluginCommands,         // 插件命令
  ...pluginSkills,           // 插件技能
  ...COMMANDS(),             // 内置命令（非技能类型）
]
```

---

## 三、磁盘技能加载：getSkillDirCommands

这是最核心的技能加载逻辑，负责从文件系统读取 SKILL.md 文件。

### 3.1 目录搜索范围

```
getSkillDirCommands(cwd) 搜索以下目录：
    │
    ├── Managed Skills      ←── /etc/claude/.claude/skills/ （企业策略管理）
    ├── User Skills         ←── ~/.claude/skills/            （用户全局技能）
    ├── Project Skills      ←── .claude/skills/              （项目级技能，沿目录树向上搜索）
    ├── Additional Skills   ←── --add-dir 指定的目录/.claude/skills/
    └── Legacy Commands     ←── .claude/commands/            （旧格式，向后兼容）
```

### 3.2 并行加载策略

所有目录的加载是**并行**的（`Promise.all`），因为它们互不依赖：

```typescript
const [managedSkills, userSkills, projectSkills, additionalSkills, legacyCommands] =
  await Promise.all([
    loadSkillsFromSkillsDir(managedSkillsDir, 'policySettings'),
    loadSkillsFromSkillsDir(userSkillsDir, 'userSettings'),
    Promise.all(projectSkillsDirs.map(dir => loadSkillsFromSkillsDir(dir, 'projectSettings'))),
    Promise.all(additionalDirs.map(dir => loadSkillsFromSkillsDir(join(dir, '.claude/skills'), ...))),
    loadSkillsFromCommandsDir(cwd),
  ]);
```

### 3.3 单个技能目录的加载过程

```
loadSkillsFromSkillsDir(basePath, source)
    │
    ├── 1. fs.readdir(basePath)               ←── 读取目录列表
    │
    └── 2. 对每个 entry 并行处理：
        │
        ├── 跳过非目录项（只支持 skill-name/SKILL.md 格式）
        │
        ├── 读取 skill-name/SKILL.md 文件内容
        │
        ├── parseFrontmatter(content)         ←── 解析 YAML frontmatter
        │   输入: "---\ndescription: ...\n---\n# Skill body"
        │   输出: { frontmatter: {...}, content: "# Skill body" }
        │
        ├── parseSkillFrontmatterFields(...)  ←── 提取结构化字段
        │   提取: description, allowedTools, model, hooks, paths, effort...
        │
        └── createSkillCommand(...)           ←── 构建 Command 对象
            闭包捕获 markdownContent，延迟到调用时再编译
```

### 3.4 去重机制

加载完成后，使用 `realpath` 解析文件的真实路径进行去重：

```typescript
// 通过 realpath 检测符号链接和重复的父目录
const fileIds = await Promise.all(
  allSkillsWithPaths.map(({ filePath }) => getFileIdentity(filePath))
);

// 先到先得：优先级由合并顺序决定
// managed > user > project > additional > legacy
for (entry of allSkillsWithPaths) {
  if (seenFileIds.has(fileId)) continue;  // 跳过重复
  seenFileIds.set(fileId, skill.source);
  deduplicatedSkills.push(skill);
}
```

### 3.5 条件技能（Conditional Skills）

带有 `paths` frontmatter 的技能不会立即激活，而是存储在 `conditionalSkills` Map 中：

```yaml
---
description: React 组件开发助手
paths: src/components/**, src/pages/**
---

当用户操作的文件路径匹配 paths 模式时，技能被激活并加入动态技能列表。
```

激活流程：`activateConditionalSkillsForPaths(filePaths, cwd)` → 使用 `ignore` 库做 gitignore 风格匹配。

---

## 四、SKILL.md 文件解析

### 4.1 Frontmatter 字段

```yaml
---
# 基础信息
name: 显示名称（可选，默认取目录名）
description: 技能描述
argument-hint: <参数提示文本>
arguments: [arg1, arg2]

# 模型和行为控制
model: claude-sonnet-4-6       # 指定使用的模型
effort: high                    # low | medium | high | 整数
context: fork                   # fork = 独立子进程执行，inline = 主线程
agent: agent-name               # 指定 agent 定义

# 权限控制
allowed-tools: [Bash, Read, Write]
user-invocable: true            # 用户是否可通过 /name 调用
disable-model-invocation: false # 模型是否可通过 SkillTool 调用

# 条件激活
paths: src/**/*.tsx             # 匹配文件路径时自动激活

# 钩子
hooks:
  PreToolUse:
    - command: "eslint $FILE"
      matcher: "Write|Edit"

# Shell 执行环境
shell: bash

# 版本
version: "1.0"
---
```

### 4.2 解析为 Command 对象

`parseSkillFrontmatterFields()` 将 YAML 映射为结构化字段，然后 `createSkillCommand()` 组装成 `Command` 对象：

```typescript
{
  type: 'prompt',              // 技能都是 prompt 类型
  name: 'skill-name',          // 目录名（唯一标识）
  description: '...',          // 从 frontmatter 或正文第一行提取
  source: 'projectSettings',   // 来源：userSettings / projectSettings / policySettings
  loadedFrom: 'skills',        // 加载方式：skills / bundled / plugin / mcp
  allowedTools: ['Bash'],      // 额外允许的工具
  model: 'claude-sonnet-4-6',  // 模型覆盖
  effort: 'high',              // 努力程度
  userInvocable: true,         // 用户可调用
  context: 'fork',             // 执行上下文
  hooks: {...},                // 钩子配置
  paths: ['src/**/*.tsx'],     // 条件路径
  contentLength: 1234,         // SKILL.md 内容长度
  skillRoot: '/path/to/skill', // 技能目录路径

  // 核心：延迟加载闭包
  getPromptForCommand: async (args, toolUseContext) => {...}
}
```

---

## 五、延迟加载机制：getPromptForCommand

技能内容在**启动时只解析 frontmatter**，SKILL.md 的正文内容通过闭包捕获，仅在用户调用 `/skill-name` 时才执行完整的"编译"过程。

```
用户输入 /skill-name args
    │
    ▼
command.getPromptForCommand(args, toolUseContext)
    │
    ├── 1. 拼接 baseDir 前缀
    │   content = `Base directory: ${baseDir}\n\n${markdownContent}`
    │
    ├── 2. 参数替换 substituteArguments()
    │   $ARGUMENTS → args
    │   $arg1 → named arguments
    │
    ├── 3. 环境变量替换
    │   ${CLAUDE_SKILL_DIR} → 技能目录路径
    │   ${CLAUDE_SESSION_ID} → 当前会话 ID
    │
    ├── 4. Shell 命令执行 executeShellCommandsInPrompt()
    │   !`git branch --show-current` → 实际执行并替换结果
    │   （MCP 技能跳过此步骤，安全考虑）
    │
    └── 5. 返回 ContentBlockParam[]
        [{ type: 'text', text: finalContent }]
```

**设计权衡**：启动时只解析 frontmatter（用于技能列表展示），正文编译延迟到调用时。这使得启动速度快，同时支持动态内容（shell 命令在每次调用时执行获取最新结果）。

---

## 六、动态技能发现

除了启动时加载，系统还支持在会话过程中动态发现新技能。

### 6.1 文件操作触发发现

当用户读写文件时，系统会沿文件路径向上搜索 `.claude/skills/` 目录：

```
discoverSkillDirsForPaths(filePaths, cwd)
    │
    ├── 对每个 filePath：
    │   从文件父目录开始，向上遍历到 cwd（不含 cwd）
    │   每级检查是否存在 .claude/skills/ 目录
    │   记录到 dynamicSkillDirs（去重用）
    │
    └── 返回新发现的目录列表（按深度降序排列）
```

### 6.2 激活流程

```
addSkillDirectories(dirs)
    │
    ├── 对每个目录调用 loadSkillsFromSkillsDir()
    │
    ├── 深层路径覆盖浅层路径（同名技能）
    │
    ├── 存入 dynamicSkills Map
    │
    └── skillsLoaded.emit()  ←── 通知缓存失效
```

### 6.3 缓存失效

动态技能加载后，需要清除相关的 memoization 缓存：

```typescript
clearCommandMemoizationCaches() {
  loadAllCommands.cache?.clear?.()
  getSkillToolCommands.cache?.clear?.()
  getSlashCommandToolSkills.cache?.clear?.()
  clearSkillIndexCache?.()         // 技能搜索索引
}
```

`getCommands()` 不被缓存（因为需要每次重新检查 availability 和 isEnabled），但它内部的 `loadAllCommands` 被 memoize，所以清除内层缓存即可。

---

## 七、技能优先级总览

```
优先级从高到低：

1. managed skills          ←── 企业策略目录 /etc/claude/.claude/skills/
2. user skills             ←── 用户全局 ~/.claude/skills/
3. project skills          ←── 项目目录 .claude/skills/（最近的优先）
4. additional skills       ←── --add-dir 指定目录
5. legacy commands         ←── 旧格式 .claude/commands/
6. bundled skills          ←── 代码内嵌技能
7. builtin plugin skills   ←── 内置插件技能
8. plugin skills           ←── 第三方插件技能

同名技能：先注册者胜出（由合并顺序决定）
文件去重：realpath 相同的文件只保留第一个
```

---

## 八、关键数据流图

```
┌─────────────── 启动阶段 ───────────────┐
│                                         │
│  initBundledSkills() ─── 内存注册 ──┐   │
│  initBuiltinPlugins() ─── 内存注册 ─┤   │
│                                      │   │
│  setup() ─── 环境初始化 ──────────────┤   │
│  getCommands(cwd) ───────────────────┘   │
│     │                                    │
│     ├── loadAllCommands(cwd) [memoized]  │
│     │     ├── getSkills(cwd)             │
│     │     │     ├── getSkillDirCommands  │ ← 磁盘 I/O
│     │     │     ├── getPluginSkills      │ ← 插件
│     │     │     ├── getBundledSkills     │ ← 内存
│     │     │     └── getBuiltinPlugin...  │ ← 内存
│     │     ├── getPluginCommands          │ ← 插件
│     │     └── getWorkflowCommands        │ ← 磁盘 I/O
│     │                                    │
│     ├── 过滤: availability + isEnabled   │
│     └── 合并动态技能: getDynamicSkills() │
│                                         │
└─────────────────────────────────────────┘
                     │
                     ▼
┌─────────────── 运行阶段 ───────────────┐
│                                         │
│  用户输入 /skill-name                   │
│     │                                   │
│     ▼                                   │
│  findCommand() ── 从 Command[] 查找     │
│     │                                   │
│     ▼                                   │
│  getPromptForCommand() ── 延迟编译      │
│     │  参数替换 → Shell 执行 → 输出     │
│     ▼                                   │
│  发送给模型                              │
│                                         │
└─────────────────────────────────────────┘
```

---

## 九、文件索引

| 文件 | 职责 |
|------|------|
| `src/main.tsx` | 启动入口，编排 initBundledSkills / setup / getCommands |
| `src/commands.ts` | 命令注册中心，getCommands / loadAllCommands / getSkills |
| `src/skills/loadSkillsDir.ts` | 磁盘技能加载核心，目录扫描 / frontmatter 解析 / 去重 |
| `src/skills/bundled/index.ts` | 内嵌技能注册（initBundledSkills） |
| `src/skills/bundledSkills.ts` | 内嵌技能存储（getBundledSkills 读数组） |
| `src/utils/frontmatterParser.ts` | YAML frontmatter 解析器 |
| `src/utils/argumentSubstitution.ts` | $ARGUMENTS / 命名参数替换 |
| `src/utils/promptShellExecution.ts` | SKILL.md 内 !`...` shell 命令执行 |
| `src/utils/markdownConfigLoader.ts` | 目录树遍历与 .md 文件加载 |

---

*文档生成时间: 2026-04-03*
*基于 Claude Code 代码库分析*
