/**
 * 工具注册表 — 组装所有工具
 * 简化自 src/tools.ts (原文件 390 行)
 *
 * 对应源码中的 getAllBaseTools() + assembleToolPool()
 */

import type { Tool, Tools } from '../core/tool.js'
import { EchoTool } from './echo.js'
import { BashTool } from './bash.js'
import { FileReadTool } from './fileRead.js'
import { FileEditTool } from './fileEdit.js'
import { FileWriteTool } from './fileWrite.js'
import { GlobTool } from './glob.js'
import { GrepTool } from './grep.js'

/** 获取所有内置工具 */
export function getAllBaseTools(): Tools {
  return [
    BashTool,
    FileReadTool,
    FileEditTool,
    FileWriteTool,
    GlobTool,
    GrepTool,
    EchoTool,
  ]
}

/**
 * 组装完整工具池 = 内置工具 + MCP 工具
 *
 * 对应源码 assembleToolPool():
 *   1. 获取内置工具
 *   2. 过滤被拒绝的工具
 *   3. 按名称排序 (缓存稳定性)
 *   4. 内置工具优先 (同名覆盖 MCP 工具)
 *   5. 去重
 */
export function assembleToolPool(
  builtInTools: Tools,
  mcpTools: Tools = [],
  denyList: string[] = [],
): Tools {
  const denied = new Set(denyList)

  // 过滤被拒绝的工具
  const allowed = builtInTools.filter(t => !denied.has(t.name))
  const allowedMcp = mcpTools.filter(t => !denied.has(t.name))

  // 排序 + 去重 (内置优先)
  const byName = (a: Tool, b: Tool) => a.name.localeCompare(b.name)
  const seen = new Set<string>()
  const result: Tool[] = []

  for (const tool of [...allowed].sort(byName)) {
    if (!seen.has(tool.name)) {
      seen.add(tool.name)
      result.push(tool)
    }
  }

  for (const tool of allowedMcp.sort(byName)) {
    if (!seen.has(tool.name)) {
      seen.add(tool.name)
      result.push(tool)
    }
  }

  return result
}
