/**
 * Mock for Bun's bundle feature flag system.
 * Returns false for all features in test environment.
 */
export function feature(featureName: string): boolean {
  return false
}
