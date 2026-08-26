// Objective-C bridge that registers the Swift class AmbientAudioModule
// (AmbientAudioModule.swift) with React Native — this is the documented
// pattern for exposing a Swift native module (see RCTBridgeModule.h's
// own doc comment for RCT_EXTERN_MODULE). NSObject is used as the
// nominal superclass here regardless of the Swift class's real
// superclass (RCTEventEmitter) — this macro only needs *some* class the
// Objective-C compiler can reference at compile time; the real class
// metadata comes from the Swift-compiled object file at link time.
#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(AmbientAudioModule, NSObject)

RCT_EXTERN_METHOD(startAmbientListening:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(stopAmbientListening:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(isAmbientListening:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(getCurrentAudioRoute:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)

@end
