import { createClient } from '@supabase/supabase-js';
import { createMMKV } from 'react-native-mmkv';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config';

const mmkv = createMMKV({ id: 'supabase-auth' });

const mmkvStorage = {
  getItem: (key: string) => mmkv.getString(key) ?? null,
  setItem: (key: string, value: string) => mmkv.set(key, value),
  removeItem: (key: string) => mmkv.remove(key),
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: mmkvStorage,
    autoRefreshToken: true,
    persistSession: true,
  },
});
