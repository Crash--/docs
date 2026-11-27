import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useCunninghamTheme } from '@/cunningham';

import { useCssColorTokens } from '../useCssColorTokens';

describe('the colours read in JavaScript', () => {
  it('point to the Cunningham variables, again after a change of theme', () => {
    renderHook(() => useCssColorTokens());

    expect(useCunninghamTheme.getState().colorsTokens['brand-600']).toBe(
      'var(--c--globals--colors--brand-600)',
    );

    act(() => useCunninghamTheme.getState().setTheme('dark'));

    const { colorsTokens } = useCunninghamTheme.getState();
    expect(colorsTokens['gray-100']).toBe(
      'var(--c--globals--colors--gray-100)',
    );
    expect(
      Object.values(colorsTokens).every((value) => value?.startsWith('var(')),
    ).toBe(true);
  });
});
