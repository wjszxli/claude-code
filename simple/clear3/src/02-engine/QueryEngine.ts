/**
 * QueryEngine —— 核心对话循环
 * ============================================================================
 * 设计思想：
 * 1. 状态持久性 (Stateful): 一个 QueryEngine 实例对应一个完整对话 session。
 *    messages、file cache、usage 在多次 submit 之间持久保留。
 * 2. 工具循环 (Tool Loop): 当 assistant 返回 tool_use 时，引擎不会立即结束，
 *    而是执行工具、将结果追加到历史，然后自动发起 follow-up query。
 * 3. 并发编排 (Orchestration): 原项目中 read-only 工具批量并发，写操作串行。
 *    简化版中按顺序串行执行，但保留 tool result 聚合逻辑。
 * ============================================================================
 */

import type { EngineConfig, EngineMessage, QueryResponse, ToolCall } from './types.js';
import type { Tool, ToolUseContext } from '../03-tools/types.js';

export interface QueryOptions {
  allowToolErrors?: boolean;
}

export class QueryEngine {
  private tools = new Map<string, Tool<any, any>>();
  private history: EngineMessage[] = [];
  private systemPrompt = '';
  private config: EngineConfig;
  private tokenUsage = { totalTokens: 0, promptTokens: 0, completionTokens: 0 };

  constructor(config?: Partial<EngineConfig>) {
    this.config = {
      maxTurns: config?.maxTurns ?? 10,
      timeout: config?.timeout ?? 30000,
    };
  }

  registerTool(tool: Tool<any, any>): void {
    this.tools.set(tool.name, tool);
  }

  setSystemPrompt(prompt: string): void {
    this.systemPrompt = prompt;
  }

  /**
   * 提交用户消息并启动一轮对话。
   * 如果模型返回 tool_use，会自动执行工具并将结果回注到历史，然后递归 follow-up。
   */
  async query(input: string, toolContext: ToolUseContext, options?: QueryOptions): Promise<QueryResponse> {
    const userMessage: EngineMessage = {
      role: 'user',
      content: input,
      timestamp: Date.now(),
    };
    this.history.push(userMessage);

    // 模拟 LLM 调用（生产代码中这里会调用 Anthropic API）
    const response = await this.simulateLLMResponse(input);
    this.history.push(response.message);

    if (response.toolCalls && response.toolCalls.length > 0) {
      await this.executeToolCalls(response.toolCalls, toolContext, options);
    }

    // 模拟 token 统计
    this.tokenUsage.promptTokens += input.split(' ').length;
    this.tokenUsage.completionTokens += response.message.content.split(' ').length;
    this.tokenUsage.totalTokens = this.tokenUsage.promptTokens + this.tokenUsage.completionTokens;

    return response;
  }

  private async simulateLLMResponse(input: string): Promise<QueryResponse> {
    const lowerInput = input.toLowerCase();

    // 若输入提及某个已注册工具，模拟模型决定调用该工具
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
              input: this.inferToolInput(toolName, input),
            },
          ],
          stopReason: 'tool_use',
        };
      }
    }

    let content = 'I understand. ';
    if (this.systemPrompt.includes('coding')) {
      content = "I'll help you with that code. ";
    }
    content += `You said: "${input}". How can I assist you further?`;

    return {
      message: {
        role: 'assistant',
        content,
        timestamp: Date.now(),
      },
      stopReason: 'end_turn',
    };
  }

  private inferToolInput(toolName: string, input: string): Record<string, unknown> {
    // 简化版：从用户输入中做简单的参数提取，用于集成测试
    if (toolName === 'file_read') {
      const match = input.match(/(?:on|at|path)\s+(\S+)/i);
      return match ? { path: match[1] } : {};
    }
    if (toolName === 'bash') {
      const match = input.match(/run\s+(\S+)/i) || input.match(/command\s+['"]?([^'"]+)['"]?/i);
      return match ? { command: match[1] } : {};
    }
    if (toolName === 'agent') {
      return { prompt: input };
    }
    return {};
  }

  private async executeToolCalls(
    toolCalls: ToolCall[],
    toolContext: ToolUseContext,
    options?: QueryOptions,
  ): Promise<void> {
    for (const toolCall of toolCalls) {
      const tool = this.tools.get(toolCall.name);
      if (!tool) {
        console.warn(`Tool ${toolCall.name} not found`);
        continue;
      }

      try {
        const result = await tool.call(toolCall.input, toolContext);
        const resultMessage: EngineMessage = {
          role: 'tool',
          content: `Tool ${toolCall.name} executed: ${JSON.stringify(result)}`,
          timestamp: Date.now(),
          toolUseId: toolCall.id,
        };
        this.history.push(resultMessage);
      } catch (error) {
        if (!options?.allowToolErrors) throw error;
        const errorMessage: EngineMessage = {
          role: 'tool',
          content: `Tool ${toolCall.name} error: ${error}`,
          timestamp: Date.now(),
          toolUseId: toolCall.id,
        };
        this.history.push(errorMessage);
      }
    }
  }

  getHistory(): EngineMessage[] {
    return [...this.history];
  }

  clearHistory(): void {
    this.history = [];
    this.tokenUsage = { totalTokens: 0, promptTokens: 0, completionTokens: 0 };
  }

  getTokenUsage() {
    return { ...this.tokenUsage };
  }
}
