module.exports = {
  preset: '@react-native/jest-preset',
  setupFilesAfterEnv: ['./jest.setup.js'],
  // Allow babel-jest to transform reanimated + worklets (both ship ESM)
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|react-native-reanimated|react-native-worklets)/)',
  ],
  // Route both packages to their pre-built mocks so native modules are never loaded
  moduleNameMapper: {
    '^react-native-reanimated$':
      '<rootDir>/node_modules/react-native-reanimated/lib/module/mock.js',
    '^react-native-worklets$':
      '<rootDir>/node_modules/react-native-worklets/lib/module/mock.js',
  },
};
