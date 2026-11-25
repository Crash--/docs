import fetchMock from 'fetch-mock';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getTwakeSession,
  refreshURLOf,
  renewTwakeSession,
} from '../useTwakeSession';

const mockReplace = vi.fn();
Object.defineProperty(window, 'location', {
  value: {
    ...window.location,
    replace: mockReplace,
    href: 'http://test.jest/docs/d1/',
    pathname: '/docs/d1/',
  },
  writable: true,
  configurable: true,
});

const REFRESH =
  '/api/v1.0/authenticate/?silent=true&next=http%3A%2F%2Ftest.jest%2Fdocs%2Fd1%2F';

describe('the session of the Twake bar', () => {
  beforeEach(() => {
    fetchMock.mockGlobal();
  });
  afterEach(() => {
    fetchMock.hardReset();
    mockReplace.mockClear();
    sessionStorage.clear();
    vi.useRealTimers();
  });

  it('sends the page as next and gives the id token', async () => {
    fetchMock.get(
      'http://test.jest/api/v1.0/twake/session/?next=http%3A%2F%2Ftest.jest%2Fdocs%2Fd1%2F',
      { sub: 'alice', id_token: 'jwt', workplace_fqdn: 'alice.example' },
    );
    await expect(getTwakeSession()).resolves.toEqual({
      sub: 'alice',
      id_token: 'jwt',
      workplace_fqdn: 'alice.example',
    });
  });

  it('turns an expired id token into the URL of a silent login', async () => {
    fetchMock.get('begin:http://test.jest/api/v1.0/twake/session/', {
      status: 401,
      body: { detail: 'expired', refresh_url: REFRESH },
    });
    const error = await getTwakeSession().catch((e: unknown) => e);
    expect(refreshURLOf(error)).toBe(REFRESH);
  });

  it('a 401 without refresh URL is a plain error', async () => {
    fetchMock.get('begin:http://test.jest/api/v1.0/twake/session/', {
      status: 401,
      body: { detail: 'Authentication credentials were not provided.' },
    });
    const error = await getTwakeSession().catch((e: unknown) => e);
    expect(refreshURLOf(error)).toBeNull();
  });

  it('follows the silent login once, then the normal login', () => {
    vi.useFakeTimers({ now: 1_000_000 });
    renewTwakeSession(REFRESH);
    expect(mockReplace).toHaveBeenLastCalledWith(REFRESH);

    // Back from the silent login still without an id token: the SSO session ended
    vi.setSystemTime(1_005_000);
    renewTwakeSession(REFRESH);
    expect(mockReplace).toHaveBeenLastCalledWith(
      'http://test.jest/api/v1.0/authenticate/',
    );

    // Hours later, a new expiry renews silently again
    vi.setSystemTime(1_000_000 + 3 * 3600 * 1000);
    renewTwakeSession(REFRESH);
    expect(mockReplace).toHaveBeenLastCalledWith(REFRESH);
  });
});
