/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useLocation } from 'react-router-dom';
import SystemModalContent from '@/renderer/components/settings/SettingsModal/contents/SystemModalContent';
import AboutModalContent from '@/renderer/components/settings/SettingsModal/contents/AboutModalContent';
import SettingsPageWrapper from './components/SettingsPageWrapper';
import { isElectronDesktop } from '@/renderer/utils/platform';

type SystemSettingsProps = {
  canEditGlobalSettings?: boolean;
};

const SystemSettings: React.FC<SystemSettingsProps> = ({ canEditGlobalSettings: canEditGlobalSettingsProp }) => {
  const location = useLocation();
  const isAboutPage = location.pathname === '/settings/about';
  const canEditGlobalSettings = canEditGlobalSettingsProp ?? isElectronDesktop();

  return (
    <SettingsPageWrapper contentClassName={isAboutPage ? 'max-w-640px' : undefined}>
      {isAboutPage ? <AboutModalContent /> : <SystemModalContent canEditGlobalSettings={canEditGlobalSettings} />}
    </SettingsPageWrapper>
  );
};

export default SystemSettings;
