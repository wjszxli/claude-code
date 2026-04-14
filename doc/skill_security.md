# Claude Code Skill 安全机制系统性梳理

本文档系统梳理 Claude Code 项目中 **Skill** 相关的完整安全机制，涵盖从加载、校验、权限控制到执行隔离的全生命周期。

---

## 1. 概述

Skill 是 Claude Code 的可扩展能力单元，本质上是类型为 `prompt` 的 `Command`，由 Markdown 文件（`SKILL.md`）或程序代码定义。系统通过多层防御确保 Skill **不会被恶意利用**、**不会越权执行**、**不会影响主会话状态**。

安全机制的核心原则：
- **最小权限**：Skill 默认无额外权限，需经用户显式授权
- **来源可控**：区分用户级、项目级、托管策略级、插件级和内置级 Skill
- **执行隔离**：Fork 模式的 Skill 在独立的子 Agent 中运行
- **内容安全**：MCP Skill 禁止内联 Shell 执行，Bundled Skill 文件提取有 TOCTOU 防护
- **策略锁定**：支持 `strictPluginOnlyCustomization` 管理员策略，限制非受信来源

---

## 2. Skill 来源与加载安全

### 2.1 来源分级（Source）

Skill 加载时会标记 `source` 和 `loadedFrom`，用于后续的权限决策和策略过滤：

| 来源 | 对应 `loadedFrom` | 说明 |
|------|------------------|------|
| 托管策略配置 | `policySettings` | 企业/管理员通过 managed settings 下发，受信 |
| 用户全局配置 | `userSettings` | `~/.claude/skills/` |
| 项目本地配置 | `projectSettings` | `./.claude/skills/` |
| 插件提供 | `plugin` | 通过插件市场安装，受 `strictKnownMarketplaces` 约束 |
| 内置捆绑 | `bundled` | 随 CLI 二进制分发，编译时确定 |
| MCP 服务器 | `mcp` | 远程 MCP 服务器提供，被视为不可信 |

### 2.2 Plugin-Only 策略锁定

通过 `strictPluginOnlyCustomization` 策略（`src/utils/settings/pluginOnlyPolicy.ts`），管理员可以将特定定制表面锁定为仅允许插件/托管/内置来源：

```ts
// ADMIN_TRUSTED_SOURCES = {'plugin', 'policySettings', 'built-in', 'builtin', 'bundled'}
const skillsLocked = isRestrictedToPluginOnly('skills')
```

当策略锁定时：
- `userSettings` 和 `projectSettings` 的 Skill **被跳过加载**
- `--bare` 模式不会绕过此策略
- Hook 注册同样受此策略约束

### 2.3 目录格式限制

`/skills/` 目录**仅支持目录格式**：`skill-name/SKILL.md`，不直接加载顶层 `.md` 文件。这防止了误将普通文档识别为 Skill。

### 2.4 文件去重（Symlink 防护）

加载时使用 `realpath` 解析真实路径，通过 `getFileIdentity()` 对同一文件的多个访问路径（如 symlink）进行去重，避免重复加载或策略绕过（`src/skills/loadSkillsDir.ts:118`）。

### 2.5 --bare 模式

启动时若指定 `--bare`：
- 跳过自动发现（managed/user/project 目录遍历 + 传统 commands 目录）
- **仅加载**通过 `--add-dir` 显式指定的目录
- 若 `projectSettings` 被禁用或 `skillsLocked` 为 true，返回空列表

---

## 3. Skill 执行安全（SkillTool）

Skill 由模型通过 `SkillTool`（`src/tools/SkillTool/SkillTool.ts`）调用，执行前经过多层校验。

### 3.1 输入验证（validateInput）

在工具调用前执行：
1. **格式校验**：Skill 名不能为空，兼容前导 `/`
2. **存在性校验**：Skill 必须存在于命令注册表中
3. **`disableModelInvocation` 校验**：标记了 `disable-model-invocation: true` 的 Skill **不能通过 SkillTool 调用**，只能由用户通过 slash command 直接触发
4. **类型校验**：必须是 `prompt` 类型

### 3.2 权限检查（checkPermissions）

`SkillTool.checkPermissions()` 实现了 deny → allow → ask 的三层决策：

#### 3.2.1 Deny 规则优先
检查 `toolPermissionContext.alwaysDenyRules` 中是否有匹配该 Skill 的规则（精确匹配或前缀匹配 `prefix:*`），匹配则**直接拒绝**。

#### 3.2.2 Allow 规则
检查 `alwaysAllowRules` 中的 allow 规则，匹配则**直接放行**。

