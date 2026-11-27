import { useEffect } from 'react';

import { useCunninghamTheme } from '@/cunningham';

type ColorsTokens = ReturnType<
  typeof useCunninghamTheme.getState
>['colorsTokens'];

const isCssVariable = (value: unknown) =>
  typeof value === 'string' && value.startsWith('var(');

const followCssVariables = () => {
  const { colorsTokens } = useCunninghamTheme.getState();
  if (Object.values(colorsTokens).every(isCssVariable)) {
    return;
  }
  const followed: ColorsTokens = Object.fromEntries(
    Object.keys(colorsTokens).map((key) => [
      key,
      `var(--c--globals--colors--${key})`,
    ]),
  );
  useCunninghamTheme.setState({ colorsTokens: followed });
};

/**
 * The colours Docs reads in JavaScript are hex values fixed at build time, so
 * the theme sheet of Twake (FRONTEND_CSS_URL) cannot reach them. They point to
 * the Cunningham variables instead, again after each change of theme.
 */
export const useCssColorTokens = () => {
  useEffect(() => {
    followCssVariables();
    return useCunninghamTheme.subscribe(followCssVariables);
  }, []);
};
