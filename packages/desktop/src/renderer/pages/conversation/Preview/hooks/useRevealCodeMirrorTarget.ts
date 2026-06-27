/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { EditorView } from '@codemirror/view';

type UseRevealCodeMirrorTargetOptions = {
  fileIdentity?: string;
  targetLine?: number;
  targetColumn?: number;
  targetRevealKey?: string;
  value: string;
};

export const useRevealCodeMirrorTarget = ({
  fileIdentity,
  targetLine,
  targetColumn,
  targetRevealKey,
  value,
}: UseRevealCodeMirrorTargetOptions) => {
  const [view, setView] = useState<EditorView | null>(null);
  const revealedTargetRef = useRef<string | null>(null);

  const handleCreateEditor = useCallback((editorView: EditorView) => {
    setView(editorView);
  }, []);

  useEffect(() => {
    if (!targetLine || targetLine < 1) return;
    if (!view) return;
    if (targetLine > view.state.doc.lines) return;

    const revealKey = `${fileIdentity ?? ''}:${targetLine}:${targetColumn ?? ''}:${targetRevealKey ?? ''}`;
    if (revealedTargetRef.current === revealKey) return;
    revealedTargetRef.current = revealKey;

    const line = view.state.doc.line(targetLine);
    const columnOffset =
      targetColumn == null || targetColumn < 1 ? 0 : Math.min(targetColumn - 1, Math.max(0, line.length));
    const position = line.from + columnOffset;

    view.dispatch({
      selection: { anchor: position },
      effects: EditorView.scrollIntoView(position, { y: 'center' }),
    });
  }, [fileIdentity, targetColumn, targetLine, targetRevealKey, value.length, view]);

  return handleCreateEditor;
};
