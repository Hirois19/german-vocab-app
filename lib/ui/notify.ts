/**
 * Cross-platform message dialog.
 *
 * `Alert` from react-native is `class Alert { static alert() {} }` on
 * react-native-web: calling it does nothing at all. Since this app runs on the
 * web, every `Alert.alert` error path was invisible there, which is how a
 * failing action could look like a button that simply does nothing.
 *
 * `notify` is fire-and-forget. `notifyAsync` resolves once the user dismisses,
 * for the flows that have to act afterwards (navigate back, reload a list).
 * Both take the same positional arguments as `Alert.alert`.
 */

import { Alert, Platform } from 'react-native';

export function notify(title: string, message?: string): void {
  void notifyAsync(title, message);
}

export function notifyAsync(title: string, message?: string): Promise<void> {
  const text = message ? `${title}\n\n${message}` : title;

  if (Platform.OS === 'web') {
    globalThis.alert(text);
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    Alert.alert(title, message, [{ text: 'OK', onPress: () => resolve() }], {
      cancelable: true,
      onDismiss: () => resolve(),
    });
  });
}
