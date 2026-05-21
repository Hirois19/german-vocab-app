/**
 * Registers the web service worker so the app can launch offline.
 *
 * Web only. Native builds ship their JavaScript on device and never need this.
 * The worker is registered only in production builds: a service worker in
 * development interferes with Metro's fast refresh and asset serving.
 *
 * The worker file itself lives at `public/service-worker.js`, which Expo copies
 * to the web export root, so it is served from `/service-worker.js`.
 */

import { Platform } from 'react-native';

export function registerServiceWorker(): void {
  if (Platform.OS !== 'web') return;
  if (__DEV__) return;
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const register = () => {
    navigator.serviceWorker.register('/service-worker.js').catch(() => {
      // Registration failure must never break app startup; offline launch is
      // an enhancement, not a requirement.
    });
  };

  // This module can be evaluated after the window `load` event has already
  // fired (Expo Router may evaluate the root layout lazily). In that case the
  // event listener would never run, so register immediately instead.
  if (document.readyState === 'complete') {
    register();
  } else {
    window.addEventListener('load', register);
  }
}
