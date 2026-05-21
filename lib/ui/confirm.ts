/**
 * Cross-platform confirmation dialog. Returns a promise that resolves to the
 * user's choice. On web, falls back to `window.confirm` because the Alert API
 * does not fire button callbacks on React Native Web.
 */

import { Alert, Platform } from 'react-native';

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

export function confirmAsync(opts: ConfirmOptions): Promise<boolean> {
  const confirmLabel = opts.confirmLabel ?? 'OK';
  const cancelLabel = opts.cancelLabel ?? 'Cancel';

  if (Platform.OS === 'web') {
    const text = opts.message ? `${opts.title}\n\n${opts.message}` : opts.title;
    return Promise.resolve(globalThis.confirm(text));
  }

  return new Promise((resolve) => {
    Alert.alert(
      opts.title,
      opts.message,
      [
        { text: cancelLabel, onPress: () => resolve(false), style: 'cancel' },
        {
          text: confirmLabel,
          onPress: () => resolve(true),
          style: opts.destructive ? 'destructive' : 'default',
        },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}
