# Skill 系统的深层思考：从概率模型到工程确定性

## 一、核心命题：Skill 在解决什么问题？

LLM 的三个根本性缺陷，构成了 Skill 系统存在的全部理由：

| 缺陷 | 本质 | Skill 的对抗手段 |
|------|------|-----------------|
| 输出不一致性 | 同一输入产生不同输出 | Prompt 模板 + 参数化注入 → 固定行为边界 |
| 结构漂移 | 长对话中偏离初始意图 | Frontmatter 约束 + hooks 校验 → 结构护栏 |
| 瞎猜问题 | 缺乏上下文时产生幻觉 | `when_to_use` + `paths` 条件激活 → 精确触发域 |

但这个观察只停留在表层。更深层的问题是：**为什么 Prompt 模板能收敛概率模型？**

答案在代码里。看 `createSkillCommand` 的 `getPromptForCommand` 闭包：

```typescript
async getPromptForCommand(args, toolUseContext) {
  let finalContent = baseDir
    ? `Base directory for this skill: ${baseDir}\n\n${markdownContent}`
    : markdownContent

  finalContent = substituteArguments(finalContent, args, true, argumentNames)
  finalContent = finalContent.replace(/\$\{CLAUDE_SKILL_DIR\}/g, skillDir)
  finalContent = finalContent.replace(/\$\{CLAUDE_SESSION_ID\}/g, getSessionId())
  finalContent = await executeShellCommandsInPrompt(finalContent, ...)
  return [{ type: 'text', text: finalContent }]
}
```

这不是简单的"给 LLM 一个模板"。这是一套**编译管线**——把声明式的 Markdown 编译成确定性的运行时上下文。每一层转换都在缩小 LLM 的决策空间：

1. **Base directory 注入**：锚定文件系统上下文，消除路径猜测
2. **参数替换**：将用户输入映射到预定义槽位，限制输入域
3. **环境变量注入**：运行时状态确定性绑定
4. **Shell 命令执行**：动态注入实时数据，避免 LLM 凭记忆猜测
5. **返回 ContentBlockParam[]**：结构化输出，消除格式不确定性

所以 Skill 的本质不是"模板"，而是一个**Prompt 编译器**——把高熵的人类意图，通过多层转换，编译成低熵的结构化指令。

---

## 二、Skill 系统的架构隐喻：它不是一个，而是三个系统

从代码中可以识别出三个正交的子系统，各有不同的设计目标和权衡：

### 2.1 声明层：SKILL.md 作为 DSL

SKILL.md 不是 Markdown 文档，而是一个**领域特定语言（DSL）**：

```yaml
---
name: ...          # 标识符
description: ...   # 语义描述（用于模型路由）
when_to_use: ...   # 触发条件（用于模型自主调用）
paths: ...         # 文件路径守卫（用于条件激活）
allowed-tools: ... # 权限边界
model: ...         # 计算资源分配
effort: ...        # 推理深度控制
context: fork      # 隔离级别
hooks: ...         # 生命周期钩子
shell: ...         # 执行环境
---
```

每一行 frontmatter 都在回答一个问题：**这个 Skill 需要什么样的运行时保证？**

| 字段 | 回答的问题 | 设计意图 |
|------|-----------|---------|
| `paths` | 何时激活？ | 延迟加载，减少上下文污染 |
| `allowed-tools` | 能做什么？ | 最小权限原则 |
| `model` | 用什么脑子？ | 成本-质量权衡 |
| `effort` | 想多深？ | 推理预算控制 |
| `context: fork` | 隔离吗？ | 故障爆炸半径 |
| `hooks` | 谁来校验？ | 外部护栏注入 |

**优化洞察**：目前的 DSL 缺少一个 `depends_on` 或 `composes` 字段。Skill 之间的组合目前只能通过 SkillTool 在 Prompt 层面隐式实现，没有声明式的依赖关系。这意味着 Skill 的组合是"调用时发现"而非"设计时保证"。

### 2.2 编译层：getPromptForCommand 作为编译管线

上文已分析。关键补充：

**延迟编译是一个精妙的设计**。启动时只解析 frontmatter（`estimateSkillFrontmatterTokens` 只估算元信息的 token），正文编译推迟到调用时。这意味着：

- 启动速度不受 Skill 内容大小影响
- Shell 命令每次调用获取最新结果（而非启动时的快照）
- 代价是每次调用的首次延迟（需执行编译管线）

这是经典的**延迟求值（Lazy Evaluation）**策略，在 prompt 工程中的应用。

