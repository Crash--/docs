import { SdkProvider, TWAKE_BAR_HEIGHT, TwakeBar } from '@linagora/twake-bar';
import { TwakeMuiThemeProvider, useColorScheme } from '@linagora/twake-mui';
import { useRouter } from 'next/router';
import { useLayoutEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { createGlobalStyle } from 'styled-components';
import { I18n } from 'twake-i18n';

import { gotoLogout, useAuth } from '@/features/auth';

import { useCssColorTokens } from '../hooks/useCssColorTokens';
import { useInstanceTheme } from '../hooks/useInstanceTheme';

import { usePlatform } from './PlatformProvider';

// The host reserves the space of the bar: every layout subtracts it from the
// viewport height
const BarSpace = createGlobalStyle`
  :root {
    --twake-bar-height: ${TWAKE_BAR_HEIGHT};
  }
  #twake-bar {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    height: ${TWAKE_BAR_HEIGHT};
    z-index: 1100;
  }
  body {
    padding-top: ${TWAKE_BAR_HEIGHT};
  }
`;

const APP = {
  slug: 'docs',
  name: 'Docs',
  icon: '/twake-theme/docs-icon.svg',
  textIcon: '/twake-theme/docs-text.svg',
};

// The bar has its own locales; the host gives nothing more
const noDict = () => ({});

const ColorSchemeSync = ({ scheme }: { scheme: 'light' | 'dark' }) => {
  const { setMode } = useColorScheme();
  useLayoutEffect(() => {
    setMode(scheme);
  }, [scheme, setMode]);
  return null;
};

/**
 * The top bar of Twake Workplace, as in Mail and Calendar: the home of the
 * platform, the other apps and the account, read from the Workplace of the
 * user through the SDK. Its log out ends the session of Docs, which ends the
 * one of the SSO. Shown once the user is signed in to Docs.
 */
export const TwakeBarHeader = () => {
  const { authenticated } = useAuth();
  const { sdk, status } = usePlatform();
  const { i18n } = useTranslation();
  const { pathname } = useRouter();
  const scheme = useInstanceTheme(sdk, status === 'ready');
  useCssColorTokens();
  const lang = (i18n.resolvedLanguage ?? i18n.language ?? 'en').split('-')[0];

  // The share page is framed by Drive, under the bar of Drive
  if (!authenticated || !sdk || pathname === '/share') {
    return null;
  }

  return (
    <>
      <BarSpace />
      <div id="twake-bar">
        <TwakeMuiThemeProvider>
          <ColorSchemeSync scheme={scheme} />
          <I18n lang={lang} dictRequire={noDict} polyglot={null} context={null}>
            <SdkProvider client={sdk}>
              <TwakeBar app={APP} onLogOut={gotoLogout} />
            </SdkProvider>
          </I18n>
        </TwakeMuiThemeProvider>
      </div>
    </>
  );
};
