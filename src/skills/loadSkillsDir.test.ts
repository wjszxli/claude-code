import { join } from 'path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

type MockDirentKind = 'dir' | 'file' | 'symlink'

function makeDirent(name: string, kind: MockDirentKind = 'dir') {
  return {
    name,
    isDirectory: () => kind === 'dir',
    isSymbolicLink: () => kind === 'symlink',
  }
}

const mocks = vi.hoisted(() => {
  const state = {
    sessionId: 'session-123',
    additionalDirs: [] as string[],
    bareMode: false,
    restrictedSkills: false,
    settingsEnabled: {
      userSettings: true,
      projectSettings: true,
    } as Record<string, boolean>,
    claudeConfigHomeDir: '/home/test/.claude-home',
    managedFilePath: '/managed',
    projectDirs: [] as string[],
    markdownFilesForCommands: [] as any[],
    readdirMap: new Map<string, any[]>(),
    readFileMap: new Map<string, string>(),
    statSuccessPaths: new Set<string>(),
    gitignoredDirs: new Set<string>(),
    realpathMap: new Map<string, string>(),
  }

  const logForDebugging = vi.fn()
  const logError = vi.fn()
  const logEvent = vi.fn()
  const roughTokenCountEstimation = vi.fn((input: string) =>
    Math.round(input.length / 4),
  )
  const parseUserSpecifiedModel = vi.fn((model: string) => `parsed:${model}`)
  const executeShellCommandsInPrompt = vi.fn(async (content: string) =>
    `${content}\n[SHELL_EXECUTED]`,
  )
  const registerMCPSkillBuilders = vi.fn()
  const mockRealpath = vi.fn(async (path: string) => {
    const resolved = state.realpathMap.get(path)
    if (resolved === undefined) {
      const err = new Error('ENOENT') as NodeJS.ErrnoException
      err.code = 'ENOENT'
      throw err
    }
    return resolved
  })

  const fsImpl = {
    readdir: vi.fn(async (path: string) => state.readdirMap.get(path) ?? []),
    readFile: vi.fn(async (path: string) => {
      const content = state.readFileMap.get(path)
      if (content === undefined) {
        const err = new Error('ENOENT') as NodeJS.ErrnoException
        err.code = 'ENOENT'
        throw err
      }
      return content
    }),
    stat: vi.fn(async (path: string) => {
      if (!state.statSuccessPaths.has(path)) {
        const err = new Error('ENOENT') as NodeJS.ErrnoException
        err.code = 'ENOENT'
        throw err
      }
      return {} as any
    }),
  }

  return {
    state,
    fsImpl,
    logForDebugging,
    logError,
    logEvent,
    roughTokenCountEstimation,
    parseUserSpecifiedModel,
    executeShellCommandsInPrompt,
    registerMCPSkillBuilders,
    mockRealpath,
  }
})

vi.mock('../bootstrap/state.js', async () => {
  const actual = await vi.importActual<any>('../bootstrap/state.js')
  return {
    ...actual,
    getAdditionalDirectoriesForClaudeMd: () => mocks.state.additionalDirs,
    getSessionId: () => mocks.state.sessionId,
  }
})

vi.mock('../services/analytics/index.js', () => ({
  logEvent: mocks.logEvent,
}))

vi.mock('../services/tokenEstimation.js', () => ({
  roughTokenCountEstimation: mocks.roughTokenCountEstimation,
}))

vi.mock('../utils/debug.js', () => ({
  logForDebugging: mocks.logForDebugging,
}))

vi.mock('../utils/effort.js', () => ({
  EFFORT_LEVELS: ['low', 'medium', 'high', 'max'],
  parseEffortValue: (v: unknown) => {
    if (v === 'low' || v === 'medium' || v === 'high' || v === 'max') return v
    if (typeof v === 'number' && Number.isInteger(v)) return v
    return undefined
  },
}))

vi.mock('../utils/envUtils.js', () => ({
  getClaudeConfigHomeDir: () => mocks.state.claudeConfigHomeDir,
  isBareMode: () => mocks.state.bareMode,
  isEnvTruthy: (v: unknown) => v === true || v === 'true',
}))

vi.mock('../utils/errors.js', async () => {
  const actual = await vi.importActual<any>('../utils/errors.js')
  return {
    ...actual,
    isENOENT: (e: any) => e?.code === 'ENOENT',
    isFsInaccessible: () => false,
  }
})

vi.mock('../utils/fsOperations.js', () => ({
  getFsImplementation: () => mocks.fsImpl,
  getPathsForPermissionCheck: vi.fn(() => []),
}))

vi.mock('fs/promises', () => ({
  realpath: mocks.mockRealpath,
}))

vi.mock('../utils/git/gitignore.js', () => ({
  isPathGitignored: async (dir: string) => mocks.state.gitignoredDirs.has(dir),
}))

vi.mock('../utils/log.js', () => ({
  logError: mocks.logError,
}))

vi.mock('../utils/markdownConfigLoader.js', async () => {
  const actual = await vi.importActual<any>('../utils/markdownConfigLoader.js')
  return {
    ...actual,
    extractDescriptionFromMarkdown: (
      markdownContent: string,
      label: 'Skill' | 'Custom command',
    ) => `Extracted(${label}): ${markdownContent.slice(0, 20)}`,
    getProjectDirsUpToHome: () => mocks.state.projectDirs,
    loadMarkdownFilesForSubdir: vi.fn(
      async () => mocks.state.markdownFilesForCommands,
    ),
    parseSlashCommandToolsFromFrontmatter: (value: unknown) => {
      if (Array.isArray(value)) {
        return value.map(v => String(v))
      }
      if (typeof value === 'string') {
        return value
          .split(',')
          .map(v => v.trim())
          .filter(Boolean)
      }
      return []
    },
  }
})

