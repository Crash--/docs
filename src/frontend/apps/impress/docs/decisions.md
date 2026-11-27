# Decisions

Decisions taken on the Twake fork of Docs (front), oldest first. Append only: a decision that changes gets a new entry that replaces the old one and cites it. Entry format: the `twake-decisions` skill of [linagora/twake-guidelines](https://github.com/linagora/twake-guidelines/blob/main/skills/twake-decisions/SKILL.md).

Categories: UX, UI, Product, Architecture, Infra, Tech.

## 2026-11-27, [Architecture] The look of Twake comes from a sheet on the Cunningham variables

- Decision: Docs takes the look of Twake through `/twake-theme/theme.css` (in `public/twake-theme`; `/twake/` belongs to the admin routes of the backend), loaded with the `FRONTEND_CSS_URL` setting that Docs offers, and a theme customization file shipped by the backend image. Patches to upstream files are kept for what the sheet cannot reach, and none was needed so far.
- Decided by: Crash-- (CTO), 2026-11-27, with an agent session (Claude Code)
- Why: the sheet and the files under `public/twake-theme` are new files, so a new version of Docs brings no conflict; only renamed Cunningham variables or `--docs--` classes need checking.
- Scope: every page of Docs on the platform and off it, light and dark, the share page framed by Drive.

## 2026-11-27, [UI] Values of twake-mui, the layout of the Workplace apps

- Decision: the palette, radii and shadows are those of twake-mui: buttons and badges are pills, a dialog or a menu is a paper of 6 px with the elevation 24 or 8, the page is `background.default` and the content a paper card 16 px from the edges above 1024 px, as `Layout/Content` of twake-mui. The dark scheme uses the dark palette of twake-mui. Under the Twake bar, the left panel has no logo of Docs and no rules, and the app is named Twake Docs.
- Decided by: an agent session (Claude Code) on the go of Crash-- (CTO) for a Twake look, 2026-11-27; the card layout, the hidden logo and the name wait for his confirmation
- Why: Docs sits next to Drive and Mail in the Workplace and must read as one of its apps.
- Scope: desktop and mobile, light and dark.

## 2026-11-27, [UI] Provisional values until Swann's answer

- Decision: provisional, waiting for Swann (provisoire, en attente de Swann). The icon and wordmark of Docs (`public/twake-theme/docs-icon.svg`, `docs-text.svg`) are drawn in the style of the app icons of twake-icons, which has none for Docs. The steps of the blue ramp that twake-css lacks are interpolated. Radii and shadows are the defaults of twake-mui (6 px papers, elevations 24 and 8) rather than values drawn for Docs.
- Decided by: Crash-- (CTO), 2026-11-27, with an agent session (Claude Code)
- Why: the integration should not wait for the three answers; each one replaces a file or a few variables of the sheet.
- Scope: the icon of the bar, the header and the favicon; the `brand-*` variables; the modal and menu radii and shadows.

## 2026-11-27, [Tech] The colours read in JavaScript point to the CSS variables

- Decision: the colours of `useCunninghamTheme` are `var(--c--globals--colors--…)` instead of the hex values of the build, set again after each change of theme (`useCssColorTokens`).
- Decided by: Crash-- (CTO), 2026-11-27, with an agent session (Claude Code)
- Why: about twenty colours (focus rings, the checked item of menus, avatars of invitations) are read in JavaScript, out of reach of the sheet. Pointing them to the variables needs no compiled theme, and so no change to upstream files.
- Scope: every colour of `colorsTokens`, on the platform and off it.