### 2.3 运行时层：Command 对象作为运行时表示

`createSkillCommand` 返回的 Command 对象是一个**闭包**——捕获了 `markdownContent` 和所有 frontmatter 字段，但不执行任何计算。直到 `getPromptForCommand` 被调用时，编译管线才启动。

这个设计有一个重要的推论：**Skill 的内容在内存中只有一份拷贝**（闭包捕获引用），但每次调用会产生新的编译结果。这意味着：

- 内存效率：N 个 Skill 只占用 N 份 Markdown 的空间
- CPU 效率：只有被调用的 Skill 才消耗编译时间
- 一致性代价：同一个 Skill 的两次调用，如果中间 Shell 命令结果变了，输出会不同

---

## 三、Skill 系统解决不了什么？

### 3.1 组合爆炸问题

当前 Skill 的组合是隐式的——一个 Skill 可以通过 SkillTool 调用另一个 Skill，但：

- 没有声明式的组合关系（`A composes B, C`）
- 没有组合后的 token 预算管理
- 没有组合冲突检测（两个 Skill 对同一文件给出矛盾指令）
- 没有 DAG 调度（Skill A 的输出作为 Skill B 的输入）

**系统化思考**：如果引入声明式组合，Skill 系统会从一个"Prompt 模板库"进化为一个"Prompt 计算图"。每个 Skill 是一个节点，`composes` 定义边，运行时按拓扑序执行，每层的输出作为下一层的输入。这能解决：

- Token 预算：DAG 调度可以精确计算每层预算
- 冲突检测：编译期静态分析 DAG 的输出冲突
- 可观测性：每层的输入输出可独立审查

### 3.2 验证闭环缺失

从代码看，Skill 的执行路径是单向的：

```
SKILL.md → parseFrontmatter → createSkillCommand → getPromptForCommand → LLM → 输出
```

没有反馈回路。如果 LLM 的输出偏离了 Skill 的预期，系统无法：

- 自动检测偏离
- 回退到上一个检查点
- 动态调整 Prompt 参数

`hooks` 是一个部分解决方案（PostToolUse 可以校验工具调用的输出），但它只能拦截工具调用，不能拦截 LLM 的纯文本输出。

**系统化思考**：理想的结构是：

```
SKILL.md → 编译 → 执行 → 校验 → { 通过 → 输出 | 失败 → 回退 + 重新编译 }
```

这需要为 Skill 引入 `output_schema` 或 `validation` 字段，定义期望的输出结构。

### 3.3 版本和演进问题

Frontmatter 有 `version` 字段，但代码中 **不使用它做任何版本控制逻辑**。它只是一个标签。

当 Skill A 依赖 Skill B 的 v1 行为，而 B 升级到 v2 时，没有机制保证兼容性。这在团队协作中尤其危险——一个人的 Skill 升级可能悄悄破坏另一个人的工作流。

---

## 四、从产研流程视角重新审视 Skill

### 4.1 当前的现实

Skill 目前自动化的都是**原子操作**：/commit, /review, /test 等。这些是产研流程中的"叶节点"——它们不依赖其他操作的输出。

```
需求 → 技术方案 → 编码 → 测试 → 上线
  │        │         │       │       │
  │        │         ├─/commit      ├─/deploy
  │        │         ├─/review       │
  │        │         └─/test         │
  │        │                         │
  └────────┴───── 尚未有 Skill 介入 ─┘
```

### 4.2 Skill 能覆盖的范围（理论最大值）

如果我们按产研流程的每个阶段来映射 Skill 的能力：

| 阶段 | 当前状态 | Skill 理论上能做的 | 需要的额外基础设施 |
|------|---------|-------------------|------------------|
| 需求分析 | 无 | 从 PRD 提取关键需求，识别模糊点，生成问题清单 | 需求文档的结构化输入 |
| 技术方案 | 趋势（/ultraplan 等） | 架构建议、依赖分析、风险评估、方案对比 | 项目依赖图、历史方案库 |
| 编码 | /commit, /review, TDD skill | 按方案自动编码、增量校验 | 方案到代码的映射规则 |
| 测试 | 部分覆盖 | 自动生成测试、覆盖率分析、边界探测 | 测试策略模板、覆盖率基础设施 |
| 上线 | 无 | 变更影响分析、回滚方案、灰度策略 | CI/CD 集成、部署配置 |

### 4.3 关键约束：Skill 不等于自动化

用户的原始观点中有一个深刻的洞察值得展开：

