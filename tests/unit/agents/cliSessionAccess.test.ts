import { describe, expect, it } from 'vitest';

import { canAccessCliSessions } from '@/renderer/pages/agentSessions/access';

describe('CLI session access', () => {
  it('allows the trusted desktop runtime without a WebUI user', () => {
    expect(canAccessCliSessions(true, undefined)).toBe(true);
  });

  it('allows a WebUI administrator', () => {
    expect(canAccessCliSessions(false, true)).toBe(true);
  });

  it('denies a non-admin WebUI user', () => {
    expect(canAccessCliSessions(false, false)).toBe(false);
  });

  it('denies WebUI access while the user identity is unavailable', () => {
    expect(canAccessCliSessions(false, undefined)).toBe(false);
  });
});
