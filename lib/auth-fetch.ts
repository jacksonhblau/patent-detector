/**
 * Authenticated fetch helper for client-side API calls.
 * 
 * Wraps the standard fetch() to automatically include the
 * Supabase auth token in the Authorization header.
 * 
 * Usage:
 *   import { authFetch } from '@/lib/auth-fetch';
 *   const res = await authFetch('/api/portfolio');
 */

import { supabase } from '@/lib/supabase';

export async function authFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token || '';

  const headers = new Headers(options.headers || {});
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  return fetch(url, {
    ...options,
    headers,
  });
}
