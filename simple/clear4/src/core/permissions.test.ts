import { describe, expect, it } from "vitest";
import { checkToolPermission } from "./permissions";
import { ToolPermissionContext } from "./types";

describe("checkToolPermission", () => {
  const ctx = (
    mode: ToolPermissionContext["mode"],
    denied: string[] = [],
  ): ToolPermissionContext => ({
    mode,
    deniedTools: denied,
  });

  it("denies explicitly denied tools regardless of mode", () => {
    const result = checkToolPermission(
      "bash",
      ctx("yolo", ["bash"]),
      false,
      false,
    );
    expect(result.behavior).toBe("deny");
  });

  it("yolo mode allows everything", () => {
    expect(checkToolPermission("rm", ctx("yolo"), true, false).behavior).toBe(
      "allow",
    );
    expect(checkToolPermission("cat", ctx("yolo"), false, true).behavior).toBe(
      "allow",
    );
  });

  it("auto mode asks for destructive tools", () => {
    expect(
      checkToolPermission("write", ctx("auto"), true, false).behavior,
    ).toBe("ask");
    expect(checkToolPermission("read", ctx("auto"), false, true).behavior).toBe(
      "allow",
    );
  });
});