vi.mock('../utils/model/model.js', async () => {
  const actual = await vi.importActual<any>('../utils/model/model.js')
  return {
    ...actual,
    parseUserSpecifiedModel: mocks.parseUserSpecifiedModel,
  }
})

vi.mock('../utils/promptShellExecution.js', () => ({
  executeShellCommandsInPrompt: mocks.executeShellCommandsInPrompt,
}))

vi.mock('../utils/settings/constants.js', async () => {
  const actual = await vi.importActual<any>('../utils/settings/constants.js')
  return {
    ...actual,
    isSettingSourceEnabled: (source: string) =>
      mocks.state.settingsEnabled[source] !== false,
  }
})

vi.mock('../utils/settings/managedPath.js', () => ({
  getManagedFilePath: () => mocks.state.managedFilePath,
}))

vi.mock('../utils/settings/pluginOnlyPolicy.js', () => ({
  isRestrictedToPluginOnly: (surface: string) =>
    surface === 'skills' ? mocks.state.restrictedSkills : false,
}))

vi.mock('../utils/settings/types.js', () => ({
  HooksSchema: () => ({
    safeParse: (v: any) =>
      v && typeof v === 'object' && v.__invalidHooks
        ? { success: false, error: { message: 'invalid hooks' } }
        : { success: true, data: v as any },
  }),
}))

vi.mock('./mcpSkillBuilders.js', () => ({
  registerMCPSkillBuilders: mocks.registerMCPSkillBuilders,
}))

// Note: Internal functions are imported for testing. They are exported
// for test purposes with __test__ prefix or directly.
import {
  activateConditionalSkillsForPaths,
  addSkillDirectories,
  buildNamespace,
  clearDynamicSkills,
  clearSkillCaches,
  createSkillCommand,
  discoverSkillDirsForPaths,
  estimateSkillFrontmatterTokens,
  getFileIdentity,
  getCommandDirCommands,
  getCommandName,
  getConditionalSkillCount,
  getDynamicSkills,
  getRegularCommandName,
  getSkillCommandName,
  getSkillDirCommands,
  getSkillsPath,
  isSkillFile,
  onDynamicSkillsLoaded,
  parseHooksFromFrontmatter,
  parseSkillFrontmatterFields,
  parseSkillPaths,
  transformSkillFiles,
} from './loadSkillsDir.js'

// Import internal functions for testing (they need to be exported)
// For now, we'll test through public APIs or add exports as needed

