/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { uploadFileViaHttp } from '@/renderer/services/FileService';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/common/adapter/httpBridge', () => ({
  getBaseUrl: () => 'http://127.0.0.1:9527',
}));

vi.mock('@/renderer/hooks/file/useUploadState', () => ({
  trackUpload: vi.fn(),
}));

type XhrListener = () => void;

class FakeXMLHttpRequest {
  static instances: FakeXMLHttpRequest[] = [];

  readonly upload = {
    addEventListener: vi.fn(),
  };

  status = 0;
  statusText = '';
  responseText = '';
  sentBody: unknown;

  private readonly listeners: Record<string, XhrListener> = {};

  open() {}

  addEventListener(name: string, listener: XhrListener) {
    this.listeners[name] = listener;
  }

  abort() {
    this.listeners.abort?.();
  }

  send(body: unknown) {
    this.sentBody = body;
    FakeXMLHttpRequest.instances.push(this);
  }

  respond(status: number, responseText: string) {
    this.status = status;
    this.responseText = responseText;
    this.listeners.load?.();
  }
}

const waitForRequest = async (): Promise<FakeXMLHttpRequest> => {
  for (let i = 0; i < 20 && FakeXMLHttpRequest.instances.length === 0; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  const xhr = FakeXMLHttpRequest.instances[0];
  expect(xhr, 'expected an upload XHR request').toBeDefined();
  return xhr;
};

describe('uploadFileViaHttp workspace destination', () => {
  beforeEach(() => {
    FakeXMLHttpRequest.instances = [];
    vi.stubGlobal('XMLHttpRequest', FakeXMLHttpRequest);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends the selected workspace-relative directory', async () => {
    const pending = uploadFileViaHttp(new File(['content'], 'notes.md'), 'conversation-1', undefined, undefined, {
      workspaceRelativePath: 'docs/design',
    });
    const xhr = await waitForRequest();
    const formData = xhr.sentBody as FormData;

    expect(formData.get('conversation_id')).toBe('conversation-1');
    expect(formData.get('workspace_relative_path')).toBe('docs/design');

    xhr.respond(200, JSON.stringify({ success: true, data: '/workspace/docs/design/notes.md' }));
    await expect(pending).resolves.toBe('/workspace/docs/design/notes.md');
  });

  it('preserves an empty destination as an explicit workspace-root upload', async () => {
    const pending = uploadFileViaHttp(new File(['content'], 'root.md'), 'conversation-1', undefined, undefined, {
      workspaceRelativePath: '',
    });
    const xhr = await waitForRequest();
    const formData = xhr.sentBody as FormData;

    expect(formData.has('workspace_relative_path')).toBe(true);
    expect(formData.get('workspace_relative_path')).toBe('');

    xhr.respond(200, JSON.stringify({ success: true, data: '/workspace/root.md' }));
    await expect(pending).resolves.toBe('/workspace/root.md');
  });

  it('omits the destination for normal conversation uploads and rejects an unsuccessful response', async () => {
    const pending = uploadFileViaHttp(new File(['content'], 'chat.md'), 'conversation-1');
    const xhr = await waitForRequest();
    const formData = xhr.sentBody as FormData;

    expect(formData.has('workspace_relative_path')).toBe(false);

    xhr.respond(200, JSON.stringify({ success: false }));
    await expect(pending).rejects.toThrow('server returned unsuccessful response');
  });
});
