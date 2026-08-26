export type AuthStackParamList = {
  Login: undefined;
  Signup: undefined;
  ForgotPassword: undefined;
};

export type AppStackParamList = {
  Home: undefined;
  Settings: undefined;
  Conversation: undefined;
};

export type RootStackParamList = AuthStackParamList & AppStackParamList;
