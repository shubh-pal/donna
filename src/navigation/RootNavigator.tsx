import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import {
  DefaultTheme,
  NavigationContainer,
  getFocusedRouteNameFromRoute,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useAuth } from '../context/AuthContext';
import { colors } from '../theme/colors';
import WelcomeScreen from '../screens/WelcomeScreen';
import LoginScreen from '../screens/LoginScreen';
import SignupScreen from '../screens/SignupScreen';
import ForgotPasswordScreen from '../screens/ForgotPasswordScreen';
import ConversationScreen from '../screens/ConversationScreen';
import HistoryScreen from '../screens/HistoryScreen';
import HistoryDetailScreen from '../screens/HistoryDetailScreen';
import SettingsScreen from '../screens/SettingsScreen';
import APIKeyScreen from '../screens/APIKeyScreen';
import AmbientModeScreen from '../screens/AmbientModeScreen';
import VoicePersonaScreen from '../screens/VoicePersonaScreen';
import PrivacyScreen from '../screens/PrivacyScreen';
import AboutScreen from '../screens/AboutScreen';
import { AmbientModeProvider } from '../context/AmbientModeContext';
import AmbientListeningBanner from '../components/AmbientListeningBanner';
import type {
  AppTabParamList,
  AuthStackParamList,
  HistoryStackParamList,
  HomeTabParamList,
  SettingsStackParamList,
} from './types';

const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const HomeTabStack = createNativeStackNavigator<HomeTabParamList>();
const HistoryStack = createNativeStackNavigator<HistoryStackParamList>();
const SettingsStack = createNativeStackNavigator<SettingsStackParamList>();
const Tab = createBottomTabNavigator<AppTabParamList>();

const navigationTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: colors.background,
    card: colors.background,
    text: colors.text,
    border: colors.border,
    primary: colors.primary,
  },
};

function AuthNavigator() {
  return (
    <AuthStack.Navigator
      screenOptions={{ headerShown: false }}
      initialRouteName="Welcome"
    >
      <AuthStack.Screen name="Welcome" component={WelcomeScreen} />
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="Signup" component={SignupScreen} />
      <AuthStack.Screen
        name="ForgotPassword"
        component={ForgotPasswordScreen}
      />
    </AuthStack.Navigator>
  );
}

/**
 * The Home tab is deliberately just Conversation, not a stack — the
 * merged chat/voice screen is meant to feel like one continuous place,
 * not something you navigate around inside. Kept as its own tiny
 * navigator (rather than passing the screen straight to Tab.Screen)
 * purely so its screenProps type matches the other tabs' shape.
 */
function HomeTabNavigator() {
  return (
    <HomeTabStack.Navigator screenOptions={{ headerShown: false }}>
      <HomeTabStack.Screen name="Conversation" component={ConversationScreen} />
    </HomeTabStack.Navigator>
  );
}

function HistoryNavigator() {
  return (
    <HistoryStack.Navigator screenOptions={{ headerShown: false }}>
      <HistoryStack.Screen name="History" component={HistoryScreen} />
      <HistoryStack.Screen
        name="HistoryDetail"
        component={HistoryDetailScreen}
      />
    </HistoryStack.Navigator>
  );
}

function SettingsNavigator() {
  return (
    <SettingsStack.Navigator screenOptions={{ headerShown: false }}>
      <SettingsStack.Screen name="SettingsHome" component={SettingsScreen} />
      <SettingsStack.Screen name="APIKey" component={APIKeyScreen} />
      <SettingsStack.Screen name="AmbientMode" component={AmbientModeScreen} />
      <SettingsStack.Screen name="VoicePersona" component={VoicePersonaScreen} />
      <SettingsStack.Screen name="Privacy" component={PrivacyScreen} />
      <SettingsStack.Screen name="About" component={AboutScreen} />
    </SettingsStack.Navigator>
  );
}

