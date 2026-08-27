import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { User } from 'firebase/auth';
import { subscribeToAuthChanges } from '../config/authService';
import { getOnboardingComplete, setOnboardingComplete } from '../config/preferences';

type AuthContextValue = {
  user: User | null;
  initializing: boolean;
  /**
   * Whether the signed-in user has been through (or explicitly skipped)
   * the onboarding interview — `null` while that's still being read
   * from storage (right after a fresh sign-in), so `RootNavigator` can
   * tell "not decided yet" apart from "decided: false" and avoid a
   * flash of the wrong screen.
   */
  onboardingComplete: boolean | null;
  /** Called by `OnboardingScreen` once the interview finishes or is skipped — flips the app over to the main tabs. */
  markOnboardingComplete: () => Promise<void>;
  /** Called from Settings ("Redo interview") — flips back to `OnboardingScreen` without touching any already-stored memory facts. */
  resetOnboarding: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue>({
  user: null,
  initializing: true,
  onboardingComplete: null,
  markOnboardingComplete: async () => {},
  resetOnboarding: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [onboardingComplete, setOnboardingCompleteState] = useState<
    boolean | null
  >(null);

  useEffect(() => {
    const unsubscribe = subscribeToAuthChanges(nextUser => {
      setUser(nextUser);
      setInitializing(false);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!user) {
      // Signed out — reset so a *different* account signing in next
      // doesn't briefly inherit the previous user's onboarding status
      // before the read below completes.
      setOnboardingCompleteState(null);
      return;
    }
    let cancelled = false;
    getOnboardingComplete().then(complete => {
      if (!cancelled) setOnboardingCompleteState(complete);
    });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const markOnboardingComplete = useCallback(async () => {
    await setOnboardingComplete(true);
    setOnboardingCompleteState(true);
  }, []);

  const resetOnboarding = useCallback(async () => {
    await setOnboardingComplete(false);
    setOnboardingCompleteState(false);
  }, []);

  const value = useMemo(
    () => ({
      user,
      initializing,
      onboardingComplete,
      markOnboardingComplete,
      resetOnboarding,
    }),
    [
      user,
      initializing,
      onboardingComplete,
      markOnboardingComplete,
      resetOnboarding,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
