module.exports = {
  preset: 'react-native',
  transform: {
    '^.+\\.(js|ts|tsx|mjs)$': 'babel-jest',
  },
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|@powersync)/)',
  ],
};
