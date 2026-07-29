/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import {
  installProcessErrorGuard,
  isClientSocketClosedError,
  type ProcessErrorKind,
} from '../../../packages/web-cli/src/processErrorGuard.js';

describe('processErrorGuard', () => {
  it.each(['ERR_SOCKET_CLOSED', 'ECONNRESET', 'EPIPE'])('recognizes %s as a client disconnect', (code) => {
    expect(isClientSocketClosedError(Object.assign(new Error('write failed'), { code }))).toBe(true);
  });

  it('keeps the process alive for closed client socket errors', () => {
    const eventSource = new EventEmitter();
    const onFatal = vi.fn<(kind: ProcessErrorKind, error: unknown) => void>();
    const cleanup = installProcessErrorGuard({ eventSource, onFatal });

    eventSource.emit('uncaughtException', Object.assign(new Error('Socket is closed'), { code: 'ERR_SOCKET_CLOSED' }));
    eventSource.emit('unhandledRejection', Object.assign(new Error('write EPIPE'), { code: 'EPIPE' }));

    expect(onFatal).not.toHaveBeenCalled();
    cleanup();
  });

  it('preserves fatal handling for unrelated errors', () => {
    const eventSource = new EventEmitter();
    const onFatal = vi.fn<(kind: ProcessErrorKind, error: unknown) => void>();
    const cleanup = installProcessErrorGuard({ eventSource, onFatal });
    const error = new Error('unexpected state');

    eventSource.emit('uncaughtException', error);

    expect(onFatal).toHaveBeenCalledWith('uncaughtException', error);
    cleanup();
  });
});
