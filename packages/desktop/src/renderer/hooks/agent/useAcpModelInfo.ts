/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { IResponseMessage } from '@/common/adapter/ipcBridge';
import type { AcpConfigOptionDto, AcpModelInfo } from '@/common/types/platform/acpTypes';
import {
  type AcpConfigOptionsLoader,
  type AcpConfigSetStatus,
  type AcpDerivedOption,
  useAcpConfigOptions,
} from './useAcpConfigOptions';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type UseAcpModelInfoArgs = {
  conversation_id: string;
  backend?: string;
  initialModelId?: string;
  prepareRuntime?: () => Promise<void>;
  prepareSetRuntime?: () => Promise<void>;
  loadConfigOptions?: AcpConfigOptionsLoader;
  enabled?: boolean;
  onSelectModelSuccess?: (model_id: string) => void;
  onSelectModelFailed?: (model_id: string, error: unknown) => void;
};

export type UseAcpModelInfoResult = {
  model_info: AcpModelInfo | null;
  canSwitch: boolean;
  isLoading: boolean;
  isSetting: boolean;
  selectModel: (model_id: string) => void;
  thoughtLevel: AcpDerivedOption | null;
  setStatus: AcpConfigSetStatus;
  setConfigOption: (optionId: string, value: string) => Promise<AcpConfigOptionDto[]>;
};

function sameModelInfo(a: AcpModelInfo | null, b: AcpModelInfo | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.current_model_id === b.current_model_id &&
    a.current_model_label === b.current_model_label &&
    a.available_models.length === b.available_models.length &&
    a.available_models.every((item, index) => {
      const other = b.available_models[index];
      return other?.id === item.id && other.label === item.label && other.description === item.description;
    })
  );
}

function normalizeInitialModel(info: AcpModelInfo, initialModelId?: string): AcpModelInfo {
  if (!initialModelId || info.current_model_id) return info;
  const match = info.available_models.find((model) => model.id === initialModelId);
  if (!match) return info;
  return {
    ...info,
    current_model_id: initialModelId,
    current_model_label: match.label || initialModelId,
  };
}

export const useAcpModelInfo = ({
  conversation_id,
  backend: _backend,
  initialModelId,
  prepareRuntime,
  prepareSetRuntime,
  loadConfigOptions,
  enabled = true,
  onSelectModelSuccess,
  onSelectModelFailed,
}: UseAcpModelInfoArgs): UseAcpModelInfoResult => {
  const { model, thoughtLevel, setStatus, setConfigOption, isLoading } = useAcpConfigOptions({
    conversation_id,
    prepareRuntime,
    prepareSetRuntime,
    loadConfigOptions,
    enabled,
  });
  const [legacyModelState, setLegacyModelState] = useState<{
    conversationId: string;
    info: AcpModelInfo | null;
  }>({ conversationId: conversation_id, info: null });
  const legacyModelInfo = legacyModelState.conversationId === conversation_id ? legacyModelState.info : null;
  // Keep the last non-empty runtime identity while ACP refreshes its options.
  // The backend may publish an intermediate snapshot without current_value;
  // showing that transient value makes the header flicker or become blank.
  const stableModelRef = useRef<{ conversationId: string; info: AcpModelInfo | null }>({
    conversationId: conversation_id,
    info: null,
  });
  if (stableModelRef.current.conversationId !== conversation_id) {
    stableModelRef.current = { conversationId: conversation_id, info: null };
  }
  const configModelInfo = useMemo<AcpModelInfo | null>(() => {
    if (!model) return null;
    const currentModelId = model.currentValue || null;
    return {
      current_model_id: currentModelId,
      current_model_label: model.options.find((item) => item.value === currentModelId)?.label || currentModelId || null,
      available_models: model.options.map((item) => ({
        id: item.value,
        label: item.label,
        description: item.description ?? undefined,
      })),
    };
  }, [initialModelId, model]);

  useEffect(() => {
    const candidate = configModelInfo?.current_model_id
      ? configModelInfo
      : legacyModelInfo?.current_model_id
        ? legacyModelInfo
        : null;
    if (candidate) stableModelRef.current.info = candidate;
  }, [configModelInfo, conversation_id, legacyModelInfo]);
  const persistedModelInfo = useMemo<AcpModelInfo | null>(() => {
    if (!initialModelId) return null;
    return {
      current_model_id: initialModelId,
      current_model_label: initialModelId,
      available_models: [],
    };
  }, [initialModelId]);

  useEffect(() => {
    setLegacyModelState({ conversationId: conversation_id, info: null });
  }, [conversation_id]);

  useEffect(() => {
    if (!enabled) setLegacyModelState({ conversationId: conversation_id, info: null });
  }, [conversation_id, enabled]);

  useEffect(() => {
    if (!enabled) return;
    const handler = (message: IResponseMessage) => {
      if (message.conversation_id !== conversation_id) return;
      if (message.type === 'acp_model_info' && message.data) {
        const incoming = normalizeInitialModel(message.data as AcpModelInfo, initialModelId);
        setLegacyModelState((previous) => ({
          conversationId: conversation_id,
          info: sameModelInfo(previous.conversationId === conversation_id ? previous.info : null, incoming)
            ? previous.info
            : incoming,
        }));
      } else if (message.type === 'codex_model_info' && message.data) {
        const data = message.data as { model?: string };
        if (!data.model) return;
        const incoming: AcpModelInfo = {
          current_model_id: data.model,
          current_model_label: data.model,
          available_models: [],
        };
        setLegacyModelState((previous) => ({
          conversationId: conversation_id,
          info: sameModelInfo(previous.conversationId === conversation_id ? previous.info : null, incoming)
            ? previous.info
            : incoming,
        }));
      }
    };
    return ipcBridge.acpConversation.responseStream.on(handler);
  }, [conversation_id, enabled, initialModelId]);

  const model_info = useMemo(() => {
    const current = configModelInfo?.current_model_id
      ? configModelInfo
      : legacyModelInfo?.current_model_id
        ? legacyModelInfo
        : null;
    if (current?.current_model_id) return current;
    const stable = stableModelRef.current.info;
    if (configModelInfo && stable?.current_model_id) {
      const matched = configModelInfo.available_models.find(
        (availableModel) => availableModel.id === stable.current_model_id
      );
      return {
        ...configModelInfo,
        current_model_id: stable.current_model_id,
        current_model_label: matched?.label || stable.current_model_label,
      };
    }
    return stable ?? persistedModelInfo;
  }, [configModelInfo, conversation_id, legacyModelInfo, persistedModelInfo]);

  const selectModel = useCallback(
    (model_id: string) => {
      if (!enabled || !model) return;
      void setConfigOption(model.id, model_id)
        .then(async () => {
          onSelectModelSuccess?.(model_id);
        })
        .catch((error) => {
          onSelectModelFailed?.(model_id, error);
        });
    },
    [enabled, model, onSelectModelFailed, onSelectModelSuccess, setConfigOption]
  );

  return {
    model_info,
    canSwitch: Boolean(configModelInfo && configModelInfo.available_models.length > 0),
    isLoading: !model_info && isLoading,
    isSetting: setStatus.state === 'setting' && setStatus.optionId === model?.id,
    selectModel,
    thoughtLevel,
    setStatus,
    setConfigOption,
  };
};
