/**
 * Authenticated Fetch Helper (Client-Side)
 * 
 * Wraps fetch() to automatically include the Supabase auth token
 * in the Authorization header. Use this for all API calls from
 * client components so server-side routes can identify the user.
 */

import { supabase } from '@/lib/supabase';

/**
 * Fetch with auth token automatically included.
 * Usage: const res = await authFetch('/api/portfolio');
 */
export async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;

  const headers = new Headers(options.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  // Ensure Content-Type is set for JSON requests
  if (!headers.has('Content-Type') && options.body && typeof options.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }

  return fetch(url, { ...options, headers });
}
