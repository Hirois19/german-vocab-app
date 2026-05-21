// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const prettier = require('eslint-config-prettier');

module.exports = defineConfig([
  expoConfig,
  prettier,
  {
    // `public/` holds static assets copied verbatim into the web export
    // (e.g. the service worker, which runs in a worker scope, not the app).
    ignores: [
      'dist/*',
      'node_modules/*',
      '.expo/*',
      'coverage/*',
      'android/*',
      'ios/*',
      'public/*',
    ],
  },
]);
