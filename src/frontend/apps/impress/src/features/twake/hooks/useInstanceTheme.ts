import type { Sdk } from '@linagora/twake-sdk';
import { useEffect, useState } from 'react';

import { useConfig } from '@/core/config/api/useConfig';
import { useCunninghamTheme } from '@/cunningham';

export type ColorScheme = 'light' | 'dark';

const systemScheme = (): ColorScheme =>
  window.matchMedia?.('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';

/**
 * The theme of the Workplace settings of the user (`colorScheme` of their
 * instance: light, dark or auto), applied to Docs on the platform. Light
 * leaves the theme of Docs as configured; dark switches it to the dark
 * cunningham theme. Nothing is written in Docs: the setting lives on the
 * platform.
 */
export const useInstanceTheme = (sdk: Sdk | null, ready: boolean) => {
  const [preference, setPreference] = useState<ColorScheme | 'auto'>('light');
  const [scheme, setScheme] = useState<ColorScheme>('light');
  const { setTheme } = useCunninghamTheme();
  const { data: conf } = useConfig();

  useEffect(() => {
    if (!sdk || !ready) {
      return;
    }
    sdk
      .getInstance()
      .then((instance) => {
        const value = instance.colorScheme;
        setPreference(value === 'dark' || value === 'auto' ? value : 'light');
      })
      .catch(() => setPreference('light'));
  }, [sdk, ready]);

  useEffect(() => {
    if (preference !== 'auto') {
      setScheme(preference);
      return;
    }
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => setScheme(systemScheme());
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [preference]);

  useEffect(() => {
    if (!sdk) {
      return;
    }
    if (scheme === 'dark') {
      setTheme('dark');
      document.documentElement.style.colorScheme = 'dark';
      return () => {
        setTheme(conf?.FRONTEND_THEME ?? 'default');
        document.documentElement.style.colorScheme = '';
      };
    }
  }, [sdk, scheme, setTheme, conf?.FRONTEND_THEME]);

  return scheme;
};
