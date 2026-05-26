import { createMMKV } from 'react-native-mmkv';

export const settingsStorage = createMMKV({ id: 'starbattle-settings' });
export const authStorage = createMMKV({ id: 'supabase-auth' });
