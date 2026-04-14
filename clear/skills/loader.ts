/**
 * Skills 系统 — 技能发现与加载
 * 简化自 src/skills/loadSkillsDir.ts (原文件 600+ 行)
 *
 * 核心设计:
 *   - 技能 = Markdown 文件 + YAML frontmatter
 *   - 多来源发现: user/project/managed/bundled
 *   - 条件激活: 根据文件路径动态加载技能
 *   - Frontmatter 定义元数据: name, description, allowedTools, hooks
 *
 * 技能文件格式:
 *   ---
 *   name: my-skill
 *   description: Do something useful
 *   allowedTools: [Read, Grep]
 *   ---
 *   具体指令内容 (Markdown)
 */

// ────────────────────────────────────────────
// Skill Types
// ────────────────────────────────────────────

/** 技能来源 */
export type SkillSource =
  | 'user'       // ~/.claude/skills/
  | 'project'    // .claude/skills/
  | 'managed'    // 管理员分发
  | 'bundled'    // 内置技能
  | 'plugin'     // 插件提供

/** Frontmatter 数据 */
export type FrontmatterData = {
  name?: string
  description?: string
  allowedTools?: string[]
  argumentHint?: string
  argumentNames?: string[]
  whenToUse?: string
  userInvocable?: boolean
  model?: string
  /** 条件激活: 匹配的文件 glob 模式 */
  paths?: string[]
}

/** 技能定义 */
export type Skill = {
  /** 技能名称 (用作 slash command) */
  name: string
  /** 文件路径 */
  filePath: string
  /** 来源 */
  source: SkillSource
  /** 描述 */
  description: string
  /** Markdown 内容 (不含 frontmatter) */
  content: string
  /** 允许的工具列表 */
  allowedTools: string[]
  /** 是否用户可调用 */
  userInvocable: boolean
  /** 条件激活路径 */
  conditionalPaths: string[]
  /** Frontmatter 原始数据 */
  frontmatter: FrontmatterData
}

// ────────────────────────────────────────────
// Frontmatter Parser
// ────────────────────────────────────────────

/**
 * 解析 Markdown 文件的 frontmatter
 *
 * 格式:
 *   ---
 *   key: value
 *   list:
 *     - item1
 *     - item2
 *   ---
 *   Body content here
 */
export function parseFrontmatter(markdown: string): {
  frontmatter: Record<string, unknown>
  body: string
} {
  const match = markdown.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/)

  if (!match) {
    return { frontmatter: {}, body: markdown }
  }

  const rawFm = match[1]!
  const body = match[2]!

  // 简化 YAML 解析 (真实项目使用 yaml 库)
  const frontmatter: Record<string, unknown> = {}
  let currentKey = ''
  let inList = false
  const listItems: string[] = []

  for (const line of rawFm.split('\n')) {
    const listMatch = line.match(/^\s+-\s+(.+)$/)
    if (listMatch) {
      listItems.push(listMatch[1]!.trim())
      if (inList) {
        frontmatter[currentKey] = [...listItems]
      }
      continue
    }

    const kvMatch = line.match(/^(\w+):\s*(.*)$/)
    if (kvMatch) {
      // 保存之前的 list
      if (inList && listItems.length > 0) {
        frontmatter[currentKey] = [...listItems]
      }

      currentKey = kvMatch[1]!
      const value = kvMatch[2]!.trim()
      inList = value === ''

      if (!inList) {
        frontmatter[currentKey] = parseValue(value)
      }
      listItems.length = 0
    }
  }

  // 保存最后的 list
  if (inList && listItems.length > 0) {
    frontmatter[currentKey] = [...listItems]
  }

  return { frontmatter, body }
}

/** 解析 YAML 值 */
function parseValue(value: string): unknown {
  if (value === 'true') return true
  if (value === 'false') return false
  if (value === 'null' || value === '') return null
  if (/^\d+$/.test(value)) return parseInt(value, 10)
  // 数组格式: [A, B, C]
  if (value.startsWith('[') && value.endsWith(']')) {
    return value.slice(1, -1).split(',').map(s => s.trim())
  }
  return value
}

// ────────────────────────────────────────────
// Skill Loader
// ────────────────────────────────────────────

/**
 * 从 Markdown 文本创建技能
 */
export function createSkillFromMarkdown(
  markdown: string,
  filePath: string,
  source: SkillSource,
): Skill {
  const { frontmatter: raw, body } = parseFrontmatter(markdown)

  const fm = raw as FrontmatterData
  const name = fm.name ?? filePathToName(filePath)

  return {
    name,
    filePath,
    source,
    description: fm.description ?? `Skill: ${name}`,
    content: body.trim(),
    allowedTools: Array.isArray(fm.allowedTools)
      ? fm.allowedTools as string[]
      : [],
    userInvocable: fm.userInvocable !== false,
    conditionalPaths: Array.isArray(fm.paths)
      ? fm.paths as string[]
      : [],
    frontmatter: fm,
  }
}

/** 文件路径转技能名 */
function filePathToName(filePath: string): string {
  const base = filePath.split('/').pop() ?? filePath
  return base.replace(/\.md$/, '').toLowerCase()
}

// ────────────────────────────────────────────
// Skill Registry
// ────────────────────────────────────────────

/**
 * SkillRegistry — 技能注册表
 *
 * 管理:
 *   - 技能注册 (按来源)
 *   - 条件技能激活 (按文件路径)
 *   - 去重 (同名技能保留高优先级来源)
 */
export class SkillRegistry {
  private skills = new Map<string, Skill>()
  private conditionalSkills: Array<{ paths: string[]; skill: Skill }> = []

  /** 注册技能 */
  register(skill: Skill): void {
    // 同名技能: 保留已注册的 (先注册 = 高优先级来源)
    if (!this.skills.has(skill.name)) {
      this.skills.set(skill.name, skill)
    }

    // 条件技能单独管理
    if (skill.conditionalPaths.length > 0) {
      this.conditionalSkills.push({
        paths: skill.conditionalPaths,
        skill,
      })
    }
  }

  /** 按名称查找 */
  get(name: string): Skill | undefined {
    return this.skills.get(name)
  }

  /** 获取所有用户可调用技能 */
  getAll(): Skill[] {
    return Array.from(this.skills.values()).filter(s => s.userInvocable)
  }

  /** 根据文件路径激活条件技能 */
  activateForPaths(filePaths: string[]): Skill[] {
    const activated: Skill[] = []

    for (const { paths, skill } of this.conditionalSkills) {
      const matches = filePaths.some(fp =>
        paths.some(pattern => globMatch(pattern, fp))
      )
      if (matches && !this.skills.has(skill.name)) {
        this.skills.set(skill.name, skill)
        activated.push(skill)
      }
    }

    return activated
  }

  /** 获取技能数量 */
  get size(): number {
    return this.skills.size
  }

  /** 清空 */
  clear(): void {
    this.skills.clear()
    this.conditionalSkills = []
  }
}

/** 简化 glob 匹配 (仅支持 * 通配符) */
function globMatch(pattern: string, text: string): boolean {
  const regex = new RegExp(
    '^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$'
  )
  return regex.test(text)
}
