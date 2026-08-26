import AVFoundation
import React

/**
 * iOS half of ambient mode. Read this alongside NOTES.md "Phase 3 — iOS"
 * before assuming it behaves like the Android foreground service: Apple
 * does **not** give a normal app the same "keep the mic open indefinitely
 * in the background/locked" guarantee Android's foreground-service APIs
 * do. What this file actually does, honestly:
 *
 * - Captures the mic via `AVAudioEngine`'s input node tap, converts each
 *   buffer to 16-bit/mono/16kHz PCM (matching what Gemini Live expects
 *   and what `micStreamer.ts`/Android's capture already produce), and
 *   forwards base64 chunks to JS exactly like the Android module does.
 * - Configures `AVAudioSession` with category `.playAndRecord`, which is
 *   the category Apple documents as required for the app to keep an
 *   active audio session (and therefore keep receiving mic input) while
 *   backgrounded — **conditioned on** the app declaring the `audio`
 *   entry under `UIBackgroundModes` in Info.plist (done — see that
 *   file's Phase 3 comment) *and* actually having an active audio
 *   session when it's backgrounded. This is the same mechanism VoIP,
 *   podcast, and dictation apps rely on for background/locked-screen
 *   audio — it is a real, working iOS mechanism, not a workaround.
 * - Reads `AVAudioSession.sharedInstance().currentRoute` before every
 *   decision that depends on it, normalized to this app's shared
 *   `AudioOutputDeviceType` vocabulary — the same contract Android's
 *   `AudioRouteInspector.kt` follows.
 *
 * **What this does NOT get you, honestly** (see NOTES.md for the full
 * writeup):
 * - No hard guarantee iOS keeps the process alive indefinitely. Apple's
 *   background-audio allowance is real but not unconditional — iOS can
 *   still suspend an app it decides isn't genuinely using the audio
 *   session, and Apple's App Review guidelines (2.5.4) specifically
 *   scrutinize apps that use `UIBackgroundModes: audio` without an
 *   obvious, continuous audio-focused purpose. An always-on passive
 *   listening assistant is a plausible rejection risk on that basis,
 *   independent of whether the code technically works.
 * - No CallKit/PushToTalk implementation here. Apple's PushToTalk
 *   framework (iOS 16+) is built for radio/walkie-talkie-style apps and
 *   requires Apple to grant a dedicated entitlement per app — not
 *   something obtainable or usable in this sandbox, and a materially
 *   different, heavier integration (channel-based, not "always listen
 *   passively") than what this feature needs. If Donna's ambient mode
 *   ever needs App-Review-safe, indefinite background listening, that
 *   entitlement request is the real next step, not more code here.
 * - **Not compiled or run anywhere in this sandbox** — there is no
 *   macOS/Xcode available. Written directly against Apple's documented
 *   `AVAudioEngine`/`AVAudioSession`/React Native Swift-module APIs, and
 *   registered in `Donna.xcodeproj/project.pbxproj` by hand (see that
 *   file's Phase 3 comment) since there's no Xcode here to do it via the
 *   UI. A human must open this in Xcode, resolve any build errors, and
 *   verify on a real device before trusting any of it.
 */
@objc(AmbientAudioModule)
class AmbientAudioModule: RCTEventEmitter {

  private let engine = AVAudioEngine()
  private var isCapturing = false
  private var converter: AVAudioConverter?
  private let targetFormat = AVAudioFormat(
    commonFormat: .pcmFormatInt16,
    // Must match LIVE_INPUT_SAMPLE_RATE in src/config/geminiLive.ts.
    sampleRate: 16000,
    channels: 1,
    interleaved: true
  )!

  private var hasListeners = false

  override static func requiresMainQueueSetup() -> Bool {
    return true
  }

  override func supportedEvents() -> [String]! {
    return [
      "DonnaAmbientAudioChunk",
      "DonnaAmbientRouteChanged",
      "DonnaAmbientForceStopped",
    ]
  }

