/**
 * Authenticated fetch helper for client-side API calls.
 *
 * Automatically includes auth credentials with every API request.
 * 
 * Strategy:
 *  1. If Supabase session exists → sends Bearer token (ideal)
 *  2. If no session but user is known → sends user_id as query param (fallback)
 *  3. Credentials: 'include' ensures cookies are sent (for cookie-based auth)
 */

import { supabase } from '@/lib/supabase';

export async function authFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const headers = new Headers(options.headers || {});

  // Try to get the Supabase session
  const { data: { session } } = await supabase.auth.getSession();

  if (session?.access_token) {
    // Best case: we have a valid token
    headers.set('Authorization', `Bearer ${session.access_token}`);
  } else {
    // Fallback: try to get user from Supabase auth state
    // and pass as query param so the server can validate
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.id) {
      const separator = url.includes('?') ? '&' : '?';
      url = `${url}${separator}user_id=${user.id}`;
    }
  }

  return fetch(url, {
    ...options,
    headers,
    credentials: 'include', // Always send cookies
  });
}
