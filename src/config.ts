export const SUPABASE_URL = process.env.SUPABASE_URL ?? (() => { throw new Error('Missing env var: SUPABASE_URL'); })();
export const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? (() => { throw new Error('Missing env var: SUPABASE_ANON_KEY'); })();
export const POWERSYNC_URL = process.env.POWERSYNC_URL ?? (() => { throw new Error('Missing env var: POWERSYNC_URL'); })();
export const ADAPTY_SDK_KEY = process.env.ADAPTY_SDK_KEY ?? (() => { throw new Error('Missing env var: ADAPTY_SDK_KEY'); })();
export const GOOGLE_WEB_CLIENT_ID = process.env.GOOGLE_WEB_CLIENT_ID ?? (() => { throw new Error('Missing env var: GOOGLE_WEB_CLIENT_ID'); })();
// iOS OAuth 2.0 client ID — create at console.cloud.google.com → Credentials → Create → iOS, bundle: com.omaratechnologydesign.starbattle
export const GOOGLE_IOS_CLIENT_ID = process.env.GOOGLE_IOS_CLIENT_ID ?? (() => { throw new Error('Missing env var: GOOGLE_IOS_CLIENT_ID'); })();

// Replace with the real URL before App Store submission.
export const PRIVACY_POLICY_URL = 'https://omaratechnologydesign.com/starbattle/privacy';
