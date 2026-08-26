import type { Persistence } from 'firebase/auth';

/**
 * `getReactNativePersistence` ships in the package's "react-native" export
 * condition, which Metro resolves correctly at runtime, but the public
 * TypeScript declarations (resolved via the "types" condition) don't
 * surface it. This restores the signature for type-checking; see
 * src/config/firebase.ts for the actual import.
 */
declare module 'firebase/auth' {
  export function getReactNativePersistence(storage: unknown): Persistence;
}
