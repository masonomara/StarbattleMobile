import { createClient } from '@supabase/supabase-js';
import { createMMKV } from 'react-native-mmkv';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config';

const mmkv = createMMKV({ id: 'supabase-auth' });

const mmkvStorage = {
  getItem: (key: string) => {
    const val = mmkv.getString(key) ?? null;
    console.log('[mmkv] getItem', key, val ? `${val.length} chars` : 'null');
    return val;
  },
  setItem: (key: string, value: string) => {
    console.log('[mmkv] setItem', key, `${value.length} chars`);
    mmkv.set(key, value);
  },
  removeItem: (key: string) => {
    console.log('[mmkv] removeItem', key);
    mmkv.remove(key);
  },
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: mmkvStorage,
    autoRefreshToken: true,
    persistSession: true,
  },
});
