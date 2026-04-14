/**
 * Skills System Tests
 * 验证 frontmatter 解析、技能注册、条件激活
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  parseFrontmatter,
  createSkillFromMarkdown,
  SkillRegistry,
} from '../../skills/loader.js'

describe('skills/loader', () => {
  describe('parseFrontmatter', () => {
    it('parses simple key-value pairs', () => {
      const md = `---
name: my-skill
description: A test skill
---
Do something useful`
      const { frontmatter, body } = parseFrontmatter(md)
      expect(frontmatter.name).toBe('my-skill')
      expect(frontmatter.description).toBe('A test skill')
      expect(body.trim()).toBe('Do something useful')
    })

    it('parses list values', () => {
      const md = `---
name: list-skill
allowedTools:
  - Read
  - Grep
  - Glob
---
Content`
      const { frontmatter } = parseFrontmatter(md)
      expect(frontmatter.allowedTools).toEqual(['Read', 'Grep', 'Glob'])
    })

    it('parses inline array', () => {
      const md = `---
name: inline-skill
allowedTools: [Read, Grep]
---
Content`
      const { frontmatter } = parseFrontmatter(md)
      expect(frontmatter.allowedTools).toEqual(['Read', 'Grep'])
    })

    it('parses boolean values', () => {
      const md = `---
name: bool-skill
userInvocable: false
---
Content`
      const { frontmatter } = parseFrontmatter(md)
      expect(frontmatter.userInvocable).toBe(false)
    })

    it('returns empty frontmatter for no-YAML content', () => {
      const md = 'Just plain content'
      const { frontmatter, body } = parseFrontmatter(md)
      expect(frontmatter).toEqual({})
      expect(body).toBe('Just plain content')
    })
  })

  describe('createSkillFromMarkdown', () => {
    it('creates skill from markdown with frontmatter', () => {
      const md = `---
name: test-skill
description: Test description
allowedTools: [Read]
---
# Test Skill
This is the content.`
      const skill = createSkillFromMarkdown(md, '/path/test-skill.md', 'project')
      expect(skill.name).toBe('test-skill')
      expect(skill.description).toBe('Test description')
      expect(skill.allowedTools).toEqual(['Read'])
      expect(skill.source).toBe('project')
      expect(skill.content).toContain('This is the content')
    })

    it('derives name from file path when not specified', () => {
      const skill = createSkillFromMarkdown('Just content', '/path/my-awesome-skill.md', 'user')
      expect(skill.name).toBe('my-awesome-skill')
    })
  })

  describe('SkillRegistry', () => {
    let registry: SkillRegistry

    beforeEach(() => {
      registry = new SkillRegistry()
    })

    it('registers and retrieves skills', () => {
      const skill = createSkillFromMarkdown(
        '---\nname: hello\n---\nContent',
        '/hello.md',
        'user',
      )
      registry.register(skill)
      expect(registry.get('hello')).toBe(skill)
    })

    it('getAll returns user-invocable skills', () => {
      registry.register(createSkillFromMarkdown(
        '---\nname: visible\nuserInvocable: true\n---\nA',
        '/a.md',
        'user',
      ))
      registry.register(createSkillFromMarkdown(
        '---\nname: hidden\nuserInvocable: false\n---\nB',
        '/b.md',
        'user',
      ))
      expect(registry.getAll()).toHaveLength(1)
      expect(registry.getAll()[0]!.name).toBe('visible')
    })

    it('first-registered wins on name collision', () => {
      registry.register(createSkillFromMarkdown(
        '---\nname: skill-x\n---\nFirst',
        '/first.md',
        'user',
      ))
      registry.register(createSkillFromMarkdown(
        '---\nname: skill-x\n---\nSecond',
        '/second.md',
        'project',
      ))
      expect(registry.get('skill-x')?.content).toBe('First')
    })

    it('activates conditional skills by file path', () => {
      registry.register(createSkillFromMarkdown(
        '---\nname: ts-skill\npaths: ["*.ts", "*.tsx"]\n---\nTS skill content',
        '/ts.md',
        'project',
      ))

      const activated = registry.activateForPaths(['src/index.ts'])
      expect(activated).toHaveLength(1)
      expect(activated[0]!.name).toBe('ts-skill')
    })

    it('does not activate for non-matching paths', () => {
      registry.register(createSkillFromMarkdown(
        '---\nname: py-skill\npaths: ["*.py"]\n---\nPython skill',
        '/py.md',
        'project',
      ))

      const activated = registry.activateForPaths(['src/index.ts'])
      expect(activated).toHaveLength(0)
    })

    it('clear removes all skills', () => {
      registry.register(createSkillFromMarkdown(
        '---\nname: x\n---\nX',
        '/x.md',
        'user',
      ))
      expect(registry.size).toBe(1)
      registry.clear()
      expect(registry.size).toBe(0)
    })
  })
})
