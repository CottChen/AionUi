import { describe, expect, it, vi } from 'vitest';
import { requestPanelClose } from '../../../packages/desktop/src/renderer/pages/conversation/Preview/components/PreviewPanel/previewToolbarUtils';

describe('requestPanelClose', () => {
  it('keeps tabs and delegates to the batch-close gate when tabs exist', () => {
    const tabs = [{ id: 'tab-1' }, { id: 'tab-2' }];
    const requestCloseBatch = vi.fn();
    const clearPreviewForScope = vi.fn();

    requestPanelClose(tabs, requestCloseBatch, clearPreviewForScope);

    expect(requestCloseBatch).toHaveBeenCalledTimes(1);
    expect(requestCloseBatch).toHaveBeenCalledWith(tabs, clearPreviewForScope);
    expect(clearPreviewForScope).not.toHaveBeenCalled();
  });

  it('clears the scope immediately when there are no tabs', () => {
    const requestCloseBatch = vi.fn();
    const clearPreviewForScope = vi.fn();

    requestPanelClose([], requestCloseBatch, clearPreviewForScope);

    expect(requestCloseBatch).not.toHaveBeenCalled();
    expect(clearPreviewForScope).toHaveBeenCalledTimes(1);
  });
});
