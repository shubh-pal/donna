package com.donna.ambient

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableArray
import com.facebook.react.bridge.WritableMap

private const val EVENT_AUDIO_CHUNK = "DonnaAmbientAudioChunk"
private const val EVENT_ROUTE_CHANGED = "DonnaAmbientRouteChanged"
private const val EVENT_FORCE_STOPPED = "DonnaAmbientForceStopped"

/**
 * The React Native bridge for ambient mode's Android side. Thin by
 * design: all the real work (mic capture, notification, foreground
 * service lifecycle) lives in [AmbientForegroundService]; this module's
 * job is to start/stop that service, answer status queries, and forward
 * [AmbientBridge] callbacks on to JS as RN device events — matching the
 * event names `src/native/ambientAudio.ts` subscribes to.
 */
class AmbientAudioModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName() = "AmbientAudioModule"

  init {
    AmbientBridge.onAudioChunk = { base64Pcm -> sendEvent(EVENT_AUDIO_CHUNK, base64Pcm) }
    AmbientBridge.onRouteChanged = { route -> sendEvent(EVENT_ROUTE_CHANGED, routeToMap(route)) }
    AmbientBridge.onForceStopped = { sendEvent(EVENT_FORCE_STOPPED, null) }
  }

  @ReactMethod
  fun startAmbientListening(promise: Promise) {
    val context = reactApplicationContext
    if (ContextCompat.checkSelfPermission(context, android.Manifest.permission.RECORD_AUDIO) !=
      PackageManager.PERMISSION_GRANTED
    ) {
      promise.reject(
        "PERMISSION_DENIED",
        "RECORD_AUDIO permission is not granted. Ask for it from JS before calling startAmbientListening().",
      )
      return
    }

    try {
      val intent =
        Intent(context, AmbientForegroundService::class.java)
          .setAction(AmbientForegroundService.ACTION_START)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        context.startForegroundService(intent)
      } else {
        context.startService(intent)
      }
      promise.resolve(null)
    } catch (error: Exception) {
      promise.reject("START_FAILED", error.message, error)
    }
  }

  @ReactMethod
  fun stopAmbientListening(promise: Promise) {
    try {
      val context = reactApplicationContext
      val intent =
        Intent(context, AmbientForegroundService::class.java)
          .setAction(AmbientForegroundService.ACTION_STOP)
      context.startService(intent)
      promise.resolve(null)
    } catch (error: Exception) {
      // The service may already be stopped/torn down — that's not a
      // real failure from the caller's point of view.
      promise.resolve(null)
    }
  }

  @ReactMethod
  fun isAmbientListening(promise: Promise) {
    promise.resolve(AmbientBridge.isServiceRunning)
  }

  @ReactMethod
  fun getCurrentAudioRoute(promise: Promise) {
    val route = AudioRouteInspector.currentRoute(reactApplicationContext)
    promise.resolve(routeToMap(route))
  }

  private fun routeToMap(route: AudioRouteSnapshot): WritableMap {
    val outputs: WritableArray = Arguments.createArray()
    for (device in route.outputs) {
      val map = Arguments.createMap()
      map.putString("type", device.type)
      if (device.name != null) map.putString("name", device.name)
      outputs.pushMap(map)
    }
    val result = Arguments.createMap()
    result.putArray("outputs", outputs)
    return result
  }

  private fun sendEvent(eventName: String, payload: Any?) {
    // hasActiveReactInstance() guards against the well-known race where
    // a callback fires (e.g. AmbientBridge is invoked from the
    // service's background thread) while the Catalyst instance is
    // mid-teardown — same pattern RN's own AppStateModule uses.
    if (!reactApplicationContext.hasActiveReactInstance()) return
    reactApplicationContext.emitDeviceEvent(eventName, payload)
  }
}
