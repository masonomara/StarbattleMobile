module.exports = {
  preset: 'react-native',
  setupFiles: ['<rootDir>/jest.setup.js'],
  moduleNameMapper: {
    '^lucide-react-native/.*$': '<rootDir>/__mocks__/lucideIcon.js',
  },
  transform: {
    '^.+\\.(js|ts|tsx|mjs)$': 'babel-jest',
  },
  transformIgnorePatterns: [
    'node_modules/(?!(?:jest-)?react-native|@react-native|@react-navigation|@shopify|@powersync|@op-engineering|lucide-react-native)',
  ],
};
