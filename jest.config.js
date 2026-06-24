module.exports = {
  preset: 'react-native',
  setupFiles: ['<rootDir>/jest.setup.js'],
  // Mounting <App/> boots a long-lived monitoring timer (perfLog's stall
  // watchdog setInterval) that is never cleared by design — it's a forever
  // process-wide timer in production. No test teardown should kill it, but it
  // keeps Node's event loop alive so jest hangs ("did not exit") on a passing
  // run. Force exit once tests finish so CI gets a clean exit code.
  forceExit: true,
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