  override func startObserving() {
    hasListeners = true
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(handleRouteChange),
      name: AVAudioSession.routeChangeNotification,
      object: nil
    )
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(handleInterruption),
      name: AVAudioSession.interruptionNotification,
      object: nil
    )
  }

  override func stopObserving() {
    hasListeners = false
    NotificationCenter.default.removeObserver(self)
  }

  // MARK: - Exported methods (see AmbientAudioModule.m for the RCT_EXTERN_METHOD bridge)

  @objc(startAmbientListening:rejecter:)
  func startAmbientListening(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    if isCapturing {
      resolve(nil)
      return
    }

    // AVAudioSession.recordPermission (not the newer AVAudioApplication
    // API, which requires iOS 17+) — this project's deployment target is
    // iOS 15.1 (see project.pbxproj IPHONEOS_DEPLOYMENT_TARGET).
    let permission = AVAudioSession.sharedInstance().recordPermission
    guard permission == .granted else {
      reject(
        "PERMISSION_DENIED",
        "Microphone permission is not granted. Ask for it from JS before calling startAmbientListening().",
        nil
      )
      return
    }

    do {
      try beginCapture()
      resolve(nil)
    } catch {
      reject("START_FAILED", error.localizedDescription, error)
    }
  }

  @objc(stopAmbientListening:rejecter:)
  func stopAmbientListening(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    endCapture(forced: false)
    resolve(nil)
  }

  @objc(isAmbientListening:rejecter:)
  func isAmbientListening(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    resolve(isCapturing)
  }

  @objc(getCurrentAudioRoute:rejecter:)
  func getCurrentAudioRoute(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    resolve(currentRouteMap())
  }

  // MARK: - Capture

  private func beginCapture() throws {
    let session = AVAudioSession.sharedInstance()
    // .allowBluetooth / .allowBluetoothA2DP: without these options the
    // session would refuse to route audio to a connected Bluetooth
    // device at all, which would make the "only speak through
    // Bluetooth" requirement impossible to satisfy on iOS.
    try session.setCategory(
      .playAndRecord,
      mode: .default,
      options: [.allowBluetooth, .allowBluetoothA2DP, .mixWithOthers]
    )
    try session.setActive(true, options: .notifyOthersOnDeactivation)

    let inputNode = engine.inputNode
    let inputFormat = inputNode.inputFormat(forBus: 0)
    guard
      let converter = AVAudioConverter(from: inputFormat, to: targetFormat)
    else {
      throw NSError(
        domain: "com.donna.ambient",
        code: 1,
        userInfo: [
          NSLocalizedDescriptionKey: "Could not build an audio converter for this input format."
        ]
      )
    }
    self.converter = converter

    inputNode.installTap(onBus: 0, bufferSize: 4096, format: inputFormat) {
      [weak self] buffer, _ in
      self?.handleCapturedBuffer(buffer)
    }

    engine.prepare()
    try engine.start()
    isCapturing = true
    emit("DonnaAmbientRouteChanged", body: currentRouteMap())
  }

  private func handleCapturedBuffer(_ buffer: AVAudioPCMBuffer) {
    guard let converter = converter else { return }

    let outputCapacity =
      AVAudioFrameCount(targetFormat.sampleRate * Double(buffer.frameLength) / buffer.format.sampleRate) + 16
    guard
      let outputBuffer = AVAudioPCMBuffer(
        pcmFormat: targetFormat, frameCapacity: outputCapacity)
    else { return }

    var error: NSError?
    var suppliedInput = false
    let status = converter.convert(to: outputBuffer, error: &error) { _, outStatus in
      if suppliedInput {
        outStatus.pointee = .noDataNow
        return nil
      }
      suppliedInput = true
      outStatus.pointee = .haveData
      return buffer
    }

    guard status != .error, error == nil else { return }
    guard let channelData = outputBuffer.int16ChannelData else { return }

    let frameLength = Int(outputBuffer.frameLength)
    guard frameLength > 0 else { return }
    let data = Data(bytes: channelData[0], count: frameLength * MemoryLayout<Int16>.size)
    let base64 = data.base64EncodedString()
    emit("DonnaAmbientAudioChunk", body: base64)
  }

  private func endCapture(forced: Bool) {
    guard isCapturing else { return }
    isCapturing = false
    engine.inputNode.removeTap(onBus: 0)
    engine.stop()
    converter = nil
    try? AVAudioSession.sharedInstance().setActive(
      false, options: .notifyOthersOnDeactivation)
    if forced {
      emit("DonnaAmbientForceStopped", body: nil)
    }
  }

  // MARK: - Route / interruption handling

  @objc private func handleRouteChange(_ notification: Notification) {
    emit("DonnaAmbientRouteChanged", body: currentRouteMap())
  }

  @objc private func handleInterruption(_ notification: Notification) {
    guard
      let info = notification.userInfo,
      let typeValue = info[AVAudioSessionInterruptionTypeKey] as? UInt,
      let type = AVAudioSession.InterruptionType(rawValue: typeValue)
    else { return }

    switch type {
    case .began:
      // A phone call or another app took the audio session — iOS has
      // already stopped delivering input by this point. Reflect that
      // honestly rather than pretending capture is still active.
      if isCapturing {
        endCapture(forced: true)
      }
    case .ended:
      // Deliberately not auto-resuming: re-enabling ambient mode after
      // an interruption is a decision `useAmbientMode.ts` makes (mirrors
      // Android's "not START_STICKY" choice — no silent relisten).
      break
    @unknown default:
      break
    }
  }

  private func currentRouteMap() -> [String: Any] {
    let outputs = AVAudioSession.sharedInstance().currentRoute.outputs.map {
      output -> [String: Any] in
      var device: [String: Any] = ["type": normalizedType(for: output.portType)]
      device["name"] = output.portName
      return device
    }
    return ["outputs": outputs]
  }

  private func normalizedType(for portType: AVAudioSession.Port) -> String {
    switch portType {
    case .bluetoothA2DP:
      return "bluetooth-a2dp"
    case .bluetoothHFP:
      return "bluetooth-sco"
    case .bluetoothLE:
      return "bluetooth-le"
    case .headphones:
      return "wired-headphones"
    case .headsetMic:
      return "wired-headset"
    case .usbAudio:
      return "usb"
    case .airPlay:
      return "airplay"
    case .builtInSpeaker:
      return "built-in-speaker"
    case .builtInReceiver:
      return "built-in-receiver"
    default:
      return "other"
    }
  }

  private func emit(_ name: String, body: Any?) {
    guard hasListeners else { return }
    sendEvent(withName: name, body: body)
  }

  override func invalidate() {
    endCapture(forced: false)
    super.invalidate()
  }
}
