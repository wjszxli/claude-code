import { describe } from "vitest";
import z from "zod/v4";
import { buildTool } from "../../core/tool";

// 测试工具
const EchoTool = buildTool({
  name: "echo",
  maxResultSizeChars: 1000,
  inputSchema: z.object({ message: z.string() }),
  call: async (input) => ({ data: input.message }),
  description: async (input) => `Echo: ${input.message}`,
  prompt: async () => "Echo tool",
  isConcurrencySafe: () => true,
});

const ValidatedTool = buildTool({
  name: "validated",
  maxResultSizeChars: 100,
  inputSchema: z.object({ value: z.number() }),
  call: async (input) => ({ data: input.value * 2 }),
  description: async () => "Validated tool",
  prompt: async () => "Validated",
  validateInput: async (input) => {
    if (input.value < 0) {
      return { result: false as const, message: "value must be non-negative" };
    }
    return { result: true as const };
  },
});

describe("core/executor", () => {});
