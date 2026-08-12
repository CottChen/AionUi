/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { act, renderHook } from '@testing-library/react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useCompositionInput } from '@/renderer/hooks/chat/useCompositionInput';

const keyboardEvent = (overrides: Partial<ReactKeyboardEvent> = {}) =>
  ({
    key: 'Enter',
    ctrlKey: false,
    shiftKey: false,
    preventDefault: vi.fn(),
    ...overrides,
  }) as unknown as ReactKeyboardEvent;

describe('useCompositionInput submit shortcut', () => {
  it('keeps Enter and Shift+Enter available for inserting line breaks', () => {
    const { result } = renderHook(() => useCompositionInput());
    const onSubmit = vi.fn();
    const enter = keyboardEvent();
    const shiftEnter = keyboardEvent({ shiftKey: true });

    result.current.createKeyDownHandler(onSubmit)(enter);
    result.current.createKeyDownHandler(onSubmit)(shiftEnter);

    expect(onSubmit).not.toHaveBeenCalled();
    expect(enter.preventDefault).not.toHaveBeenCalled();
    expect(shiftEnter.preventDefault).not.toHaveBeenCalled();
  });

  it('submits and prevents a line break for Ctrl+Enter', () => {
    const { result } = renderHook(() => useCompositionInput());
    const onSubmit = vi.fn();
    const intercept = vi.fn(() => true);
    const event = keyboardEvent({ ctrlKey: true });

    result.current.createKeyDownHandler(onSubmit, intercept)(event);

    expect(onSubmit).toHaveBeenCalledOnce();
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(intercept).not.toHaveBeenCalled();
  });

  it('does not submit Ctrl+Enter while an IME composition is active', () => {
    const { result } = renderHook(() => useCompositionInput());
    const onSubmit = vi.fn();
    const event = keyboardEvent({ ctrlKey: true });

    act(() => result.current.compositionHandlers.onCompositionStartCapture());
    result.current.createKeyDownHandler(onSubmit)(event);

    expect(onSubmit).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
  });
});
