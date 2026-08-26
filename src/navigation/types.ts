export type AuthStackParamList = {
  Login: undefined;
  Signup: undefined;
  ForgotPassword: undefined;
};

export type AppStackParamList = {
  Home: undefined;
  Settings: undefined;
};

export type RootStackParamList = AuthStackParamList & AppStackParamList;
