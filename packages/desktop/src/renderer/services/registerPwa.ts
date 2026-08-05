/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { isElectronDesktop } from '@renderer/utils/platform';

const SERVICE_WORKER_URL = './sw.js';
const LOCALHOST_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
const PRELOAD_RECOVERY_KEY = 'aionui.preload-error-recovery';
const PRELOAD_RECOVERY_COOLDOWN_MS = 60_000;

type PreloadRecoveryRecord = {
  buildId: string;
  attemptedAt: number;
};

type PreloadRecoveryOptions = {
  enabled?: boolean;
  target?: Pick<Window, 'addEventListener' | 'removeEventListener'>;
  storage?: Pick<Storage, 'getItem' | 'setItem'>;
  reload?: () => void;
  now?: () => number;
  buildId?: () => string;
};

function currentRendererBuildId(): string {
  return document.querySelector<HTMLScriptElement>('script[type="module"][src]')?.src ?? window.location.href;
}

function parseRecoveryRecord(value: string | null): PreloadRecoveryRecord | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<PreloadRecoveryRecord>;
    return typeof parsed.buildId === 'string' && typeof parsed.attemptedAt === 'number'
      ? { buildId: parsed.buildId, attemptedAt: parsed.attemptedAt }
      : null;
  } catch {
    return null;
  }
}

/** Reload once when an open tab references a lazy chunk removed by an upgrade. */
export function installPreloadErrorRecovery(options: PreloadRecoveryOptions = {}): () => void {
  if (typeof window === 'undefined' || !(options.enabled ?? !isElectronDesktop())) return () => undefined;

  const target = options.target ?? window;
  const storage = options.storage ?? window.sessionStorage;
  const reload = options.reload ?? (() => window.location.reload());
  const now = options.now ?? Date.now;
  const buildId = options.buildId ?? currentRendererBuildId;

  const handlePreloadError = (event: Event): void => {
    event.preventDefault();

    const attemptedAt = now();
    const currentBuildId = buildId();
    const previous = parseRecoveryRecord(storage.getItem(PRELOAD_RECOVERY_KEY));
    if (
      previous?.buildId === currentBuildId &&
      attemptedAt - previous.attemptedAt >= 0 &&
      attemptedAt - previous.attemptedAt < PRELOAD_RECOVERY_COOLDOWN_MS
    ) {
      console.error('[PWA] Lazy asset load failed again after automatic recovery; skipping reload loop.');
      return;
    }

    storage.setItem(PRELOAD_RECOVERY_KEY, JSON.stringify({ buildId: currentBuildId, attemptedAt }));
    console.warn('[PWA] Lazy asset load failed after an upgrade; reloading the current page once.');
    reload();
  };

  target.addEventListener('vite:preloadError', handlePreloadError);
  return () => target.removeEventListener('vite:preloadError', handlePreloadError);
}

function isPwaRegistrationSupported(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return false;
  }

  if (isElectronDesktop() || !('serviceWorker' in navigator)) {
    return false;
  }

  const { protocol, hostname } = window.location;
  const isHttpOrigin = protocol === 'http:' || protocol === 'https:';
  if (!isHttpOrigin) {
    return false;
  }

  return window.isSecureContext || LOCALHOST_HOSTS.has(hostname);
}

export async function registerPwa(): Promise<ServiceWorkerRegistration | undefined> {
  if (!isPwaRegistrationSupported()) {
    return undefined;
  }

  try {
    const registration = await navigator.serviceWorker.register(SERVICE_WORKER_URL, { scope: './' });
    // Poll for updates on every page load so a fixed SW (e.g. v2 replacing
    // a poisoned v1 cache) reaches users without waiting for the browser's
    // own 24h update heuristic.
    registration.update().catch((): undefined => undefined);
    return registration;
  } catch (error) {
    console.warn('[PWA] Failed to register service worker:', error);
    return undefined;
  }
}

export default registerPwa;