#### 3.2.3 安全属性白名单自动放行
对于仅包含"安全属性"的 Skill，系统自动允许，无需用户确认。这是**显式白名单机制**——新属性默认不安全，需经审查后方可加入：

```ts
const SAFE_SKILL_PROPERTIES = new Set([
  'type', 'name', 'description', 'progressMessage', 'contentLength',
  'argNames', 'model', 'effort', 'source', 'pluginInfo',
  'disableNonInteractive', 'skillRoot', 'context', 'agent',
  'getPromptForCommand', 'frontmatterKeys', 'hasUserSpecifiedDescription',
  'isEnabled', 'isHidden', 'aliases', 'isMcp', 'argumentHint',
  'whenToUse', 'paths', 'version', 'disableModelInvocation',
  'userInvocable', 'loadedFrom', 'immediate', 'userFacingName',
])
```

若 Skill 包含任何**不在白名单中且有实际值**的属性，则触发用户确认。

#### 3.2.4 默认 Ask
未命中任何规则且不在白名单的 Skill，系统向用户展示 `SkillPermissionRequest` 弹窗，提供：
- **Yes**：单次允许
- **Yes, don't ask again for {skill} in {cwd}**：添加精确 allow 规则
- **Yes, don't ask again for {prefix}:* commands in {cwd}**：添加前缀 allow 规则
- **No**：拒绝

---

## 4. 执行上下文隔离

### 4.1 Inline vs Fork 执行模式

Skill 可在两种模式下执行：

| 模式 | 说明 | 安全特性 |
|------|------|----------|
| `inline` | 将 Skill 内容展开为 UserMessage 注入当前对话 | 修改当前 `ToolUseContext` 的 `allowedTools`、`model`、`effort` |
| `fork` | 在独立的子 Agent 中运行完整 query 循环 | 完全隔离，不影响主会话状态 |

由 Skill frontmatter 中的 `context: fork` 决定。

### 4.2 Fork 模式隔离机制

Fork 模式通过 `runAgent()` 启动子 Agent，核心隔离由 `createSubagentContext()`（`src/utils/forkedAgent.ts:345`）提供：

- **状态隔离**：`readFileState`、`contentReplacementState` 从父级克隆，子 Agent 的修改不影响父级
- **AbortController 隔离**：默认创建新的 child abort controller，父级中止会级联传播，但子级不会反向影响父级
- **AppState 写操作隔离**：`setAppState`、`setResponseLength`、`setInProgressToolUseIDs` 默认为 no-op
- **权限提示隔离**：非交互式子 Agent 自动设置 `shouldAvoidPermissionPrompts: true`，避免在无 UI 环境中卡住
- **Query 深度追踪**：子 Agent 的 `queryTracking.depth` 递增，防止无限递归

### 4.3 Inline 模式的上下文修改

Inline Skill 执行后返回 `contextModifier`，可：
1. **扩展 allowedTools**：将 Skill 声明的 `allowed-tools` 合并到当前 `toolPermissionContext.alwaysAllowRules.command`
2. **覆盖 Model**：应用 Skill 指定的模型别名（保留 `[1m]` 窗口后缀）
3. **覆盖 Effort**：应用 Skill 指定的 effort 级别

---

## 5. 内容安全与注入防护

### 5.1 MCP Skill 禁止内联 Shell 执行

MCP Skill 被视为远程且不可信，因此**严格禁止**执行 Markdown 体中的内联 Shell 命令（`` !`...` `` 和 ` ```! ... ``` `）：

```ts
// Security: MCP skills are remote and untrusted — never execute inline
// shell commands (!`…` / ```! … ```) from their markdown body.
if (loadedFrom !== 'mcp') {
  finalContent = await executeShellCommandsInPrompt(...)
}
```

### 5.2 变量替换安全

Skill 内容支持 `${CLAUDE_SKILL_DIR}` 和 `${CLAUDE_SESSION_ID}` 替换：
- `CLAUDE_SKILL_DIR` 被替换为 Skill 所在目录的绝对路径
- Windows 环境下反斜杠被规范化为正斜杠，防止 Shell 转义注入
- `CLAUDE_SESSION_ID` 替换为当前会话 ID

### 5.3 Bundled Skill 文件提取安全

Bundled Skill 可将参考文件提取到临时目录供模型读取。提取过程有多重 TOCTOU（Time-of-check-time-of-use）防护（`src/skills/bundledSkills.ts`）：

