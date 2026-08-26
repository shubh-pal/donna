import {
  canDonnaSpeakThroughThisRoute,
  connectedBluetoothDeviceNames,
  isBluetoothDeviceType,
  isBluetoothOutputActive,
  type AudioRouteInfo,
} from '../src/audio/audioRoute';

// This is the most safety-critical logic in the app: ambient mode must
// NEVER let Donna speak out loud through the phone's own speaker. Every
// case here is a "would this wrongly let her speak?" check.

describe('isBluetoothOutputActive', () => {
  it('is false when there is no route at all', () => {
    expect(isBluetoothOutputActive(null)).toBe(false);
    expect(isBluetoothOutputActive(undefined)).toBe(false);
  });

  it('is false when the route has a malformed/missing outputs array', () => {
    expect(isBluetoothOutputActive({} as AudioRouteInfo)).toBe(false);
    expect(
      isBluetoothOutputActive({ outputs: null } as unknown as AudioRouteInfo),
    ).toBe(false);
  });

  it('is false when the only output is the built-in speaker', () => {
    expect(
      isBluetoothOutputActive({
        outputs: [{ type: 'built-in-speaker' }],
      }),
    ).toBe(false);
  });

  it('is false when the only output is the built-in earpiece/receiver', () => {
    expect(
      isBluetoothOutputActive({
        outputs: [{ type: 'built-in-receiver' }],
      }),
    ).toBe(false);
  });

  it('is false for wired headphones/headset — wired is not Bluetooth', () => {
    expect(
      isBluetoothOutputActive({ outputs: [{ type: 'wired-headphones' }] }),
    ).toBe(false);
    expect(
      isBluetoothOutputActive({ outputs: [{ type: 'wired-headset' }] }),
    ).toBe(false);
  });

  it('is false for USB and AirPlay outputs', () => {
    expect(isBluetoothOutputActive({ outputs: [{ type: 'usb' }] })).toBe(false);
    expect(isBluetoothOutputActive({ outputs: [{ type: 'airplay' }] })).toBe(
      false,
    );
  });

  it('is true for classic Bluetooth audio (A2DP)', () => {
    expect(
      isBluetoothOutputActive({ outputs: [{ type: 'bluetooth-a2dp' }] }),
    ).toBe(true);
  });

  it('is true for Bluetooth telephony audio (SCO, e.g. some car kits/headsets)', () => {
    expect(
      isBluetoothOutputActive({ outputs: [{ type: 'bluetooth-sco' }] }),
    ).toBe(true);
  });

  it('is true for Bluetooth LE Audio', () => {
    expect(
      isBluetoothOutputActive({ outputs: [{ type: 'bluetooth-le' }] }),
    ).toBe(true);
  });

  it('is true for a Bluetooth-connected MFi hearing aid', () => {
    expect(
      isBluetoothOutputActive({ outputs: [{ type: 'hearing-aid' }] }),
    ).toBe(true);
  });

  it('is true when Bluetooth is one of several simultaneous outputs', () => {
    expect(
      isBluetoothOutputActive({
        outputs: [{ type: 'built-in-speaker' }, { type: 'bluetooth-a2dp' }],
      }),
    ).toBe(true);
  });

  it('is false for an empty outputs array (nothing connected)', () => {
    expect(isBluetoothOutputActive({ outputs: [] })).toBe(false);
  });

  it('fails closed on an unrecognized/garbage device type rather than assuming Bluetooth', () => {
    expect(
      isBluetoothOutputActive({
        outputs: [{ type: 'some-future-device-type' as never }],
      }),
    ).toBe(false);
  });
});

describe('isBluetoothDeviceType', () => {
  it('fails closed on null/undefined/empty', () => {
    expect(isBluetoothDeviceType(null)).toBe(false);
    expect(isBluetoothDeviceType(undefined)).toBe(false);
    expect(isBluetoothDeviceType('' as never)).toBe(false);
  });

  it('recognizes every Bluetooth type and rejects every non-Bluetooth type', () => {
    (
      [
        'bluetooth-a2dp',
        'bluetooth-sco',
        'bluetooth-le',
        'hearing-aid',
      ] as const
    ).forEach(type => expect(isBluetoothDeviceType(type)).toBe(true));

    (
      [
        'wired-headphones',
        'wired-headset',
        'usb',
        'airplay',
        'built-in-speaker',
        'built-in-receiver',
        'other',
      ] as const
    ).forEach(type => expect(isBluetoothDeviceType(type)).toBe(false));
  });
});

describe('connectedBluetoothDeviceNames', () => {
  it('returns an empty list for no route or no Bluetooth outputs', () => {
    expect(connectedBluetoothDeviceNames(null)).toEqual([]);
    expect(
      connectedBluetoothDeviceNames({
        outputs: [{ type: 'built-in-speaker' }],
      }),
    ).toEqual([]);
  });

  it('returns the names of connected Bluetooth outputs only', () => {
    expect(
      connectedBluetoothDeviceNames({
        outputs: [
          { type: 'built-in-speaker', name: 'iPhone Speaker' },
          { type: 'bluetooth-a2dp', name: 'Pixel Buds Pro' },
        ],
      }),
    ).toEqual(['Pixel Buds Pro']);
  });

  it('skips Bluetooth outputs with no reported name', () => {
    expect(
      connectedBluetoothDeviceNames({ outputs: [{ type: 'bluetooth-a2dp' }] }),
    ).toEqual([]);
  });
});

describe('canDonnaSpeakThroughThisRoute (the call-site gate)', () => {
  it('mirrors isBluetoothOutputActive', () => {
    expect(canDonnaSpeakThroughThisRoute(null)).toBe(false);
    expect(
      canDonnaSpeakThroughThisRoute({ outputs: [{ type: 'bluetooth-a2dp' }] }),
    ).toBe(true);
    expect(
      canDonnaSpeakThroughThisRoute({
        outputs: [{ type: 'built-in-speaker' }],
      }),
    ).toBe(false);
  });
});
