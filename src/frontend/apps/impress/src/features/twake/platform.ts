import { type Sdk, createSdk } from '@linagora/twake-sdk';

// One client for the whole page: its token outlives the id token, which
// expires after an hour and is not renewed by Docs.
let session: {
  platformURL: string;
  sdk: Sdk;
  signingIn: Promise<void> | null;
} | null = null;

const getSession = (platformURL: string) => {
  if (!session || session.platformURL !== platformURL) {
    session = { platformURL, sdk: createSdk({ platformURL }), signingIn: null };
  }
  return session;
};

/**
 * The SDK client of the user's Workplace, signed in or not yet: what shows the
 * platform data follows its status.
 */
export const getPlatformSdk = (platformURL: string): Sdk =>
  getSession(platformURL).sdk;

/**
 * Signs the client in with the id token of the SSO, unless it already is:
 * concurrent callers share the same token exchange.
 */
export async function ensureSdkSignedIn(
  platformURL: string,
  idToken: string,
): Promise<Sdk> {
  const current = getSession(platformURL);
  if (current.sdk.status !== 'ready') {
    current.signingIn ??= current.sdk.login(idToken).finally(() => {
      current.signingIn = null;
    });
    await current.signingIn;
  }
  return current.sdk;
}

/** `https://${workplaceFqdn}`, or the scheme of the page on a dev stack. */
export const platformURLOf = (workplaceFqdn: string): string =>
  `${window.location.protocol}//${workplaceFqdn}`;