1. **随机 Nonce 路径**：`getBundledSkillsRoot()` 使用 `randomBytes(16)` 生成每进程唯一的 nonce，防止攻击者预创建目录或 symlink
2. **安全文件写入**：
   - 使用 `O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW`（Windows 使用 `'wx'`）
   - 目录权限 `0o700`，文件权限 `0o600`
3. **路径遍历防护**：`resolveSkillFilePath()` 拒绝包含 `..` 或绝对路径的相对路径
4. **不重试 EEXIST**：遇到文件已存在时直接失败，不执行 `unlink`（避免跟随 symlink）

---

## 6. Hook 注册安全

Skill 可通过 frontmatter 声明 `hooks`，在加载时注册到系统中。Hook 是全局生效的，因此注册有额外安全控制：

```ts
const hooksAllowedForThisSkill = !isRestrictedToPluginOnly('hooks') || isSourceAdminTrusted(command.source)
if (command.hooks && hooksAllowedForThisSkill) {
  registerSkillHooks(...)
}
```

- 当 `strictPluginOnlyCustomization` 锁定 `hooks` 表面时，仅 `ADMIN_TRUSTED_SOURCES` 中的来源可以注册 Hook
- 用户级和项目级 Skill 的 Hook 注册被阻止

---

## 7. 动态 Skill 发现安全

当模型操作文件时，系统会从文件路径向上遍历，自动发现嵌套的 `.claude/skills/` 目录（`src/skills/loadSkillsDir.ts:883`）。

### 7.1 启用条件

动态发现仅在以下条件下执行：
- `projectSettings` 设置源已启用
- `skills` 表面未被 `strictPluginOnlyCustomization` 锁定

### 7.2 Gitignore 检查

在加载动态发现的 Skill 目录前，系统检查包含目录是否在 gitignore 中：

```ts
if (await isPathGitignored(currentDir, resolvedCwd)) {
  // 跳过 node_modules/pkg/.claude/skills 等被忽略目录
}
```

- 在 git 仓库外时 `git check-ignore` 返回 128，系统采取"fail open"策略（不阻止）
- 实际的信任边界仍由调用时的权限对话框保障

### 7.3 范围限制

动态发现仅遍历从文件路径到 `cwd` 之间的目录，**不包含 cwd 本身**（cwd 级别的 Skill 在启动时已加载）。

---

## 8. 条件 Skill（paths frontmatter）安全

Skill 可在 frontmatter 中声明 `paths` 属性，指定仅当特定文件被操作时自动激活：

```yaml
paths:
  - "src/**/*.ts"
```

### 8.1 懒加载机制

- 带有 `paths` 的 Skill 在加载时不会立即加入可用命令列表
- 它们被存储在 `conditionalSkills` Map 中
- 只有当操作的文件路径匹配其 `paths` 模式时，才移动到 `dynamicSkills` 中

### 8.2 路径匹配安全

使用 `ignore` 库进行 gitignore 风格匹配：
- 文件路径首先转换为相对于 `cwd` 的路径
- 空路径、`../` 开头、绝对路径被跳过，防止路径遍历
- 一旦匹配成功即激活，并加入 `activatedConditionalSkillNames` Set 持久化（存活于缓存清除）

---

## 9. 远程 Skill 安全（实验性）

远程 Skill（`EXPERIMENTAL_SKILL_SEARCH` feature，仅 `USER_TYPE=ant`）通过 AKI/GCS 下载：

### 9.1 发现限制

- 远程 Skill 必须先通过 `DiscoverSkills` 发现并存储在会话状态中
- 名称格式为 `_canonical_<slug>`
- `validateInput` 会验证该 slug 是否存在于当前会话的发现结果中

### 9.2 自动授权

远程 Skill 是策划/规范化的内容，因此：
- 在 `checkPermissions` 中自动允许（放置在 deny 检查之后，因此用户仍可手动配置 deny 规则覆盖）
- 不执行 slash command 扩展（无 `!command` 替换、无 `$ARGUMENTS` 插值）

### 9.3 加载失败处理

若远程 Skill 加载失败（网络/缓存问题），记录详细的 telemetry（cache hit、latency、error）并抛出清晰错误，不会静默降级为本地 Skill。

---

## 10. 用户可调用性控制

Skill frontmatter 支持 `user-invocable` 字段：
- `true`（默认）：用户可通过 `/skill-name` 直接调用，模型也可通过 SkillTool 调用
- `false`：**仅模型可通过 SkillTool 调用**，用户直接输入 `/skill-name` 会收到提示："This skill can only be invoked by Claude, not directly by users."

