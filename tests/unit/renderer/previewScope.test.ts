import { describe, expect, it } from 'vitest';

import { previewScopeKey } from '@/renderer/pages/conversation/Preview/context/previewScope';

/**
 * `previewScopeKey` is the single switch point deciding the preview-isolation
 * dimensions: user id plus project id first, workspace as fallback. These tests
 * guard the precedence + distinctness the reset logic depends on.
 */
describe('previewScopeKey', () => {
  it('uses project_id as the scope key when present (project takes precedence over workspace)', () => {
    expect(previewScopeKey('proj-1', '/ws/a')).toBe('user:system_default_user:proj-1');
  });

  it('falls back to the workspace path when project_id is absent', () => {
    expect(previewScopeKey(null, '/ws/a')).toBe('user:system_default_user:/ws/a');
    expect(previewScopeKey(undefined, '/ws/a')).toBe('user:system_default_user:/ws/a');
    expect(previewScopeKey('', '/ws/a')).toBe('user:system_default_user:/ws/a');
  });

  it('normalizes to null when neither project_id nor workspace is known', () => {
    expect(previewScopeKey(null, null)).toBeNull();
    expect(previewScopeKey(undefined, undefined)).toBeNull();
    expect(previewScopeKey('', '')).toBeNull();
  });

  it('keeps distinct projects distinct so a project switch is detected', () => {
    expect(previewScopeKey('proj-1', null)).not.toBe(previewScopeKey('proj-2', null));
  });

  it('keeps the same project distinct for different authenticated users', () => {
    expect(previewScopeKey('proj-1', null, 'user-a')).not.toBe(previewScopeKey('proj-1', null, 'user-b'));
  });

  it('escapes user ids so separators cannot collapse user scopes', () => {
    expect(previewScopeKey('proj-1', null, 'user:a')).toBe('user:user%3Aa:proj-1');
  });

  it('does not reset across conversations of the same project even when workspaces differ', () => {
    // Same project, different workspace paths → same scope key → preview kept.
    expect(previewScopeKey('proj-1', '/ws/a')).toBe(previewScopeKey('proj-1', '/ws/b'));
  });

  it('is stable for the same workspace fallback so same-scope switches keep the preview', () => {
    expect(previewScopeKey(null, '/ws/a')).toBe(previewScopeKey(null, '/ws/a'));
  });
});
