/**
 * Supabase Admin Client (Server-Side Only)
 * 
 * Uses the SERVICE ROLE KEY which bypasses Row Level Security (RLS).
 * This should ONLY be used in server-side API routes (app/api/...), 
 * NEVER in client-side components.
 * 
 * The regular supabase client (lib/supabase.ts) uses the anon key 
 * and should be used for client-side code where RLS is enforced.
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseServiceRoleKey) {
  console.warn('⚠️ SUPABASE_SERVICE_ROLE_KEY is not set — server-side queries will fail with RLS enabled');
}

export const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});
