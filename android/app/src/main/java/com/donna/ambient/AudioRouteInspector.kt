package com.donna.ambient

import android.content.Context
import android.media.AudioDeviceInfo
import android.media.AudioManager

/**
 * One output device, normalized to the same vocabulary
 * `src/audio/audioRoute.ts` uses on the JS side (`AudioOutputDeviceType`)
 * — the JS `isBluetoothOutputActive()` gate is what actually decides
 * whether Donna may speak; this class's only job is to report the
 * device types truthfully, not to make that decision itself.
 */
data class AudioOutputDeviceSnapshot(val type: String, val name: String?)

data class AudioRouteSnapshot(val outputs: List<AudioOutputDeviceSnapshot>)

/**
 * Reads the current set of active audio *output* devices from
 * [AudioManager]. There is no single "currentRoute" API on Android the
 * way `AVAudioSession.currentRoute` works on iOS — instead this reads
 * every currently-connected output device and normalizes each one,
 * mirroring how a Bluetooth headset, wired headphones, and the phone
 * speaker can all technically be "connected" at once (Android decides
 * which one audio actually plays through internally; the JS-side gate
 * cares about whether *any* connected output is Bluetooth).
 */
object AudioRouteInspector {

  fun currentRoute(context: Context): AudioRouteSnapshot {
    val audioManager =
      context.getSystemService(Context.AUDIO_SERVICE) as? AudioManager
        ?: return AudioRouteSnapshot(emptyList())

    val devices =
      try {
        audioManager.getDevices(AudioManager.GET_DEVICES_OUTPUTS)
      } catch (_: Exception) {
        emptyArray()
      }

    val outputs = devices.map { normalize(it) }
    return AudioRouteSnapshot(outputs)
  }

  private fun normalize(device: AudioDeviceInfo): AudioOutputDeviceSnapshot {
    val type =
      when (device.type) {
        AudioDeviceInfo.TYPE_BLUETOOTH_A2DP -> "bluetooth-a2dp"
        AudioDeviceInfo.TYPE_BLUETOOTH_SCO -> "bluetooth-sco"
        // BLE Audio device types — added in API 31 (Android 12). Safe to
        // reference unconditionally: these are just compile-time int
        // constants resolved against compileSdk 37; on a device running
        // an older OS, AudioManager simply never reports a device with
        // this type, so this branch is inert there rather than crashing.
        AudioDeviceInfo.TYPE_BLE_HEADSET,
        AudioDeviceInfo.TYPE_BLE_SPEAKER,
        AudioDeviceInfo.TYPE_BLE_BROADCAST -> "bluetooth-le"
        // MFi/ASHA hearing aids — API 28+, same reasoning as above.
        AudioDeviceInfo.TYPE_HEARING_AID -> "hearing-aid"
        AudioDeviceInfo.TYPE_WIRED_HEADPHONES -> "wired-headphones"
        AudioDeviceInfo.TYPE_WIRED_HEADSET -> "wired-headset"
        AudioDeviceInfo.TYPE_USB_HEADSET,
        AudioDeviceInfo.TYPE_USB_DEVICE,
        AudioDeviceInfo.TYPE_USB_ACCESSORY -> "usb"
        AudioDeviceInfo.TYPE_BUILTIN_SPEAKER -> "built-in-speaker"
        AudioDeviceInfo.TYPE_BUILTIN_EARPIECE -> "built-in-receiver"
        else -> "other"
      }
    val name =
      try {
        device.productName?.toString()
      } catch (_: Exception) {
        null
      }
    return AudioOutputDeviceSnapshot(type, name)
  }
}
