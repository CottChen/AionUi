/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export type ProcessErrorKind = 'uncaughtException' | 'unhandledRejection';

type ProcessErrorEventSource = {
  on: (event: ProcessErrorKind, listener: (error: unknown) => void) => unknown;
  off: (event: ProcessErrorKind, listener: (error: unknown) => void) => unknown;
};

type ProcessErrorGuardOptions = {
  eventSource: ProcessErrorEventSource;
  onFatal: (kind: ProcessErrorKind, error: unknown) => void;
};

export function isClientSocketClosedError(error: unknown): boolean {
  const candidate = error as { code?: unknown; message?: unknown } | null;
  const code = typeof candidate?.code === 'string' ? candidate.code : '';
  const message = typeof candidate?.message === 'string' ? candidate.message : '';
  return code === 'ERR_SOCKET_CLOSED' || code === 'ECONNRESET' || code === 'EPIPE' || /socket is closed/i.test(message);
}

export function installProcessErrorGuard({ eventSource, onFatal }: ProcessErrorGuardOptions): () => void {
  const onUncaughtException = (error: unknown): void => {
    if (!isClientSocketClosedError(error)) onFatal('uncaughtException', error);
  };
  const onUnhandledRejection = (error: unknown): void => {
    if (!isClientSocketClosedError(error)) onFatal('unhandledRejection', error);
  };

  eventSource.on('uncaughtException', onUncaughtException);
  eventSource.on('unhandledRejection', onUnhandledRejection);

  return () => {
    eventSource.off('uncaughtException', onUncaughtException);
    eventSource.off('unhandledRejection', onUnhandledRejection);
  };
}
