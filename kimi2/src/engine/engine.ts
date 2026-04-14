/**
 * Query Engine 实现 - LLM 调用循环简化版
 * 对应原项目：QueryEngine.ts
 */

import type { EngineConfig, Message, QueryResponse, ToolCall, ToolResult } from './types.js'
import type { Tool } from '../tools/types.js'

type QueryOptions = {
  allowToolErrors?: boolean
}

export class QueryEngine {
  private tools = new Map<string, Tool<any, any>>()
  private history: Message[] = []
  private systemPrompt = ''
  private config: EngineConfig
  private tokenUsage = { totalTokens: 0, promptTokens: 0, completionTokens: 0 }

  constructor(config?: Partial<EngineConfig>) {
    this.config = {
      maxTurns: config?.maxTurns ?? 10,
      timeout: config?.timeout ?? 30000,
    }
  }

  registerTool(tool: Tool<any, any>): void {
    this.tools.set(tool.name, tool)
  }

  setSystemPrompt(prompt: string): void {
    this.systemPrompt = prompt
  }

  async query(input: string, options?: QueryOptions): Promise<QueryResponse> {
    // Add user message to history
    const userMessage: Message = {
      role: 'user',
      content: input,
      timestamp: Date.now(),
    }
    this.history.push(userMessage)

    // Simulate LLM response
    const response = await this.simulateLLMResponse(input)
    
    // Add assistant message to history
    this.history.push(response.message)
    
    // Execute tool calls if present
    if (response.toolCalls && response.toolCalls.length > 0) {
      await this.executeToolCalls(response.toolCalls, options)
    }

    // Update token usage (simulated)
    this.tokenUsage.promptTokens += input.split(' ').length
    this.tokenUsage.completionTokens += response.message.content.split(' ').length
    this.tokenUsage.totalTokens = this.tokenUsage.promptTokens + this.tokenUsage.completionTokens

    return response
  }

  private async simulateLLMResponse(input: string): Promise<QueryResponse> {
    // Simple simulation logic - in reality this would call an LLM API
    const lowerInput = input.toLowerCase()
    
    // Check if input mentions a tool
    for (const [toolName] of this.tools) {
      if (lowerInput.includes(toolName)) {
        return {
          message: {
            role: 'assistant',
            content: `I'll use the ${toolName} tool for you.`,
            timestamp: Date.now(),
          },
          toolCalls: [
            {
              id: `call-${Date.now()}`,
              name: toolName,
              input: {},
            },
          ],
          stopReason: 'tool_use',
        }
      }
    }

    // Regular response
    let content = "I understand. "
    if (this.systemPrompt.includes('coding')) {
      content = "I'll help you with that code. "
    }
    
    content += `You said: "${input}". How can I assist you further?`

    return {
      message: {
        role: 'assistant',
        content,
        timestamp: Date.now(),
      },
      stopReason: 'end_turn',
    }
  }

  private async executeToolCalls(toolCalls: ToolCall[], options?: QueryOptions): Promise<void> {
    for (const toolCall of toolCalls) {
      const tool = this.tools.get(toolCall.name)
      if (!tool) {
        console.warn(`Tool ${toolCall.name} not found`)
        continue
      }

      try {
        const result = await tool.call(toolCall.input, {
          permissionContext: { mode: 'auto' },
        } as any)

        // Add tool result to history
        const resultMessage: Message = {
          role: 'assistant',
          content: `Tool ${toolCall.name} executed: ${JSON.stringify(result)}`,
          timestamp: Date.now(),
        }
        this.history.push(resultMessage)
      } catch (error) {
        if (!options?.allowToolErrors) {
          throw error
        }
        // Add error message to history
        const errorMessage: Message = {
          role: 'assistant',
          content: `Tool ${toolCall.name} error: ${error}`,
          timestamp: Date.now(),
        }
        this.history.push(errorMessage)
      }
    }
  }

  getHistory(): Message[] {
    return [...this.history]
  }

  clearHistory(): void {
    this.history = []
    this.tokenUsage = { totalTokens: 0, promptTokens: 0, completionTokens: 0 }
  }

  getTokenUsage(): typeof this.tokenUsage {
    return { ...this.tokenUsage }
  }
}
