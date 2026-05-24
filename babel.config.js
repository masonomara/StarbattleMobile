require('dotenv').config();

module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: ['transform-inline-env-vars', 'react-native-reanimated/plugin'],
};
