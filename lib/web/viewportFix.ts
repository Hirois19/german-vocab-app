/**
 * Makes the web app box match the visible viewport on mobile browsers.
 *
 * The Expo web template sizes the root element with `height: 100%`. On iOS
 * Safari that resolves against the large viewport, the one measured with the
 * browser toolbars hidden, while the bottom toolbar is drawn on top of the
 * page. The bottom of the app therefore sits underneath the toolbar, and since
 * the template also sets `body { overflow: hidden }` the page cannot be
 * scrolled to reach it. Bottom-anchored controls (Create deck, the rating row,
 * the tab bar) were unreachable.
 *
 * `100dvh` tracks the currently visible viewport instead, so the app always
 * ends above the toolbar. `viewport-fit=cover` is what makes the
 * `env(safe-area-inset-*)` values non-zero, which is what the screens read
 * through `useSafeAreaInsets` to clear the home indicator.
 *
 * This runs at runtime rather than through `app/+html.tsx` because that file
 * only applies to `web.output: "static"`. This app exports as `single`, where
 * Expo always emits its own HTML template.
 */

import { Platform } from 'react-native';

const STYLE_ID = 'viewport-height-fix';

const CSS = `@supports (height: 100dvh) {
  html, body, #root { height: 100dvh; }
}`;

export function applyWebViewportFix(): void {
  if (Platform.OS !== 'web') return;
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;

  const viewport = document.querySelector('meta[name="viewport"]');
  const content = viewport?.getAttribute('content');
  if (viewport && content && !content.includes('viewport-fit')) {
    viewport.setAttribute('content', `${content}, viewport-fit=cover`);
  }

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}
