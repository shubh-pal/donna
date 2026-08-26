package com.donna.ambient

/**
 * In-process bridge between [AmbientForegroundService] (owns the actual
 * `AudioRecord` capture loop and runs the whole time the app is
 * backgrounded/locked) and [AmbientAudioModule] (talks to JS via React
 * Native's event emitter).
 *
 * This is a plain singleton, not IPC/Binder/Messenger — that's a
 * deliberate simplification, not an oversight: `AmbientForegroundService`
 * is a normal in-process `Service` (no `android:process` set in the
 * manifest), so it always runs on the same process/classloader as the
 * rest of the app, and a shared object is the simplest correct way for
 * two components in one process to talk to each other. If a future
 * change ever moves the service to a separate process (e.g. for extra
 * crash isolation), this bridge would need to become real IPC instead.
 */
object AmbientBridge {
  /** Ground truth for "is the foreground service actually running right now?" — read by AmbientAudioModule.isAmbientListening(). */
  @Volatile
  var isServiceRunning: Boolean = false

  @Volatile
  var onAudioChunk: ((base64Pcm: String) -> Unit)? = null

  @Volatile
  var onRouteChanged: ((route: AudioRouteSnapshot) -> Unit)? = null

  /** Fired when the OS (not the user) ends capture — e.g. the system reclaims the foreground service under extreme memory pressure, or RECORD_AUDIO is revoked while running. JS treats this the same as the user tapping the kill switch. */
  @Volatile
  var onForceStopped: (() -> Unit)? = null

  fun emitAudioChunk(base64Pcm: String) {
    onAudioChunk?.invoke(base64Pcm)
  }

  fun emitRouteChanged(route: AudioRouteSnapshot) {
    onRouteChanged?.invoke(route)
  }

  fun emitForceStopped() {
    onForceStopped?.invoke()
  }
}
