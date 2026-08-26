package com.donna.ambient

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.media.AudioDeviceCallback
import android.media.AudioDeviceInfo
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Base64
import android.util.Log
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationCompat
import com.donna.R
import java.util.concurrent.atomic.AtomicBoolean

/**
 * The real, honestly-achievable half of ambient mode (see NOTES.md for
 * the iOS side, which is much more constrained by the OS). A proper
 * Android foreground service:
 *
 * - Holds `RECORD_AUDIO` and captures the mic via [AudioRecord] on a
 *   dedicated thread, in the same 16-bit/mono/16kHz PCM format
 *   `micStreamer.ts` already produces for hold-to-talk mode, so the
 *   existing `GeminiLiveSession` (JS) doesn't need to know it's
 *   receiving ambient audio instead.
 * - Posts the required persistent "Donna is listening" notification
 *   (Android requires a foreground service to show one; it doubles as
 *   this feature's OS-level, can't-be-hidden listening indicator) with
 *   a one-tap "Stop" action baked into the notification itself — a kill
 *   switch that works even if the app's own UI isn't on screen.
 * - Declares `foregroundServiceType="microphone"` in the manifest and
 *   passes the matching `ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE`
 *   here, which is what actually lets mic capture continue once the app
 *   is backgrounded/the screen is locked on Android 10+ — without both
 *   halves of that declaration, the OS silently stops delivering mic
 *   audio to a backgrounded app.
 * - Streams captured chunks to JS via [AmbientBridge] rather than
 *   re-implementing the Gemini Live WebSocket protocol in Kotlin — the
 *   JS thread keeps running as long as this foreground service keeps
 *   the process alive, so `GeminiLiveSession` (geminiLive.ts) stays the
 *   single implementation of that protocol.
 *
 * **Not** verified on a real device/emulator in this sandbox (no
 * Android device or emulator here) — written directly against Android's
 * documented `AudioRecord`/foreground-service/notification APIs. See
 * NOTES.md "Phase 3" for exactly what a human should check first on a
 * real device.
 */
class AmbientForegroundService : Service() {

  companion object {
    private const val TAG = "AmbientForegroundService"
    const val ACTION_START = "com.donna.ambient.action.START"
    const val ACTION_STOP = "com.donna.ambient.action.STOP"

    private const val NOTIFICATION_CHANNEL_ID = "donna_ambient_listening"
    private const val NOTIFICATION_ID = 4201

    // Must match LIVE_INPUT_SAMPLE_RATE in src/config/geminiLive.ts — if
    // that ever changes, this constant needs to change with it.
    private const val SAMPLE_RATE = 16000
    private const val CHANNEL_CONFIG = AudioFormat.CHANNEL_IN_MONO
    private const val AUDIO_FORMAT = AudioFormat.ENCODING_PCM_16BIT
    // Matches ANDROID_VOICE_RECOGNITION_SOURCE in src/audio/micStreamer.ts
    // — tuned for speech, with the platform's own noise
    // suppression/AGC applied where available.
    private const val AUDIO_SOURCE = MediaRecorder.AudioSource.VOICE_RECOGNITION
    // Matches STREAM_OPTIONS.bufferSize in micStreamer.ts, so ambient
    // mode's chunk cadence matches hold-to-talk mode's.
    private const val CHUNK_SIZE_BYTES = 4096
  }

  private var audioRecord: AudioRecord? = null
  private var captureThread: Thread? = null
  private val isCapturing = AtomicBoolean(false)
  private val mainHandler = Handler(Looper.getMainLooper())

  private val audioDeviceCallback =
    object : AudioDeviceCallback() {
      override fun onAudioDevicesAdded(addedDevices: Array<out AudioDeviceInfo>) =
        broadcastRouteChange()

      override fun onAudioDevicesRemoved(removedDevices: Array<out AudioDeviceInfo>) =
        broadcastRouteChange()
    }

