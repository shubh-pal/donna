import React, { createContext, useContext } from 'react';
import { useAmbientMode } from '../hooks/useAmbientMode';

type AmbientModeContextValue = ReturnType<typeof useAmbientMode>;

const AmbientModeContext = createContext<AmbientModeContextValue | null>(null);

/**
 * Hosts exactly one `useAmbientMode()` instance for the whole signed-in
 * app (mounted once in `RootNavigator.tsx`, above the screen stack) so
 * that leaving the Ambient Mode screen — or any screen — never tears down
 * background listening. Every screen that needs to read status or control
 * ambient mode (the Ambient Mode screen itself, the persistent listening
 * banner) reads it via `useAmbientModeContext` instead of calling
 * `useAmbientMode` again, which would start a second, independent native
 * capture + Gemini Live session.
 */
export function AmbientModeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const value = useAmbientMode();
  return (
    <AmbientModeContext.Provider value={value}>
      {children}
    </AmbientModeContext.Provider>
  );
}

export function useAmbientModeContext(): AmbientModeContextValue {
  const context = useContext(AmbientModeContext);
  if (!context) {
    throw new Error(
      'useAmbientModeContext must be used within an AmbientModeProvider',
    );
  }
  return context;
}