> "整个过程可能并不一定是提效，而是更好的提高整个研发的质量"

这是对的，但需要更精确的表述。Skill 的核心价值不在于**自动化**（用机器替代人），而在于**标准化**（让不同的人产出相同质量的工作）。

标准化带来的是：

1. **降低随机性**：没有 Skill 时，代码审查质量取决于审查者的经验和状态；有 Skill 时，审查流程由 Skill 保证最低质量
2. **知识传递**：高级工程师的方法论可以编码为 Skill，而非仅存在于他们的脑子里
3. **可审计性**：Skill 的执行路径是确定性的，可以回溯和审查

但这有一个隐含假设：**Skill 编写者的方法论是正确的**。如果方法论本身有缺陷，Skill 会以工业化的速度传播这个缺陷。

---

## 五、Skill 系统的深层设计模式

从代码中可以提取出几个值得在其他系统中复用的设计模式：

### 5.1 渐进式加载（Progressive Loading）

```
启动 → 只加载 frontmatter（元数据）
  ↓
用户调用 → 编译完整内容
  ↓
文件操作 → 动态发现新 Skill
  ↓
路径匹配 → 条件激活
```

这四层加载策略解决了上下文窗口的稀缺性问题。不是所有 Skill 都需要在任何时刻可用，只在需要时加载。

### 5.2 优先级层次（Priority Hierarchy）

```
managed (企业策略) > user (个人) > project (项目) > additional (扩展) > legacy (兼容)
```

这是一个**策略分层**模式——高层次的策略覆盖低层次的个性化。在企业场景中，这意味着安全团队可以通过 managed skills 强制注入安全审查流程，而开发者无法通过个人或项目级 Skill 覆盖。

### 5.3 闭包即合约（Closure as Contract）

`createSkillCommand` 返回的不是一个数据对象，而是一个**行为合约**——闭包承诺在被调用时返回编译后的 Prompt，但不承诺如何编译、何时编译。这种封装使得：

- 调用方不需要知道 Skill 的实现细节
- 编译策略可以独立变化（如未来加入缓存）
- Skill 可以在不影响系统其他部分的情况下演进

---

## 六、未探索的方向

### 6.1 Skill 的元编程

当前 Skill 是静态的 Markdown 文件。如果 Skill 本身可以由另一个 Skill 生成呢？

比如：一个 `meta-skill` 读取项目的 `package.json`、`tsconfig.json`、目录结构，然后**生成**一组针对该项目的定制化 Skill。这本质上是把"配置"从"编码"中分离出来——Skill 的模板是固定的，但 Skill 的具体参数是动态生成的。

### 6.2 Skill 的评估体系

Skill 没有评估机制。我们不知道一个 Skill 是否真的比"没有 Skill"时表现更好。

一个可能的架构：为 Skill 加入 `metrics` 字段，定义成功标准（如"生成的代码通过测试率 > 90%"），运行时自动收集指标，定期生成 Skill 质量报告。

### 6.3 Skill 的形式化验证

如果 Skill 的 frontmatter 支持描述输入/输出的形式化约束（如 `input: { type: "file_path", exists: true }`, `output: { type: "diff", passes: "eslint" }`），那么可以在编译期进行静态分析，检测 Skill 定义的合理性。

### 6.4 多人协作的 Skill 治理

在团队中，谁有权创建/修改/删除 Skill？当前系统只有文件系统权限控制，没有应用层的治理模型。如果引入 Skill 注册表（类似 npm registry），配合版本管理和依赖分析，Skill 就可以成为一个可治理的共享资源。

---

## 七、总结：Skill 系统的三层意义

| 层次 | 含义 | 关键词 |
|------|------|--------|
| **技术层** | Prompt 编译器，把高熵意图编译成低熵指令 | 编译管线、延迟求值、闭包合约 |
| **组织层** | 方法论固化工具，让最佳实践可复用、可传播 | 标准化、知识萃取、质量基线 |
| **战略层** | LLM 应用的工业化基础设施，把概率模型变成工程系统 | 确定性、可验证、可组合 |

Skill 不是终点。它是一个过渡形态——从"和 LLM 聊天"到"用 LLM 构建工程系统"的桥梁。当这个系统足够成熟时，"写 Skill"这个动作本身也会被自动化，那时我们将讨论的是**元 Skill** 和 **Skill 编排语言**，而非单个 Skill 的编写。

---

*文档生成时间: 2026-04-03*
*基于 Claude Code 代码库深度分析*
