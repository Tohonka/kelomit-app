module.exports = {
  preset: '@react-native/jest-preset',
  setupFilesAfterEnv: ['./jest.setup.js'],
  // server/ is a separate ESM package tested with node:test via tsx — its specs
  // are not jest's to run.
  testPathIgnorePatterns: [
    '/node_modules/',
    '<rootDir>/server/',
    // Separate checkouts — they run their own suites.
    '<rootDir>/.worktrees/',
  ],
  // Allow babel-jest to transform reanimated + worklets (both ship ESM)
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|react-native-reanimated|react-native-worklets|@op-engineering)/)',
  ],
  // Route both packages to their pre-built mocks so native modules are never loaded
  moduleNameMapper: {
    '^react-native-reanimated$':
      '<rootDir>/node_modules/react-native-reanimated/lib/module/mock.js',
    '^react-native-worklets$':
      '<rootDir>/node_modules/react-native-worklets/lib/module/mock.js',
    '^@op-engineering/op-sqlite$': '<rootDir>/__mocks__/@op-engineering/op-sqlite.js',
  },
};
