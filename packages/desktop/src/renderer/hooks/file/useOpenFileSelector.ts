import { ipcBridge } from '@/common';
import { configService } from '@/common/config/configService';
import { useCallback } from 'react';

interface UseOpenFileSelectorOptions {
  onFilesSelected: (files: string[]) => void;
  conversationId?: string;
  workspacePath?: string;
}

interface UseOpenFileSelectorResult {
  openFileSelector: () => void;
  onSlashBuiltinCommand: (name: string) => void;
}

/**
 * Shared open-file selector behavior for send boxes.
 * Unifies '+' button and '/open' builtin command handling.
 *
 * In Electron: opens native file dialog.
 * In WebUI: triggers DirectorySelectionModal via bridge events.
 */
export function useOpenFileSelector(options: UseOpenFileSelectorOptions): UseOpenFileSelectorResult {
  const { onFilesSelected, conversationId, workspacePath } = options;

  const openFileSelector = useCallback(() => {
    void ipcBridge.dialog.showOpen
      .invoke({ properties: ['openFile', 'multiSelections'] })
      .then(async (files) => {
        if (!files || files.length === 0) {
          return;
        }
        if (conversationId && workspacePath) {
          try {
            await configService.whenReady();
            if (!configService.get('upload.saveToWorkspace')) {
              onFilesSelected(files);
              return;
            }
            const result = await ipcBridge.fs.copyFilesToWorkspace.invoke({
              file_paths: files,
              workspace: workspacePath,
              target_relative_path: 'uploads',
            });
            const copied = (result.copied_files ?? []).map((filePath) => {
              const name = filePath.split(/[\\/]/).pop() || filePath;
              return `${workspacePath.replace(/[\\/]+$/, '')}/uploads/${name}`;
            });
            if (copied.length > 0) {
              onFilesSelected(copied);
            }
            return;
          } catch (error) {
            console.warn('[useOpenFileSelector] Failed to copy files into workspace:', error);
            return;
          }
        }
        onFilesSelected(files);
      })
      .catch((error) => {
        // In WebUI, dialog may fail if DirectorySelectionModal is not rendered
        // or bridge is not properly connected. Log error for debugging.
        console.warn('[useOpenFileSelector] Failed to open file selector:', error);
      });
  }, [conversationId, onFilesSelected, workspacePath]);

  const onSlashBuiltinCommand = useCallback(
    (name: string) => {
      if (name === 'open') {
        openFileSelector();
      }
    },
    [openFileSelector]
  );

  return {
    openFileSelector,
    onSlashBuiltinCommand,
  };
}
