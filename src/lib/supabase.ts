import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

const rawUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!rawUrl || !key) {
  throw new Error('Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY. Copy .env.example to .env.');
}

// The dashboard also shows endpoint URLs like https://ref.supabase.co/rest/v1/. Pasting one of those
// makes every auth call fail with "Invalid path specified in request URL", so keep only the origin.
const url = new URL(rawUrl.trim()).origin;

export const supabase = createClient(url, key, {
  auth: {
    // AsyncStorage touches `window` on web and explodes during Expo Router's static render on Node.
    storage: Platform.OS === 'web' ? undefined : AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: 'pkce',
  },
});

// Keep tokens fresh only while the app is in the foreground.
AppState.addEventListener('change', (state) => {
  if (state === 'active') supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});
