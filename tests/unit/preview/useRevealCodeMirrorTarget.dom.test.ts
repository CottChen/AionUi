/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { EditorView } from '@codemirror/view';
import { useRevealCodeMirrorTarget } from '@/renderer/pages/conversation/Preview/hooks/useRevealCodeMirrorTarget';

const createView = () =>
  ({
    state: {
      doc: {
        lines: 5,
        line: (lineNumber: number) => ({
          from: (lineNumber - 1) * 10,
          length: 8,
        }),
      },
    },
    dispatch: vi.fn(),
    focus: vi.fn(),
  }) as unknown as EditorView & { dispatch: ReturnType<typeof vi.fn>; focus: ReturnType<typeof vi.fn> };

describe('useRevealCodeMirrorTarget', () => {
  it('reveals the target line and column when an editor view is created', async () => {
    const view = createView();
    const { result } = renderHook(() =>
      useRevealCodeMirrorTarget({
        fileIdentity: 'app.ts',
        targetLine: 3,
        targetColumn: 4,
        targetRevealKey: 'first',
        value: 'line1\nline2\nline3\n',
      })
    );

    act(() => {
      result.current(view);
    });

    await waitFor(() => {
      expect(view.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          selection: { anchor: 23 },
          effects: expect.anything(),
        })
      );
    });
    expect(view.focus).not.toHaveBeenCalled();
  });

  it('reveals the same line again when the reveal key changes', async () => {
    const view = createView();
    const { result, rerender } = renderHook(
      ({ targetRevealKey }) =>
        useRevealCodeMirrorTarget({
          fileIdentity: 'app.ts',
          targetLine: 3,
          targetRevealKey,
          value: 'line1\nline2\nline3\n',
        }),
      { initialProps: { targetRevealKey: 'first' } }
    );

    act(() => {
      result.current(view);
    });

    await waitFor(() => {
      expect(view.dispatch).toHaveBeenCalledTimes(1);
    });

    rerender({ targetRevealKey: 'second' });

    await waitFor(() => {
      expect(view.dispatch).toHaveBeenCalledTimes(2);
    });
  });
});
