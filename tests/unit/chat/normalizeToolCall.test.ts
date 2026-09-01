/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IMessageAcpToolCall, IMessageToolCall } from '@/common/chat/chatLib';
import { normalizeAcpToolCall, normalizeToolCall } from '@/common/chat/normalizeToolCall';
import { describe, expect, it } from 'vitest';

describe('normalizeAcpToolCall', () => {
  it('preserves generated image paths for grouped tool summaries', () => {
    const message: IMessageAcpToolCall = {
      id: 'ig_test_image',
      conversation_id: 'conv-1',
      type: 'acp_tool_call',
      content: {
        sessionId: 'sess-1',
        update: {
          sessionUpdate: 'tool_call_update',
          tool_call_id: 'ig_test_image',
          status: 'completed',
          title: 'Image generation',
          kind: 'execute',
          raw_output: {
            image: {
              path: '/Users/test/.codex/generated_images/session/ig_test_image.png',
            },
          },
          content: [
            {
              type: 'content',
              content: {
                type: 'text',
                text: 'Revised prompt: 一张小猫照片',
              },
            },
          ],
        },
      },
    };

    const normalized = normalizeAcpToolCall(message);

    expect((normalized as { imagePath?: string } | undefined)?.imagePath).toBe(
      '/Users/test/.codex/generated_images/session/ig_test_image.png'
    );
  });
});

describe('normalizeToolCall', () => {
  it('preserves direct Codex image generation paths for grouped tool summaries', () => {
    const message: IMessageToolCall = {
      id: 'ig_direct_image',
      conversation_id: 'conv-1',
      type: 'tool_call',
      content: {
        call_id: 'ig_direct_image',
        name: 'imageGeneration',
        args: {},
        status: 'completed',
        output: '/Users/test/.codex/generated_images/session/ig_direct_image.png',
      },
    };

    expect(normalizeToolCall(message)?.imagePath).toBe(
      '/Users/test/.codex/generated_images/session/ig_direct_image.png'
    );
  });

  it('preserves raw Codex image_generation_call paths for grouped tool summaries', () => {
    const message: IMessageToolCall = {
      id: 'ig_direct_raw_image',
      conversation_id: 'conv-1',
      type: 'tool_call',
      content: {
        call_id: 'ig_direct_raw_image',
        name: 'image_generation_call',
        args: {},
        status: 'completed',
        output: '/workspace/.aionui/generated-images/conv-1/ig_direct_raw_image.png',
      },
    };

    expect(normalizeToolCall(message)?.imagePath).toBe(
      '/workspace/.aionui/generated-images/conv-1/ig_direct_raw_image.png'
    );
  });

  it('preserves Codex imageView paths for grouped tool summaries', () => {
    const message: IMessageToolCall = {
      id: 'image-view-1',
      conversation_id: 'conv-1',
      type: 'tool_call',
      content: {
        call_id: 'image-view-1',
        name: 'imageView',
        args: {},
        status: 'completed',
        output: '/workspace/.aionui/generated-images/conv-1/image-view-1.png',
      },
    };

    expect(normalizeToolCall(message)?.imagePath).toBe('/workspace/.aionui/generated-images/conv-1/image-view-1.png');
  });

  it('does not treat image-looking output from ordinary tools as generated image output', () => {
    const message: IMessageToolCall = {
      id: 'shell-1',
      conversation_id: 'conv-1',
      type: 'tool_call',
      content: {
        call_id: 'shell-1',
        name: 'commandExecution',
        args: {},
        status: 'completed',
        output: '/workspace/screenshot.png',
      },
    };

    expect(normalizeToolCall(message)?.imagePath).toBeUndefined();
  });
});
