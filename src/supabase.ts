import { createClient } from '@supabase/supabase-js';
import { authStorage } from './mmkv';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config';

const mmkvStorage = {
  getItem: (key: string) => authStorage.getString(key) ?? null,
  setItem: (key: string, value: string) => authStorage.set(key, value),
  removeItem: (key: string) => authStorage.remove(key),
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: mmkvStorage,
    autoRefreshToken: true,
    persistSession: true,
  },
});
