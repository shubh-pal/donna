import { useCallback, useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';
import {
  check,
  checkNotifications,
  openSettings,
  request,
  requestNotifications,
  PERMISSIONS,
  RESULTS,
  type PermissionStatus,
} from 'react-native-permissions';

export type PermissionKey = 'microphone' | 'bluetooth' | 'notifications';

/**
 * A permission status per key, or 'unsupported' when this platform/OS
 * version doesn't have that permission at all (e.g. Bluetooth runtime
 * permission pre-Android 12) — react-native-permissions reports that as
 * RESULTS.UNAVAILABLE, which we surface distinctly from "denied".
 */
export type DisplayStatus =
  | 'granted'
  | 'denied'
  | 'blocked'
  | 'limited'
  | 'unsupported'
  | 'checking';

export type PermissionStatuses = Record<PermissionKey, DisplayStatus>;

const INITIAL_STATUSES: PermissionStatuses = {
  microphone: 'checking',
  bluetooth: 'checking',
  notifications: 'checking',
};

function toDisplayStatus(status: PermissionStatus): DisplayStatus {
  switch (status) {
    case RESULTS.GRANTED:
      return 'granted';
    case RESULTS.DENIED:
      return 'denied';
    case RESULTS.BLOCKED:
      return 'blocked';
    case RESULTS.LIMITED:
      return 'limited';
    case RESULTS.UNAVAILABLE:
    default:
      return 'unsupported';
  }
}

// Microphone and Bluetooth use react-native-permissions' `check`/`request`
// against a platform-specific Permission constant. Notifications go
// through the library's separate checkNotifications/requestNotifications
// helpers instead (there's no single cross-platform Permission constant
// for them).
const MICROPHONE_PERMISSION = Platform.select({
  ios: PERMISSIONS.IOS.MICROPHONE,
  android: PERMISSIONS.ANDROID.RECORD_AUDIO,
});

// Bluetooth *connect* permission is only meaningful on Android 12+ and
// iOS; ambient mode (Phase 3) will actually use this. react-native-permissions
// returns 'unavailable' gracefully on OS versions that don't have it.
const BLUETOOTH_PERMISSION = Platform.select({
  ios: PERMISSIONS.IOS.BLUETOOTH,
  android: PERMISSIONS.ANDROID.BLUETOOTH_CONNECT,
});

async function checkOne(
  permission: string | undefined,
): Promise<DisplayStatus> {
  if (!permission) return 'unsupported';
  try {
    return toDisplayStatus(await check(permission as never));
  } catch {
    return 'unsupported';
  }
}

/**
 * Reads current mic/Bluetooth/notification permission status and exposes
 * a best-effort `request` + `openSettings`.
 *
 * Note (Phase 2): this project hasn't been run on a real device/emulator
 * in this environment, so the request paths below are implemented to the
 * documented react-native-permissions API but unverified end-to-end —
 * see NOTES.md. Status *checking* (via `check`/`checkNotifications`) is
 * the primary thing Settings relies on; `requestAll` is best-effort.
 */
export function usePermissionStatuses() {
  const [statuses, setStatuses] =
    useState<PermissionStatuses>(INITIAL_STATUSES);

  const refresh = useCallback(async () => {
    const [microphone, bluetooth, notificationsResult] = await Promise.all([
      checkOne(MICROPHONE_PERMISSION),
      checkOne(BLUETOOTH_PERMISSION),
      checkNotifications().catch(() => null),
    ]);

    setStatuses({
      microphone,
      bluetooth,
      notifications: notificationsResult
        ? toDisplayStatus(notificationsResult.status)
        : 'unsupported',
    });
  }, []);

  useEffect(() => {
    refresh();
    // Re-check whenever the user returns from the OS Settings app, so a
    // permission granted/revoked there is reflected without a manual
    // refresh.
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') refresh();
    });
    return () => subscription.remove();
  }, [refresh]);

  const requestOne = useCallback(
    async (key: PermissionKey) => {
      if (key === 'notifications') {
        await requestNotifications(['alert', 'sound']).catch(() => null);
      } else {
        const permission =
          key === 'microphone' ? MICROPHONE_PERMISSION : BLUETOOTH_PERMISSION;
        if (permission) await request(permission as never).catch(() => null);
      }
      await refresh();
    },
    [refresh],
  );

  return {
    statuses,
    refresh,
    requestPermission: requestOne,
    openSettings: () => openSettings().catch(() => null),
  };
}