describe('loadSkillsDir.ts', () => {
  beforeEach(() => {
    clearSkillCaches()
    clearDynamicSkills()
    mocks.state.additionalDirs = []
    mocks.state.bareMode = false
    mocks.state.restrictedSkills = false
    mocks.state.settingsEnabled = { userSettings: true, projectSettings: true }
    mocks.state.projectDirs = []
    mocks.state.markdownFilesForCommands = []
    mocks.state.readdirMap.clear()
    mocks.state.readFileMap.clear()
    mocks.state.statSuccessPaths.clear()
    mocks.state.gitignoredDirs.clear()
    mocks.state.realpathMap.clear()
    mocks.logForDebugging.mockClear()
    mocks.logError.mockClear()
    mocks.logEvent.mockClear()
    mocks.roughTokenCountEstimation.mockClear()
    mocks.parseUserSpecifiedModel.mockClear()
    mocks.executeShellCommandsInPrompt.mockClear()
    mocks.mockRealpath.mockClear()
  })

  it('getSkillsPath: returns expected paths for each source', () => {
    expect(getSkillsPath('policySettings', 'skills')).toBe(
      '/managed/.claude/skills',
    )
    expect(getSkillsPath('userSettings', 'commands')).toBe(
      '/home/test/.claude-home/commands',
    )
    expect(getSkillsPath('projectSettings', 'skills')).toBe('.claude/skills')
    expect(getSkillsPath('plugin', 'skills')).toBe('plugin')
  })

  it('estimateSkillFrontmatterTokens: estimates based on name/description/whenToUse', () => {
    const skill = {
      name: 'lint',
      description: 'Run lint checks',
      whenToUse: 'Before commits',
    } as any
    const count = estimateSkillFrontmatterTokens(skill)
    expect(mocks.roughTokenCountEstimation).toHaveBeenCalledWith(
      'lint Run lint checks Before commits',
    )
    expect(count).toBe(Math.round('lint Run lint checks Before commits'.length / 4))
  })

  it('parseSkillFrontmatterFields: parses frontmatter with defaults and coercions', () => {
    const parsed = parseSkillFrontmatterFields(
      {
        name: 123,
        description: 'desc',
        'allowed-tools': 'Read,Write',
        'argument-hint': 'path',
        arguments: 'target mode',
        when_to_use: 'when needed',
        version: '1.0.0',
        model: 'haiku',
        'disable-model-invocation': 'true',
        'user-invocable': 'false',
        context: 'fork',
        agent: 'Bash',
        effort: 'high',
        shell: 'powershell',
      },
      'Body',
      'my-skill',
    )

    expect(parsed.displayName).toBe('123')
    expect(parsed.description).toBe('desc')
    expect(parsed.hasUserSpecifiedDescription).toBe(true)
    expect(parsed.allowedTools).toEqual(['Read', 'Write'])
    expect(parsed.argumentNames).toEqual(['target', 'mode'])
    expect(parsed.model).toBe('parsed:haiku')
    expect(mocks.parseUserSpecifiedModel).toHaveBeenCalledWith('haiku')
    expect(parsed.disableModelInvocation).toBe(true)
    expect(parsed.userInvocable).toBe(false)
    expect(parsed.executionContext).toBe('fork')
    expect(parsed.agent).toBe('Bash')
    expect(parsed.effort).toBe('high')
    expect(parsed.shell).toBe('powershell')
  })

  it('parseSkillFrontmatterFields: invalid effort and hooks are ignored with logging', () => {
    const parsed = parseSkillFrontmatterFields(
      {
        hooks: { __invalidHooks: true },
        effort: 'impossible',
      },
      'hello markdown',
      'x-skill',
    )
    expect(parsed.effort).toBeUndefined()
    expect(parsed.hooks).toBeUndefined()
    expect(mocks.logForDebugging).toHaveBeenCalled()
  })

  it('createSkillCommand/getPromptForCommand: applies substitutions and executes shell for non-mcp', async () => {
    const command = createSkillCommand({
      skillName: 'demo',
      displayName: 'Demo Skill',
      description: 'desc',
      hasUserSpecifiedDescription: true,
      markdownContent:
        'Arg:$ARGUMENTS\nIndex:$0\nDir:${CLAUDE_SKILL_DIR}\nSession:${CLAUDE_SESSION_ID}',
      allowedTools: ['Bash(git *)'],
      argumentHint: undefined,
      argumentNames: [],
      whenToUse: undefined,
      version: undefined,
      model: undefined,
      disableModelInvocation: false,
      userInvocable: true,
      source: 'userSettings',
      baseDir: '/repo/.claude/skills/demo',
      loadedFrom: 'skills',
      hooks: undefined,
      executionContext: 'inline',
      agent: undefined,
      paths: undefined,
      effort: undefined,
      shell: 'bash',
    })

    const result = await command.getPromptForCommand('hello world', {
      getAppState: () => ({
        toolPermissionContext: {
          alwaysAllowRules: {
            command: [],
          },
        },
      }),
    } as any)

    expect(command.userFacingName?.()).toBe('Demo Skill')
    expect(mocks.executeShellCommandsInPrompt).toHaveBeenCalledTimes(1)
    expect(result[0]?.type).toBe('text')
    expect(result[0]?.text).toContain('Session:session-123')
    expect(result[0]?.text).toContain('[SHELL_EXECUTED]')
  })

  it('createSkillCommand/getPromptForCommand: skips shell execution for mcp skills', async () => {
    const command = createSkillCommand({
      skillName: 'remote',
      displayName: undefined,
      description: 'desc',
      hasUserSpecifiedDescription: true,
      markdownContent: 'content',
      allowedTools: [],
      argumentHint: undefined,
      argumentNames: [],
      whenToUse: undefined,
      version: undefined,
      model: undefined,
      disableModelInvocation: false,
      userInvocable: true,
      source: 'mcp',
      baseDir: '/repo/.claude/skills/remote',
      loadedFrom: 'mcp',
      hooks: undefined,
      executionContext: 'inline',
      agent: undefined,
      paths: undefined,
      effort: undefined,
      shell: 'bash',
    })

    await command.getPromptForCommand('', {
      getAppState: () => ({
        toolPermissionContext: { alwaysAllowRules: { command: [] } },
      }),
    } as any)

    expect(mocks.executeShellCommandsInPrompt).not.toHaveBeenCalled()
  })

  it('transformSkillFiles: SKILL.md takes precedence over sibling markdown files', () => {
    const files = [
      {
        baseDir: '/repo/.claude/commands',
        filePath: '/repo/.claude/commands/build/SKILL.md',
        frontmatter: {},
        content: 'skill body',
        source: 'projectSettings',
      },
      {
        baseDir: '/repo/.claude/commands',
        filePath: '/repo/.claude/commands/build/other.md',
        frontmatter: {},
        content: 'other body',
        source: 'projectSettings',
      },
      {
        baseDir: '/repo/.claude/commands',
        filePath: '/repo/.claude/commands/plain.md',
        frontmatter: {},
        content: 'plain body',
        source: 'projectSettings',
      },
    ] as any[]

    const transformed = transformSkillFiles(files)
    expect(transformed.map(f => f.filePath)).toEqual([
      '/repo/.claude/commands/build/SKILL.md',
      '/repo/.claude/commands/plain.md',
    ])
  })

  it('discoverSkillDirsForPaths: discovers nested dirs only, skips gitignored, returns deepest-first', async () => {
    const dir1 = '/repo/a/b/.claude/skills'
    const dir2 = '/repo/a/.claude/skills'
    mocks.state.statSuccessPaths.add(dir1)
    mocks.state.statSuccessPaths.add(dir2)
    mocks.state.gitignoredDirs.add('/repo/a')

    const discovered = await discoverSkillDirsForPaths(
      ['/repo/a/b/file.ts', '/repo/a/c/file2.ts'],
      '/repo',
    )

    // /repo/a/.claude/skills is gitignored via currentDir=/repo/a
    expect(discovered).toEqual([dir1])
  })

  it('addSkillDirectories/getDynamicSkills: deeper directories override shallower duplicates', async () => {
    const deep = '/repo/packages/app/.claude/skills'
    const shallow = '/repo/packages/.claude/skills'

    mocks.state.readdirMap.set(deep, [makeDirent('lint', 'dir')])
    mocks.state.readdirMap.set(shallow, [makeDirent('lint', 'dir')])

    mocks.state.readFileMap.set(
      join(deep, 'lint', 'SKILL.md'),
      '---\ndescription: deep skill\n---\ndeep content',
    )
    mocks.state.readFileMap.set(
      join(shallow, 'lint', 'SKILL.md'),
      '---\ndescription: shallow skill\n---\nshallow content',
    )

    await addSkillDirectories([deep, shallow])

    const dynamic = getDynamicSkills().filter(s => s.type === 'prompt') as any[]
    expect(dynamic).toHaveLength(1)
    expect(dynamic[0]?.name).toBe('lint')
    // skillRoot is the directory containing SKILL.md
    expect(dynamic[0]?.skillRoot).toBe(join(deep, 'lint'))
    expect(dynamic[0]?.description).toBe('deep skill')
  })

  it('onDynamicSkillsLoaded: listener errors are caught and do not break other listeners', async () => {
    const deep = '/repo/project/.claude/skills'
    mocks.state.readdirMap.set(deep, [makeDirent('demo', 'dir')])
    mocks.state.readFileMap.set(join(deep, 'demo', 'SKILL.md'), 'demo content')

    const ok = vi.fn()
    const bad = vi.fn(() => {
      throw new Error('listener failed')
    })

    const unsubOk = onDynamicSkillsLoaded(ok)
    onDynamicSkillsLoaded(bad)

    await addSkillDirectories([deep])
    expect(ok).toHaveBeenCalledTimes(1)
    expect(mocks.logError).toHaveBeenCalled()

    unsubOk()
    await addSkillDirectories([deep])
    expect(ok).toHaveBeenCalledTimes(1)
  })

  it('getSkillDirCommands + activateConditionalSkillsForPaths: conditional skills are activated by matching files', async () => {
    const userSkillsDir = join(mocks.state.claudeConfigHomeDir, 'skills')
    mocks.state.readdirMap.set(userSkillsDir, [makeDirent('cond', 'dir')])
    mocks.state.readFileMap.set(
      join(userSkillsDir, 'cond', 'SKILL.md'),
      '---\npaths: src/**\ndescription: conditional\n---\nrun when src touched',
    )

    const initial = await getSkillDirCommands('/repo')
    expect(initial).toEqual([])
    expect(getConditionalSkillCount()).toBe(1)

    const activated = activateConditionalSkillsForPaths(['src/main.ts'], '/repo')
    expect(activated).toEqual(['cond'])
    expect(getConditionalSkillCount()).toBe(0)
    expect(getDynamicSkills().map(s => s.name)).toContain('cond')
  })

  it('getSkillDirCommands: bare mode only loads from explicit additional dirs', async () => {
    mocks.state.bareMode = true
    mocks.state.additionalDirs = ['/extra']
    const bareDir = '/extra/.claude/skills'
    mocks.state.readdirMap.set(bareDir, [makeDirent('s1', 'dir')])
    mocks.state.readFileMap.set(join(bareDir, 's1', 'SKILL.md'), 'only bare')

    const commands = await getSkillDirCommands('/repo')
    expect(commands.map(c => c.name)).toEqual(['s1'])

    // backwards-compatible alias points to same memoized function
    const viaAlias = await getCommandDirCommands('/repo')
    expect(viaAlias.map(c => c.name)).toEqual(['s1'])
  })

  // ========================================
  // Namespace Building Tests
  // ========================================

  describe('buildNamespace', () => {
    it('returns empty string when targetDir equals baseDir', () => {
      expect(buildNamespace('/repo/.claude/commands', '/repo/.claude/commands')).toBe('')
    })

    it('returns empty string when targetDir equals baseDir with trailing separator', () => {
      expect(buildNamespace('/repo/.claude/commands', '/repo/.claude/commands/')).toBe('')
    })

    it('builds single-level namespace', () => {
      expect(buildNamespace('/repo/.claude/commands/build', '/repo/.claude/commands')).toBe('build')
    })

    it('builds multi-level namespace with colons', () => {
      expect(buildNamespace('/repo/.claude/commands/deploy/prod', '/repo/.claude/commands')).toBe('deploy:prod')
    })

    it('handles mixed path separators', () => {
      expect(buildNamespace('/repo/.claude/commands/a/b/c', '/repo/.claude/commands')).toBe('a:b:c')
    })
  })

  describe('isSkillFile', () => {
    it('returns true for SKILL.md', () => {
      expect(isSkillFile('/path/to/SKILL.md')).toBe(true)
    })

    it('returns true for skill.md (lowercase)', () => {
      expect(isSkillFile('/path/to/skill.md')).toBe(true)
    })

    it('returns true for Skill.md (mixed case)', () => {
      expect(isSkillFile('/path/to/Skill.md')).toBe(true)
    })

    it('returns false for other .md files', () => {
      expect(isSkillFile('/path/to/build.md')).toBe(false)
      expect(isSkillFile('/path/to/deploy.md')).toBe(false)
    })

    it('returns false for non-.md files', () => {
      expect(isSkillFile('/path/to/SKILL.txt')).toBe(false)
      expect(isSkillFile('/path/to/skill')).toBe(false)
    })
  })

  describe('getSkillCommandName', () => {
    it('returns base name for skills at commands root', () => {
      expect(getSkillCommandName('/repo/.claude/commands/build/SKILL.md', '/repo/.claude/commands')).toBe('build')
    })

    it('returns namespaced name for nested skills', () => {
      expect(getSkillCommandName('/repo/.claude/commands/deploy/prod/SKILL.md', '/repo/.claude/commands')).toBe('deploy:prod')
    })

    it('handles deeply nested skills', () => {
      expect(getSkillCommandName('/repo/.claude/commands/a/b/c/SKILL.md', '/repo/.claude/commands')).toBe('a:b:c')
    })
  })

  describe('getRegularCommandName', () => {
    it('returns base name for commands at root', () => {
      expect(getRegularCommandName('/repo/.claude/commands/build.md', '/repo/.claude/commands')).toBe('build')
    })

    it('returns namespaced name for nested commands', () => {
      expect(getRegularCommandName('/repo/.claude/commands/deploy/prod.md', '/repo/.claude/commands')).toBe('deploy:prod')
    })

    it('strips .md extension', () => {
      expect(getRegularCommandName('/repo/.claude/commands/test.md', '/repo/.claude/commands')).toBe('test')
    })
  })

  describe('getCommandName', () => {
    it('uses skill naming for SKILL.md files', () => {
      const file = {
        filePath: '/repo/.claude/commands/build/SKILL.md',
        baseDir: '/repo/.claude/commands',
        frontmatter: {},
        content: '',
        source: 'projectSettings',
      }
      expect(getCommandName(file as any)).toBe('build')
    })

    it('uses regular naming for .md files', () => {
      const file = {
        filePath: '/repo/.claude/commands/deploy.md',
        baseDir: '/repo/.claude/commands',
        frontmatter: {},
        content: '',
        source: 'projectSettings',
      }
      expect(getCommandName(file as any)).toBe('deploy')
    })

    it('handles case-insensitive SKILL.md', () => {
      const file = {
        filePath: '/repo/.claude/commands/test/skill.md',
        baseDir: '/repo/.claude/commands',
        frontmatter: {},
        content: '',
        source: 'projectSettings',
      }
      expect(getCommandName(file as any)).toBe('test')
    })
  })

  // ========================================
  // Hooks Parsing Tests
  // ========================================

  describe('parseHooksFromFrontmatter', () => {
    it('returns undefined when hooks not defined', () => {
      const result = parseHooksFromFrontmatter({}, 'test-skill')
      expect(result).toBeUndefined()
    })

    it('returns undefined when hooks is null', () => {
      const result = parseHooksFromFrontmatter({ hooks: null }, 'test-skill')
      expect(result).toBeUndefined()
    })

    it('returns parsed hooks when valid', () => {
      const hooks = {
        hooks: [
          { type: 'command', command: 'echo test' },
        ],
      }
      const result = parseHooksFromFrontmatter(hooks as any, 'test-skill')
      expect(result).toEqual(hooks.hooks)
      expect(result).toHaveLength(1)
    })

    it('returns undefined and logs when hooks are invalid', () => {
      const hooks = { hooks: { __invalidHooks: true } }
      const result = parseHooksFromFrontmatter(hooks as any, 'test-skill')
      expect(result).toBeUndefined()
      expect(mocks.logForDebugging).toHaveBeenCalledWith(
        expect.stringContaining('Invalid hooks'),
      )
    })
  })

  // ========================================
  // Skill Paths Parsing Tests
  // ========================================

  describe('parseSkillPaths', () => {
    it('returns undefined when paths not defined', () => {
      const result = parseSkillPaths({})
      expect(result).toBeUndefined()
    })

    it('parses single path pattern', () => {
      const result = parseSkillPaths({ paths: 'src/**/*.ts' })
      expect(result).toEqual(['src/**/*.ts'])
    })

    it('parses array of paths', () => {
      const result = parseSkillPaths({ paths: ['src/**/*.ts', 'tests/**/*.test.ts'] })
      expect(result).toEqual(['src/**/*.ts', 'tests/**/*.test.ts'])
    })

    it('removes /** suffix from patterns', () => {
      const result = parseSkillPaths({ paths: 'src/**' })
      expect(result).toEqual(['src'])
    })

    it('handles array with /** suffixes', () => {
      const result = parseSkillPaths({ paths: ['src/**', 'tests/**'] })
      expect(result).toEqual(['src', 'tests'])
    })

    it('returns undefined for match-all patterns', () => {
      expect(parseSkillPaths({ paths: '**' })).toBeUndefined()
      expect(parseSkillPaths({ paths: ['**'] })).toBeUndefined()
      expect(parseSkillPaths({ paths: ['**', '**'] })).toBeUndefined()
    })

    it('filters empty patterns', () => {
      const result = parseSkillPaths({ paths: 'src/**' })
      expect(result).toEqual(['src'])
    })

    it('handles mixed valid and invalid patterns', () => {
      const result = parseSkillPaths({ paths: ['src/**', 'tests'] })
      expect(result).toEqual(['src', 'tests'])
    })
  })

  // ========================================
  // File Identity Tests
  // ========================================

  describe('getFileIdentity', () => {
    it('returns canonical path for existing files', async () => {
      mocks.state.realpathMap.set('/existing/file.md', '/resolved/path/to/file.md')
      const result = await getFileIdentity('/existing/file.md')
      expect(result).toBe('/resolved/path/to/file.md')
    })

    it('returns null for non-existent files', async () => {
      const result = await getFileIdentity('/non/existent/file.md')
      expect(result).toBeNull()
    })

    it('handles symlink resolution', async () => {
      mocks.state.realpathMap.set('/symlink/file.md', '/real/path/to/file.md')
      const result = await getFileIdentity('/symlink/file.md')
      expect(result).toBe('/real/path/to/file.md')
    })
  })

  // ========================================
  // Conditional Skills Activation Tests
  // ========================================

  describe('activateConditionalSkillsForPaths (additional cases)', () => {
    beforeEach(() => {
      clearDynamicSkills()
    })

    it('handles absolute paths by making them relative to cwd', async () => {
      // Setup: load a conditional skill
      const userSkillsDir = join(mocks.state.claudeConfigHomeDir, 'skills')
      mocks.state.readdirMap.set(userSkillsDir, [makeDirent('doc-skill', 'dir')])
      mocks.state.readFileMap.set(
        join(userSkillsDir, 'doc-skill', 'SKILL.md'),
        '---\npaths: docs/**/*.md\ndescription: doc skill\n---\ncontent',
      )

      await getSkillDirCommands('/repo')
      expect(getConditionalSkillCount()).toBe(1)

      const result = activateConditionalSkillsForPaths(['/repo/docs/readme.md'], '/repo')
      expect(result).toContain('doc-skill')
    })

    it('skips paths outside cwd (with ..)', async () => {
      const userSkillsDir = join(mocks.state.claudeConfigHomeDir, 'skills')
      mocks.state.readdirMap.set(userSkillsDir, [makeDirent('test-skill', 'dir')])
      mocks.state.readFileMap.set(
        join(userSkillsDir, 'test-skill', 'SKILL.md'),
        '---\npaths: **/*.ts\ndescription: test skill\n---\ncontent',
      )

      await getSkillDirCommands('/repo')

      const result = activateConditionalSkillsForPaths(['../other/file.ts'], '/repo')
      expect(result).toEqual([])
    })

    it('activates multiple skills for same file', async () => {
      const userSkillsDir = join(mocks.state.claudeConfigHomeDir, 'skills')
      mocks.state.readdirMap.set(userSkillsDir, [
        makeDirent('ts-skill', 'dir'),
        makeDirent('src-skill', 'dir'),
      ])
      mocks.state.readFileMap.set(
        join(userSkillsDir, 'ts-skill', 'SKILL.md'),
        '---\npaths: src/**/*.ts\ndescription: ts skill\n---\ncontent',
      )
      mocks.state.readFileMap.set(
        join(userSkillsDir, 'src-skill', 'SKILL.md'),
        '---\npaths: src/**\ndescription: src skill\n---\ncontent',
      )

      await getSkillDirCommands('/repo')

      const result = activateConditionalSkillsForPaths(['src/main.ts'], '/repo')
      expect(result).toContain('ts-skill')
      expect(result).toContain('src-skill')
    })
  })

  // ========================================
  // Dynamic Skills Discovery Tests
  // ========================================

  describe('discoverSkillDirsForPaths', () => {
    beforeEach(() => {
      clearDynamicSkills()
    })

    it('returns empty array when no skills dirs exist', async () => {
      const result = await discoverSkillDirsForPaths(['/repo/src/file.ts'], '/repo')
      expect(result).toEqual([])
    })

    it('discovers skills dir adjacent to file', async () => {
      const skillDir = '/repo/src/.claude/skills'
      mocks.state.statSuccessPaths.add(skillDir)

      const result = await discoverSkillDirsForPaths(['/repo/src/file.ts'], '/repo')
      expect(result).toContain(skillDir)
    })

    it('discovers nested skills dirs', async () => {
      const skillDir = '/repo/packages/app/.claude/skills'
      mocks.state.statSuccessPaths.add(skillDir)

      const result = await discoverSkillDirsForPaths(['/repo/packages/app/src/file.ts'], '/repo')
      expect(result).toContain(skillDir)
    })

    it('returns results sorted deepest first', async () => {
      // Note: cwd-level skills are not discovered (loaded at startup), so we use subdirectories
      const shallow = '/repo/packages/.claude/skills'
      const deep = '/repo/packages/app/.claude/skills'
      mocks.state.statSuccessPaths.add(shallow)
      mocks.state.statSuccessPaths.add(deep)

      const result = await discoverSkillDirsForPaths(
        ['/repo/packages/file.ts', '/repo/packages/app/file.ts'],
        '/repo',
      )
      expect(result[0]).toBe(deep)
      expect(result[1]).toBe(shallow)
    })

    it('does not discover dirs at cwd level (loaded at startup)', async () => {
      const cwdSkillDir = '/repo/.claude/skills'
      mocks.state.statSuccessPaths.add(cwdSkillDir)

      const result = await discoverSkillDirsForPaths(['/repo/.claude/skills/file.ts'], '/repo')
      expect(result).not.toContain(cwdSkillDir)
    })

    it('skips gitignored directories', async () => {
      const skillDir = '/repo/node_modules/pkg/.claude/skills'
      mocks.state.statSuccessPaths.add(skillDir)
      mocks.state.gitignoredDirs.add('/repo/node_modules/pkg')

      const result = await discoverSkillDirsForPaths(['/repo/node_modules/pkg/file.ts'], '/repo')
      expect(result).not.toContain(skillDir)
    })

    it('avoids re-checking the same path', async () => {
      const skillDir = '/repo/src/.claude/skills'
      mocks.state.statSuccessPaths.add(skillDir)

      // First call - discovers the skill dir
      const result1 = await discoverSkillDirsForPaths(['/repo/src/file.ts'], '/repo')
      expect(result1).toContain(skillDir)
      expect(mocks.fsImpl.stat).toHaveBeenCalledTimes(1)

      // Second call with same file - should not re-stat (path already in dynamicSkillDirs)
      const result2 = await discoverSkillDirsForPaths(['/repo/src/file.ts'], '/repo')
      // stat count should still be 1, not 2
      expect(mocks.fsImpl.stat).toHaveBeenCalledTimes(1)
      // Second call returns empty array since dir was already discovered
      expect(result2).toEqual([])
    })
  })

  // ========================================
  // Add Skill Directories Tests
  // ========================================

  describe('addSkillDirectories', () => {
    beforeEach(() => {
      clearDynamicSkills()
    })

    it('returns early when projectSettings disabled', async () => {
      mocks.state.settingsEnabled.projectSettings = false
      await addSkillDirectories(['/repo/.claude/skills'])
      expect(mocks.fsImpl.readdir).not.toHaveBeenCalled()
    })

    it('returns early when restricted to plugin only', async () => {
      mocks.state.restrictedSkills = true
      await addSkillDirectories(['/repo/.claude/skills'])
      expect(mocks.fsImpl.readdir).not.toHaveBeenCalled()
    })

    it('returns early when no directories provided', async () => {
      await addSkillDirectories([])
      expect(mocks.fsImpl.readdir).not.toHaveBeenCalled()
    })

    it('loads skills from directories', async () => {
      const skillDir = '/repo/.claude/skills'
      mocks.state.readdirMap.set(skillDir, [makeDirent('test', 'dir')])
      mocks.state.readFileMap.set(join(skillDir, 'test', 'SKILL.md'), 'test skill')

      await addSkillDirectories([skillDir])
      expect(getDynamicSkills().map(s => s.name)).toContain('test')
    })

    it('logs analytics event when skills are added', async () => {
      const skillDir = '/repo/.claude/skills'
      mocks.state.readdirMap.set(skillDir, [makeDirent('new-skill', 'dir')])
      mocks.state.readFileMap.set(join(skillDir, 'new-skill', 'SKILL.md'), 'content')

      await addSkillDirectories([skillDir])
      expect(mocks.logEvent).toHaveBeenCalledWith('tengu_dynamic_skills_changed', expect.objectContaining({
        source: 'file_operation',
      }))
    })
  })

  // ========================================
  // Transform Skill Files Tests
  // ========================================

  describe('transformSkillFiles', () => {
    it('logs warning when multiple skill files in same directory', () => {
      const files = [
        {
          baseDir: '/repo/.claude/commands',
          filePath: '/repo/.claude/commands/build/SKILL.md',
          frontmatter: {},
          content: 'skill 1',
          source: 'projectSettings',
        },
        {
          baseDir: '/repo/.claude/commands',
          filePath: '/repo/.claude/commands/build/skill.md',
          frontmatter: {},
          content: 'skill 2',
          source: 'projectSettings',
        },
      ] as any[]

      const transformed = transformSkillFiles(files)
      expect(transformed).toHaveLength(1)
      expect(mocks.logForDebugging).toHaveBeenCalledWith(
        expect.stringContaining('Multiple skill files'),
      )
    })

    it('preserves non-skill files', () => {
      const files = [
        {
          baseDir: '/repo/.claude/commands',
          filePath: '/repo/.claude/commands/build.md',
          frontmatter: {},
          content: 'build command',
          source: 'projectSettings',
        },
        {
          baseDir: '/repo/.claude/commands',
          filePath: '/repo/.claude/commands/deploy.md',
          frontmatter: {},
          content: 'deploy command',
          source: 'projectSettings',
        },
      ] as any[]

      const transformed = transformSkillFiles(files)
      expect(transformed).toHaveLength(2)
    })
  })

  // ========================================
  // Create Skill Command Tests
  // ========================================

  describe('createSkillCommand', () => {
    it('sets isHidden when userInvocable is false', () => {
      const command = createSkillCommand({
        skillName: 'internal',
        displayName: undefined,
        description: 'internal skill',
        hasUserSpecifiedDescription: true,
        markdownContent: 'content',
        allowedTools: [],
        argumentHint: undefined,
        argumentNames: [],
        whenToUse: undefined,
        version: undefined,
        model: undefined,
        disableModelInvocation: false,
        userInvocable: false,
        source: 'userSettings',
        baseDir: undefined,
        loadedFrom: 'skills',
        hooks: undefined,
        executionContext: undefined,
        agent: undefined,
        paths: undefined,
        effort: undefined,
        shell: undefined,
      })

      expect(command.isHidden).toBe(true)
    })

    it('includes baseDir in prompt when provided', async () => {
      const command = createSkillCommand({
        skillName: 'test',
        displayName: undefined,
        description: 'test',
        hasUserSpecifiedDescription: true,
        markdownContent: 'body',
        allowedTools: [],
        argumentHint: undefined,
        argumentNames: [],
        whenToUse: undefined,
        version: undefined,
        model: undefined,
        disableModelInvocation: false,
        userInvocable: true,
        source: 'userSettings',
        baseDir: '/repo/.claude/skills/test',
        loadedFrom: 'skills',
        hooks: undefined,
        executionContext: undefined,
        agent: undefined,
        paths: undefined,
        effort: undefined,
        shell: undefined,
      })

      const result = await command.getPromptForCommand('', {
        getAppState: () => ({
          toolPermissionContext: { alwaysAllowRules: { command: [] } },
        }),
      } as any)

      expect(result[0]?.text).toContain('Base directory for this skill:')
    })

    it('normalizes backslashes to forward slashes on Windows for CLAUDE_SKILL_DIR', async () => {
      const originalPlatform = process.platform
      Object.defineProperty(process, 'platform', { value: 'win32', writable: true })

      const command = createSkillCommand({
        skillName: 'test',
        displayName: undefined,
        description: 'test',
        hasUserSpecifiedDescription: true,
        markdownContent: '${CLAUDE_SKILL_DIR}/script.sh',
        allowedTools: [],
        argumentHint: undefined,
        argumentNames: [],
        whenToUse: undefined,
        version: undefined,
        model: undefined,
        disableModelInvocation: false,
        userInvocable: true,
        source: 'userSettings',
        baseDir: 'C:\\repo\\skills\\test',
        loadedFrom: 'skills',
        hooks: undefined,
        executionContext: undefined,
        agent: undefined,
        paths: undefined,
        effort: undefined,
        shell: undefined,
      })

      const result = await command.getPromptForCommand('', {
        getAppState: () => ({
          toolPermissionContext: { alwaysAllowRules: { command: [] } },
        }),
      } as any)

      expect(result[0]?.text).toContain('C:/repo/skills/test/script.sh')

      Object.defineProperty(process, 'platform', { value: originalPlatform, writable: true })
    })
  })

  // ========================================
  // Parse Skill Frontmatter Fields Tests
  // ========================================

  describe('parseSkillFrontmatterFields (additional cases)', () => {
    it('uses extractDescriptionFromMarkdown when description not specified', () => {
      const parsed = parseSkillFrontmatterFields(
        {},
        '# My Skill\nThis is a skill description',
        'test-skill',
      )

      expect(parsed.description).toContain('My Skill')
      expect(parsed.hasUserSpecifiedDescription).toBe(false)
    })

    it('parses model=inherit as undefined', () => {
      const parsed = parseSkillFrontmatterFields(
        { model: 'inherit' },
        'content',
        'test',
      )

      expect(parsed.model).toBeUndefined()
      expect(mocks.parseUserSpecifiedModel).not.toHaveBeenCalled()
    })

    it('defaults userInvocable to true when not specified', () => {
      const parsed = parseSkillFrontmatterFields({}, 'content', 'test')
      expect(parsed.userInvocable).toBe(true)
    })

    it('parses effort as integer', () => {
      const parsed = parseSkillFrontmatterFields({ effort: 5 }, 'content', 'test')
      expect(parsed.effort).toBe(5)
    })

    it('handles array format for allowed-tools', () => {
      const parsed = parseSkillFrontmatterFields(
        { 'allowed-tools': ['Read', 'Write', 'Edit'] },
        'content',
        'test',
      )

      expect(parsed.allowedTools).toEqual(['Read', 'Write', 'Edit'])
    })

    it('handles comma-separated string for allowed-tools', () => {
      const parsed = parseSkillFrontmatterFields(
        { 'allowed-tools': 'Read, Write, Edit' },
        'content',
        'test',
      )

      expect(parsed.allowedTools).toEqual(['Read', 'Write', 'Edit'])
    })

    it('returns empty array for invalid allowed-tools', () => {
      const parsed = parseSkillFrontmatterFields(
        { 'allowed-tools': null },
        'content',
        'test',
      )

      expect(parsed.allowedTools).toEqual([])
    })

    it('parses arguments as array', () => {
      const parsed = parseSkillFrontmatterFields(
        { arguments: ['file', 'mode'] },
        'content',
        'test',
      )

      expect(parsed.argumentNames).toEqual(['file', 'mode'])
    })

    it('parses arguments as space-separated string', () => {
      const parsed = parseSkillFrontmatterFields(
        { arguments: 'file mode' },
        'content',
        'test',
      )

      expect(parsed.argumentNames).toEqual(['file', 'mode'])
    })

    it('only sets executionContext to fork when context=fork', () => {
      const forkParsed = parseSkillFrontmatterFields(
        { context: 'fork' },
        'content',
        'test',
      )
      expect(forkParsed.executionContext).toBe('fork')

      const inlineParsed = parseSkillFrontmatterFields(
        { context: 'inline' },
        'content',
        'test',
      )
      expect(inlineParsed.executionContext).toBeUndefined()
    })
  })

  // ========================================
  // Get Skills Path Tests (additional)
  // ========================================

  describe('getSkillsPath (edge cases)', () => {
    it('returns empty string for unknown source', () => {
      expect(getSkillsPath('unknown' as any, 'skills')).toBe('')
    })
  })

  // ========================================
  // Clear Caches Tests
  // ========================================

  describe('clearSkillCaches and clearDynamicSkills', () => {
    it('clearSkillCaches clears conditional skills', async () => {
      // Setup
      const userSkillsDir = join(mocks.state.claudeConfigHomeDir, 'skills')
      mocks.state.readdirMap.set(userSkillsDir, [makeDirent('cond', 'dir')])
      mocks.state.readFileMap.set(
        join(userSkillsDir, 'cond', 'SKILL.md'),
        '---\npaths: src/**\ndescription: conditional\n---\ncontent',
      )

      await getSkillDirCommands('/repo')
      expect(getConditionalSkillCount()).toBe(1)

      clearSkillCaches()
      expect(getConditionalSkillCount()).toBe(0)
    })

    it('clearDynamicSkills clears dynamic skill state', async () => {
      const deep = '/repo/project/.claude/skills'
      mocks.state.readdirMap.set(deep, [makeDirent('dynamic', 'dir')])
      mocks.state.readFileMap.set(join(deep, 'dynamic', 'SKILL.md'), 'content')

      await addSkillDirectories([deep])
      expect(getDynamicSkills()).toHaveLength(1)

      clearDynamicSkills()
      expect(getDynamicSkills()).toHaveLength(0)
    })
  })

  // ========================================
  // Estimate Tokens Tests (additional)
  // ========================================

  describe('estimateSkillFrontmatterTokens (edge cases)', () => {
    it('handles undefined values in skill', () => {
      const skill = {
        name: undefined,
        description: undefined,
        whenToUse: undefined,
      } as any
      const count = estimateSkillFrontmatterTokens(skill)
      expect(count).toBe(0)
    })

    it('only includes defined fields', () => {
      const skill = {
        name: 'test',
        description: undefined,
        whenToUse: 'when needed',
      } as any
      estimateSkillFrontmatterTokens(skill)
      expect(mocks.roughTokenCountEstimation).toHaveBeenCalledWith('test when needed')
    })
  })
})
