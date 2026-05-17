import type { ToolPermissionContext } from "./types.js";

export type PermissionBehavior = "allow" | "deny" | "ask";

export interface PermissionCheck<T> {
  behavior: PermissionBehavior;
  updatedInput?: T;
}

export function checkToolPermission(
  toolName: string,
  context: ToolPermissionContext,
  isDestructive: boolean,
  isReadOnly: boolean,
): PermissionCheck<unknown> {
  if (context.deniedTools.includes(toolName)) {
    return { behavior: "deny" };
  }

  switch (context.mode) {
    case "yolo":
      return { behavior: "allow" };
    case "auto":
      return isDestructive ? { behavior: "ask" } : { behavior: "allow" };
    case "plan":
      return isReadOnly ? { behavior: "allow" } : { behavior: "ask" };
    case "default":
    default:
      if (isDestructive) return { behavior: "ask" };
      return { behavior: "allow" };
  }
}
