import { describe, expect, it } from 'vitest';
import { buildSpawnArgs, supportsParentPidArg } from '../../../packages/web-host/src/backend-launcher';

describe('buildSpawnArgs parent pid', () => {
  it('passes parent pid when the bundled backend supports it', () => {
    const args = buildSpawnArgs({
      port: 1,
      dbPath: '/d',
      local: false,
      appVersion: '0.0.1',
      isPackaged: true,
      parentPid: 4242,
      parentPidSupported: true,
    });

    expect(args).toContain('--parent-pid');
    expect(args).toContain('4242');
  });

  it('omits parent pid for older bundled backend versions', () => {
    const args = buildSpawnArgs({
      port: 1,
      dbPath: '/d',
      local: false,
      appVersion: '0.0.1',
      isPackaged: true,
      parentPid: 4242,
      parentPidSupported: supportsParentPidArg('v0.1.24'),
    });

    expect(args).not.toContain('--parent-pid');
    expect(args).not.toContain('4242');
  });

  it('treats aioncore v0.1.26 as parent-pid compatible', () => {
    expect(supportsParentPidArg('v0.1.24')).toBe(false);
    expect(supportsParentPidArg('v0.1.26')).toBe(true);
    expect(supportsParentPidArg('v0.2.0')).toBe(true);
  });
});
