import { createMMKV } from 'react-native-mmkv';

// Two isolated MMKV instances so their data never collide and each can be cleared
// independently — e.g. a sign-out can wipe auth tokens without touching settings.
export const settingsStorage = createMMKV({ id: 'starbattle-settings' });
// authStorage is passed to the Supabase client (see src/supabase.ts) so session
// tokens are read synchronously on cold-start instead of awaiting AsyncStorage.
export const authStorage = createMMKV({ id: 'supabase-auth' });
// Stores ETag and version metadata for cached pack files so the prefetch engine
// can skip re-downloads when content hasn't changed. Separate instance so it can
// be cleared independently without touching settings or auth tokens.
export const packMetaStorage = createMMKV({ id: 'starbattle-pack-meta' });
