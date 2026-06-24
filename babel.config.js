require('dotenv').config();

// transform-inline-env-vars inlines process.env.* at transform time. Under Jest
// (NODE_ENV==='test') there's no .env in CI, so those refs would inline as
// `undefined` and trip config.ts's missing-var guard before any test runs. Seed
// harmless placeholders here — runs ONLY for tests, so real app builds still
// require the real values. `||=` leaves a local .env value intact.
if (process.env.NODE_ENV === 'test') {
  process.env.SUPABASE_URL ||= 'http://localhost';
  process.env.SUPABASE_ANON_KEY ||= 'test-anon-key';
  process.env.POWERSYNC_URL ||= 'http://localhost';
  process.env.ADAPTY_SDK_KEY ||= 'test-adapty-key';
  process.env.GOOGLE_WEB_CLIENT_ID ||= 'test-web-client-id';
  process.env.GOOGLE_IOS_CLIENT_ID ||= 'test-ios-client-id';
}

module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: ['transform-inline-env-vars', 'react-native-reanimated/plugin'],
};
