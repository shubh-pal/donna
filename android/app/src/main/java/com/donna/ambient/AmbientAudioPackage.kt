package com.donna.ambient

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class AmbientAudioPackage : ReactPackage {
  override fun createNativeModules(
    reactContext: ReactApplicationContext,
  ): List<NativeModule> = listOf(AmbientAudioModule(reactContext))

  // Return type must match ReactPackage's exact signature
  // (List<ViewManager<in Nothing, in Nothing>>) for the override to
  // resolve — this package registers no views, so an empty list
  // satisfies it regardless of the generic bound.
  override fun createViewManagers(
    reactContext: ReactApplicationContext,
  ): List<ViewManager<in Nothing, in Nothing>> = emptyList()
}