  override fun onCreate() {
    super.onCreate()
    ensureNotificationChannel()
    val audioManager = getSystemService(Context.AUDIO_SERVICE) as? AudioManager
    audioManager?.registerAudioDeviceCallback(audioDeviceCallback, mainHandler)
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_STOP -> {
        stopCaptureAndSelf(forced = false)
        return START_NOT_STICKY
      }
      else -> startCapture()
    }
    // Not START_STICKY: if the OS kills this process, ambient mode
    // should NOT silently relaunch and start listening again without
    // the user re-enabling it — that would be a privacy footgun. JS
    // re-enables it explicitly on next app foreground if the user's
    // preference is still "on" (see useAmbientMode.ts).
    return START_NOT_STICKY
  }

  private fun startCapture() {
    if (isCapturing.get()) return

    if (ActivityCompat.checkSelfPermission(this, android.Manifest.permission.RECORD_AUDIO) !=
      PackageManager.PERMISSION_GRANTED
    ) {
      Log.w(TAG, "RECORD_AUDIO not granted; refusing to start ambient capture.")
      AmbientBridge.emitForceStopped()
      stopSelf()
      return
    }

    val minBufferSize =
      AudioRecord.getMinBufferSize(SAMPLE_RATE, CHANNEL_CONFIG, AUDIO_FORMAT)
    if (minBufferSize == AudioRecord.ERROR || minBufferSize == AudioRecord.ERROR_BAD_VALUE) {
      Log.e(TAG, "This device doesn't support 16kHz mono PCM capture.")
      AmbientBridge.emitForceStopped()
      stopSelf()
      return
    }

    val record =
      try {
        AudioRecord(
          AUDIO_SOURCE,
          SAMPLE_RATE,
          CHANNEL_CONFIG,
          AUDIO_FORMAT,
          maxOf(minBufferSize, CHUNK_SIZE_BYTES * 4),
        )
      } catch (error: Exception) {
        Log.e(TAG, "Failed to create AudioRecord", error)
        null
      }

    if (record == null || record.state != AudioRecord.STATE_INITIALIZED) {
      Log.e(TAG, "AudioRecord failed to initialize.")
      AmbientBridge.emitForceStopped()
      stopSelf()
      return
    }

    val notification = buildNotification()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(
        NOTIFICATION_ID,
        notification,
        ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE,
      )
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }

    audioRecord = record
    isCapturing.set(true)
    AmbientBridge.isServiceRunning = true
    broadcastRouteChange()

    record.startRecording()
    val thread =
      Thread({ runCaptureLoop(record) }, "DonnaAmbientCapture").apply {
        isDaemon = true
        start()
      }
    captureThread = thread
  }

  private fun runCaptureLoop(record: AudioRecord) {
    val buffer = ByteArray(CHUNK_SIZE_BYTES)
    while (isCapturing.get()) {
      val bytesRead = record.read(buffer, 0, buffer.size)
      if (bytesRead > 0) {
        val chunk =
          if (bytesRead == buffer.size) buffer else buffer.copyOf(bytesRead)
        val base64 = Base64.encodeToString(chunk, Base64.NO_WRAP)
        AmbientBridge.emitAudioChunk(base64)
      } else if (bytesRead < 0) {
        Log.e(TAG, "AudioRecord.read returned error code $bytesRead; stopping capture.")
        mainHandler.post { stopCaptureAndSelf(forced = true) }
        return
      }
    }
  }

  // Safe to call more than once (e.g. once from the ACTION_STOP path and
  // again from the onDestroy() it triggers) — every step below is a
  // null-safe or otherwise idempotent no-op on a second call.
  private fun stopCaptureAndSelf(forced: Boolean) {
    isCapturing.set(false)
    val threadToJoin = captureThread
    captureThread = null
    try {
      // AudioRecord.stop() is what actually unblocks a pending
      // read() call on the capture thread — Thread.interrupt() has no
      // effect on that native blocking call, so this is the real
      // signal, not just a status flag.
      audioRecord?.stop()
    } catch (_: Exception) {
      // Throws IllegalStateException if it was never successfully
      // recording — safe to ignore on the way out.
    }
    try {
      // Join briefly so release() below can never run while the
      // capture thread's last read() call is still returning on the
      // now-stopped AudioRecord — a real use-after-release race
      // otherwise. One buffer's worth of audio at 16kHz/mono/16-bit is
      // well under 300ms, so this is a short, bounded wait.
      threadToJoin?.join(300)
    } catch (_: InterruptedException) {
      Thread.currentThread().interrupt()
    }
    audioRecord?.release()
    audioRecord = null
    AmbientBridge.isServiceRunning = false
    if (forced) AmbientBridge.emitForceStopped()

    // Service.stopForeground(int) with the STOP_FOREGROUND_REMOVE
    // constant only exists from API 33 (Tiramisu) onward — calling it on
    // an older OS would fail with NoSuchMethodError since that overload
    // isn't in the framework classes there, hence the SDK_INT gate
    // matching TIRAMISU specifically (not just "some newer API").
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      stopForeground(STOP_FOREGROUND_REMOVE)
    } else {
      @Suppress("DEPRECATION")
      stopForeground(true)
    }
    stopSelf()
  }

  private fun broadcastRouteChange() {
    AmbientBridge.emitRouteChanged(AudioRouteInspector.currentRoute(this))
  }

  override fun onDestroy() {
    stopCaptureAndSelf(forced = false)
    val audioManager = getSystemService(Context.AUDIO_SERVICE) as? AudioManager
    audioManager?.unregisterAudioDeviceCallback(audioDeviceCallback)
    super.onDestroy()
  }

  override fun onBind(intent: Intent?) = null

  private fun ensureNotificationChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    val existing = manager.getNotificationChannel(NOTIFICATION_CHANNEL_ID)
    if (existing != null) return
    val channel =
      NotificationChannel(
        NOTIFICATION_CHANNEL_ID,
        "Ambient listening",
        NotificationManager.IMPORTANCE_LOW,
      ).apply {
        description = "Shows while Donna is listening in the background."
        setShowBadge(false)
      }
    manager.createNotificationChannel(channel)
  }

  private fun buildNotification(): Notification {
    val stopIntent =
      Intent(this, AmbientForegroundService::class.java).setAction(ACTION_STOP)
    val stopPendingIntent =
      PendingIntent.getService(
        this,
        0,
        stopIntent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )

    return NotificationCompat.Builder(this, NOTIFICATION_CHANNEL_ID)
      .setContentTitle("Donna is listening")
      .setContentText("Ambient mode is on — tap Stop to turn it off.")
      .setSmallIcon(R.mipmap.ic_launcher)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .addAction(0, "Stop", stopPendingIntent)
      .build()
  }
}
