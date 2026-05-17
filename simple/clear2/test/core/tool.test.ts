import { describe, expect, it } from "vitest";
import z from "zod/v4";
import { buildTool, findToolByName } from "../../core/tool";

const TestTool = buildTool({
  name: "test_tool",
  maxResultSizeChars: 1000,
  inputSchema: z.object({
    path: z.string(),
    content: z.string().optional(),
  }),
  call: async (input) => ({ data: { echoed: input.path } }),
  description: async (input) => `Testing ${input.path}`,
  prompt: async () => "A test tool for verification",
});

describe("core/tool", () => {
  describe("buildTool", () => {
    it("creates a tool with provided name", () => {
      expect(TestTool.name).toBe("test_tool");
    });

    it("fills default isEnabled → true", () => {
      expect(TestTool.isEnabled()).toBe(true);
    });

    it("fills default isConcurrencySafe → false", () => {
      expect(TestTool.isConcurrencySafe({ path: "x" })).toBe(false);
    });

    it("fills default isDestructive → false", () => {
      expect(TestTool.isDestructive({ path: "x" })).toBe(false);
    });

    it("fills default interruptBehavior → block", () => {
      expect(TestTool.interruptBehavior()).toBe("block");
    });

    it("fills default userFacingName → tool name", () => {
      expect(TestTool.userFacingName({ path: "x" })).toBe("test_tool");
    });

    it("fills default checkPermissions → allow", async () => {
      const result = await TestTool.checkPermissions(
        { path: "x" },
        {
          abortController: new AbortController(),
          getAppState: () => ({
            settings: { permissionMode: "default", model: "", verbose: false },
            messages: [],
            tools: [],
            tasks: {},
            mcp: {
              serverNames: [],
              toolCount: 0,
              connected: false,
            },
            ui: {
              streamMode: "idle",
              expandedView: "none",
            },
          }),
          setAppState: (_updater) => {},
          messages: [],
          debug: false,
        },
      );

      expect(result.behavior).toBe("allow");
    });

    it("preserves custom call implementation", async () => {
      const result = await TestTool.call(
        { path: "/tmp/test" },
        {
          abortController: new AbortController(),
          getAppState: () => ({
            messages: [],
            tasks: {},
            settings: { permissionMode: "default", model: "" },
          }),
          setAppState: () => {},
          messages: [],
          debug: false,
        },
      );
      expect(result.data).toEqual({ echoed: "/tmp/test" });
    });

    it("preserves custom description", async () => {
      const desc = await TestTool.description({ path: "/tmp/test" });
      expect(desc).toBe("Testing /tmp/test");
    });
  });

  describe("buildTool with overrides", () => {
    it("allows overriding isReadOnly", () => {
      const ReadOnlyTool = buildTool({
        name: "ro",
        maxResultSizeChars: 100,
        inputSchema: z.object({ x: z.string() }),
        call: async (input) => ({ data: input.x }),
        description: async () => "ro",
        prompt: async () => "ro",
        isReadOnly: () => true,
      });
      expect(ReadOnlyTool.isReadOnly({ x: "a" })).toBe(true);
    });

    it("allows overriding isConcurrencySafe", () => {
      const SafeTool = buildTool({
        name: "safe",
        maxResultSizeChars: 100,
        inputSchema: z.object({ x: z.string() }),
        call: async (input) => ({ data: input.x }),
        description: async () => "safe",
        prompt: async () => "safe",
        isConcurrencySafe: () => true,
      });
      expect(SafeTool.isConcurrencySafe({ x: "a" })).toBe(true);
    });

    it("allows overriding interruptBehavior", () => {
      const CancelTool = buildTool({
        name: "cancel",
        maxResultSizeChars: 100,
        inputSchema: z.object({ x: z.string() }),
        call: async (input) => ({ data: input.x }),
        description: async () => "cancel",
        prompt: async () => "cancel",
        interruptBehavior: () => "cancel" as const,
      });
      expect(CancelTool.interruptBehavior()).toBe("cancel");
    });
  });

  describe("findToolByName", () => {
    it("finds existing tool", () => {
      const tools = [TestTool];
      expect(findToolByName(tools, "test_tool")).toBe(TestTool);
    });

    it("returns undefined for missing tool", () => {
      const tools = [TestTool];
      expect(findToolByName(tools, "nonexistent")).toBeUndefined();
    });
  });
});