这允许创建"内部 Skill"，避免用户误操作复杂或危险的提示模板。

---

## 11. Skill 编辑的权限细化

在文件系统权限层面，系统对 `.claude/skills/{name}/` 目录下的文件提供了**细粒度授权建议**（`src/utils/permissions/filesystem.ts:102`）：

当 Claude 尝试编辑 Skill 文件时，权限系统会识别该文件是否位于某个具体 Skill 目录下，并建议 scoped 规则：

```ts
// 例如编辑 .claude/skills/pdf/SKILL.md
// 建议规则：/.claude/skills/pdf/**
```

这避免了"允许编辑整个 `.claude/` 目录"的过度授权问题。

---

## 12. Telemetry 与审计

Skill 的生命周期中有丰富的事件日志，用于安全审计和行为分析：

| 事件 | 说明 |
|------|------|
| `tengu_skill_tool_invocation` | SkillTool 调用，记录 command_name、execution_context、query_depth、source、loadedFrom、plugin 信息 |
| `tengu_slash_command_forked` | 用户通过 slash command 触发 fork 模式 Skill |
| `tengu_dynamic_skills_changed` | 动态 Skill 发现/条件 Skill 激活 |
| `tengu_auto_mode_decision` | Auto 模式下的分类器决策（若 Skill 触发底层工具） |
| `tengu_fork_agent_query` | Fork 子 Agent 的完整 query 指标 |

所有 telemetry 中对第三方 Skill 名称进行 redaction（`command_name: 'custom'`），但 ant 用户可看到完整信息。

---

## 13. 安全机制总结图

```
┌─────────────────────────────────────────────────────────────┐
│                    Skill 安全机制总览                         │
├─────────────────────────────────────────────────────────────┤
│  加载层                                                       │
│  ├── 来源分级 (policy/user/project/plugin/bundled/mcp)       │
│  ├── plugin-only 策略锁定                                     │
│  ├── 文件去重 (realpath)                                     │
│  ├── 目录格式限制 (skill-name/SKILL.md)                      │
│  └── --bare 模式跳过自动发现                                  │
├─────────────────────────────────────────────────────────────┤
│  权限层                                                       │
│  ├── validateInput (存在性/类型/disableModelInvocation)      │
│  ├── checkPermissions (deny → allow → safe props → ask)     │
│  ├── SkillPermissionRequest UI 弹窗                          │
│  └── 精确/前缀规则持久化                                      │
├─────────────────────────────────────────────────────────────┤
│  执行层                                                       │
│  ├── inline: 上下文修改 (allowedTools/model/effort)          │
│  ├── fork: createSubagentContext 完全隔离                     │
│  └── userInvocable 控制人机调用边界                           │
├─────────────────────────────────────────────────────────────┤
│  内容层                                                       │
│  ├── MCP Skill 禁止内联 Shell 执行                           │
│  ├── Bundled Skill 安全提取 (nonce + O_EXCL + O_NOFOLLOW)   │
│  ├── 变量替换规范化 (反斜杠/路径遍历防护)                     │
│  └── Hook 注册受 plugin-only 策略约束                        │
├─────────────────────────────────────────────────────────────┤
│  发现层                                                       │
│  ├── 动态发现需 projectSettings 启用                         │
│  ├── gitignore 检查过滤被忽略目录                             │
│  ├── 条件 Skill paths 匹配 (ignore 库 + 路径遍历防护)        │
│  └── 远程 Skill 需先 DiscoverSkills + ant-only               │
└─────────────────────────────────────────────────────────────┘
```

---

## 14. 关键文件索引

| 文件路径 | 职责 |
|----------|------|
| `src/skills/loadSkillsDir.ts` | Skill 加载、动态发现、条件 Skill 激活 |
| `src/skills/bundledSkills.ts` | Bundled Skill 注册、文件安全提取 |
| `src/tools/SkillTool/SkillTool.ts` | SkillTool 定义、权限检查、执行逻辑 |
| `src/components/permissions/SkillPermissionRequest/SkillPermissionRequest.tsx` | Skill 权限请求 UI |
| `src/utils/forkedAgent.ts` | Fork 子 Agent 上下文隔离 |
| `src/utils/processUserInput/processSlashCommand.tsx` | Slash command 处理、Hook 注册控制 |
| `src/utils/settings/pluginOnlyPolicy.ts` | Plugin-only 策略判断 |
| `src/utils/permissions/filesystem.ts` | 文件系统权限、Skill scope 识别 |
| `src/commands.ts` | 命令聚合、MCP Skill 过滤、可用性检查 |
