export type AuthStackParamList = {
  Welcome: undefined;
  Login: undefined;
  Signup: undefined;
  ForgotPassword: undefined;
};

/**
 * The Home tab is just the Conversation screen — no nested stack
 * needed. `continueSessionId`, when present, is set by
 * HistoryDetailScreen's "Continue This Conversation" — Conversation
 * resolves it into a past session's messages and resumes from there
 * (see ConversationScreen.tsx and useLiveSession's `initialTranscript`).
 */
export type HomeTabParamList = {
  Conversation: { continueSessionId?: string } | undefined;
};

export type HistoryStackParamList = {
  History: undefined;
  HistoryDetail: { sessionId: string };
};

export type SettingsStackParamList = {
  SettingsHome: undefined;
  APIKey: undefined;
  AmbientMode: undefined;
  VoicePersona: undefined;
  Memory: undefined;
  Privacy: undefined;
  About: undefined;
};

export type AppTabParamList = {
  HomeTab: undefined;
  HistoryTab: undefined;
  SettingsTab: undefined;
};

/**
 * Kept for the handful of places (e.g. the Conversation screen's "no
 * key yet" card) that jump straight to a screen in a *different* tab's
 * stack — `navigation.getParent()` gives back an untyped navigator, so
 * this is the param list that cast is asserted against.
 */
export type RootStackParamList = AuthStackParamList &
  HomeTabParamList &
  HistoryStackParamList &
  SettingsStackParamList &
  AppTabParamList;
