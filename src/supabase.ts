import { createClient } from '@supabase/supabase-js';
import { authStorage } from './mmkv';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config';

// Adapts the MMKV storage interface to what Supabase's auth client expects.
// MMKV reads are synchronous, which prevents the auth-token flash that
// AsyncStorage (async) would cause before the first render on cold start.
const mmkvStorage = {
  getItem: (key: string) => authStorage.getString(key) ?? null,
  setItem: (key: string, value: string) => authStorage.set(key, value),
  removeItem: (key: string) => authStorage.remove(key),
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { storage: mmkvStorage },
});
