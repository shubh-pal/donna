export type AuthStackParamList = {
  Welcome: undefined;
  Login: undefined;
  Signup: undefined;
  ForgotPassword: undefined;
};

/** The Home tab is just the Conversation screen — no nested stack needed. */
export type HomeTabParamList = {
  Conversation: undefined;
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
