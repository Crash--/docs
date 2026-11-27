import fetchMock from 'fetch-mock';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SILENT_LOGIN_RETRY } from '../conf';
import { gotoLogout, gotoSilentLogin, hasTrySilent } from '../utils';

// Add mock on window.location.replace
const mockReplace = vi.fn();
Object.defineProperty(window, 'location', {
  value: {
    ...window.location,
    replace: mockReplace,
    href: 'http://test.jest/',
  },
  writable: true,
  configurable: true,
});

const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');

describe('utils', () => {
  afterEach(() => {
    vi.clearAllMocks();
    fetchMock.hardReset();
    mockReplace.mockClear();
    setItemSpy.mockClear();
    localStorage.clear();
  });

  it('checks logout redirects to logout URL', async () => {
    gotoLogout();

    expect(mockReplace).toHaveBeenCalledWith(
      'http://test.jest/api/v1.0/logout/',
    );
  });

  it('checks the gotoSilentLogin', async () => {
    gotoSilentLogin();

    expect(mockReplace).toHaveBeenCalledWith(
      'http://test.jest/api/v1.0/authenticate/?silent=true&next=http%3A%2F%2Ftest.jest%2F',
    );
    expect(setItemSpy).toHaveBeenCalledWith(
      SILENT_LOGIN_RETRY,
      expect.stringMatching(/^\d+$/),
    );
  });

  it('holds back a new silent login for a minute only', () => {
    vi.useFakeTimers({ now: 1_000_000 });
    gotoSilentLogin();
    expect(hasTrySilent()).toBe(true);

    vi.setSystemTime(1_000_000 + 61_000);
    expect(hasTrySilent()).toBe(false);

    // The flag of an older Docs never expired
    localStorage.setItem(SILENT_LOGIN_RETRY, 'true');
    expect(hasTrySilent()).toBe(false);
    vi.useRealTimers();
  });
});
