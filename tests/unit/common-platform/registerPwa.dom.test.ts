/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { installPreloadErrorRecovery } from '@/renderer/services/registerPwa';

type Listener = (event: Event) => void;

function createTarget() {
  let listener: Listener | undefined;
  return {
    target: {
      addEventListener: vi.fn((_type: string, next: EventListenerOrEventListenerObject) => {
        listener = next as Listener;
      }),
      removeEventListener: vi.fn(),
    },
    dispatch: () => listener?.(new Event('vite:preloadError', { cancelable: true })),
  };
}

describe('installPreloadErrorRecovery', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reloads once when a lazy asset from the current build cannot load', () => {
    const { target, dispatch } = createTarget();
    const values = new Map<string, string>();
    const reload = vi.fn();
    installPreloadErrorRecovery({
      enabled: true,
      target: target as unknown as Window,
      storage: {
        getItem: (key) => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, value),
      },
      reload,
      now: () => 10_000,
      buildId: () => 'index-old.js',
    });

    dispatch();

    expect(reload).toHaveBeenCalledOnce();
  });

  it('does not enter a reload loop when the same build fails again', () => {
    const { target, dispatch } = createTarget();
    const values = new Map<string, string>();
    const reload = vi.fn();
    installPreloadErrorRecovery({
      enabled: true,
      target: target as unknown as Window,
      storage: {
        getItem: (key) => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, value),
      },
      reload,
      now: () => 10_000,
      buildId: () => 'index-old.js',
    });

    dispatch();
    dispatch();

    expect(reload).toHaveBeenCalledOnce();
  });

  it('allows recovery again after the renderer build changes', () => {
    const { target, dispatch } = createTarget();
    const values = new Map<string, string>();
    const reload = vi.fn();
    let buildId = 'index-old.js';
    installPreloadErrorRecovery({
      enabled: true,
      target: target as unknown as Window,
      storage: {
        getItem: (key) => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, value),
      },
      reload,
      now: () => 10_000,
      buildId: () => buildId,
    });

    dispatch();
    buildId = 'index-new.js';
    dispatch();

    expect(reload).toHaveBeenCalledTimes(2);
  });
});
