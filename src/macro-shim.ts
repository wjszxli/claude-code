/**
 * Development shim for MACRO global object.
 *
 * In production builds, these values are injected by Bun's --define flag in build.ts.
 * This shim provides runtime values for development mode (bun run dev).
 */

// Create the global MACRO object with development values
globalThis.MACRO = {
  VERSION: "2.1.88-dev",
  BUILD_TIME: new Date().toISOString(),
  ISSUES_EXPLAINER:
    "report the issue at https://github.com/anthropics/claude-code/issues",
  FEEDBACK_CHANNEL: "https://github.com/anthropics/claude-code/issues",
  PACKAGE_URL: "https://www.npmjs.com/package/@anthropic-ai/claude-code",
  NATIVE_PACKAGE_URL: "https://www.npmjs.com/package/@anthropic-ai/claude-code",
  VERSION_CHANGELOG: "",
};

// Export for explicit imports if needed
export const MACRO = globalThis.MACRO;
