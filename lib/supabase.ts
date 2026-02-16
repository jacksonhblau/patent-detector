import { createBrowserClient } from '@supabase/ssr';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Client-side Supabase client (used in browser components for auth)
// Uses createBrowserClient to properly handle cookies for SSR
export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey);