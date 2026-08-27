module.exports = {
  preset: '@react-native/jest-preset',
  setupFiles: ['./jest/setup.ts'],
  transformIgnorePatterns: [
    'node_modules/(?!(@react-native|react-native|react-native-vector-icons|@react-navigation|firebase|@firebase)/)',
  ],
};
