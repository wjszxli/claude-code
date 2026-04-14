import { describe, it, expect } from 'vitest';
import { checkToolPermission } from './permissions.js';
import type { ToolPermissionContext } from './types.js';

describe('checkToolPermission', () => {
  const ctx = (mode: ToolPermissionContext['mode'], denied: string[] = []): ToolPermissionContext => ({
    mode,
    deniedTools: denied,
  });

  it('denies explicitly denied tools regardless of mode', () => {
    const result = checkToolPermission('bash', ctx('yolo', ['bash']), false, false);
    expect(result.behavior).toBe('deny');
  });

  it('yolo mode allows everything', () => {
    expect(checkToolPermission('rm', ctx('yolo'), true, false).behavior).toBe('allow');
    expect(checkToolPermission('cat', ctx('yolo'), false, true).behavior).toBe('allow');
  });

  it('auto mode asks for destructive tools', () => {
    expect(checkToolPermission('write', ctx('auto'), true, false).behavior).toBe('ask');
    expect(checkToolPermission('read', ctx('auto'), false, true).behavior).toBe('allow');
  });

  it('plan mode allows readonly only', () => {
    expect(checkToolPermission('write', ctx('plan'), false, false).behavior).toBe('ask');
    expect(checkToolPermission('read', ctx('plan'), false, true).behavior).toBe('allow');
    expect(checkToolPermission('rm', ctx('plan'), true, false).behavior).toBe('ask');
  });

  it('default mode asks for destructive', () => {
    expect(checkToolPermission('rm', ctx('default'), true, false).behavior).toBe('ask');
    expect(checkToolPermission('read', ctx('default'), false, true).behavior).toBe('allow');
    expect(checkToolPermission('write', ctx('default'), false, false).behavior).toBe('allow');
  });
});