/** Icons are plain glyphs rather than a vector-icon library — one fewer native dependency for a 3-item tab bar. */
function TabIcon({ glyph, focused }: { glyph: string; focused: boolean }) {
  return (
    <Text style={[styles.tabIcon, focused && styles.tabIconFocused]}>
      {glyph}
    </Text>
  );
}

// Declared at module scope (not inline in AppTabs' JSX) so
// react/no-unstable-nested-components doesn't flag a fresh component
// identity on every render — each tab's icon is genuinely static.
const renderHomeIcon = ({ focused }: { focused: boolean }) => (
  <TabIcon glyph="⌂" focused={focused} />
);
const renderHistoryIcon = ({ focused }: { focused: boolean }) => (
  <TabIcon glyph="◷" focused={focused} />
);
const renderSettingsIcon = ({ focused }: { focused: boolean }) => (
  <TabIcon glyph="⚙" focused={focused} />
);

/**
 * Hides the tab bar on every screen except a tab's own root — matches
 * the reference design, where the Settings/History *lists* show the tab
 * bar but a pushed detail screen (Ambient Mode, About, a saved
 * conversation) takes over the full screen instead.
 */
function tabBarStyleFor(routeName: string | undefined) {
  const isRoot = routeName === undefined || routeName === 'History' || routeName === 'SettingsHome';
  return isRoot ? undefined : { display: 'none' as const };
}

function AppTabs() {
  return (
    // AmbientModeProvider hosts the single ambient-mode session for the
    // whole signed-in app (see AmbientModeContext.tsx) — mounted here,
    // above the tab navigator, so it survives switching tabs.
    // AmbientListeningBanner is a sibling of the Navigator, not a screen,
    // for the same reason: it must stay visible (and its kill switch
    // reachable) no matter which tab/screen is on top.
    <AmbientModeProvider>
      <View style={styles.appShell}>
        <AmbientListeningBanner />
        <View style={styles.navigatorFill}>
          <Tab.Navigator
            screenOptions={{
              headerShown: false,
              tabBarActiveTintColor: colors.primaryDark,
              tabBarInactiveTintColor: colors.textFaint,
              tabBarStyle: {
                backgroundColor: colors.surface,
                borderTopColor: colors.borderSoft,
              },
              tabBarLabelStyle: styles.tabLabel,
            }}
          >
            <Tab.Screen
              name="HomeTab"
              component={HomeTabNavigator}
              options={{
                tabBarLabel: 'Home',
                tabBarStyle: { display: 'none' },
                tabBarIcon: renderHomeIcon,
              }}
            />
            <Tab.Screen
              name="HistoryTab"
              component={HistoryNavigator}
              options={({ route }) => ({
                tabBarLabel: 'History',
                tabBarStyle: tabBarStyleFor(
                  getFocusedRouteNameFromRoute(route),
                ),
                tabBarIcon: renderHistoryIcon,
              })}
            />
            <Tab.Screen
              name="SettingsTab"
              component={SettingsNavigator}
              options={({ route }) => ({
                tabBarLabel: 'Settings',
                tabBarStyle: tabBarStyleFor(
                  getFocusedRouteNameFromRoute(route),
                ),
                tabBarIcon: renderSettingsIcon,
              })}
            />
          </Tab.Navigator>
        </View>
      </View>
    </AmbientModeProvider>
  );
}

function LoadingScreen() {
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={colors.primary} size="large" />
    </View>
  );
}

export default function RootNavigator() {
  const { user, initializing } = useAuth();

  return (
    <NavigationContainer theme={navigationTheme}>
      {initializing ? (
        <LoadingScreen />
      ) : user ? (
        <AppTabs />
      ) : (
        <AuthNavigator />
      )}
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  appShell: {
    flex: 1,
    backgroundColor: colors.background,
  },
  navigatorFill: {
    flex: 1,
  },
  tabIcon: {
    fontSize: 20,
    color: colors.textFaint,
  },
  tabIconFocused: {
    color: colors.primaryDark,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
});
