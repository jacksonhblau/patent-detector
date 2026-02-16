/**
 * Server-side Auth Helper
 * 
 * Extracts the authenticated user from the request.
 * Checks Authorization header first (most reliable), then falls back to cookies.
 */

import { NextRequest } from 'next/server';
import { supabase } from '@/lib/supabase-admin';

/**
 * Get the authenticated user from the request.
 * 
 * Priority:
 * 1. Authorization: Bearer <token> header (set by client-side fetch calls)
 * 2. Supabase auth cookies (set during OAuth redirect)
 */
export async function getAuthUser(request: NextRequest) {
  // 1. Try Authorization header (most reliable)
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    try {
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (user && !error) return user;
      console.warn('⚠️ Bearer token invalid:', error?.message);
    } catch (err) {
      console.warn('⚠️ Bearer token verification failed:', err);
    }
  }

  // 2. Fall back to cookies
  const cookies = request.cookies;
  const projectRef = 'dngdoyidvbrxsfrfjiqb';

  // Try reassembling from chunked cookies first (most common with Supabase)
  const chunks: string[] = [];
  let i = 0;
  while (true) {
    const chunk = cookies.get(`sb-${projectRef}-auth-token.${i}`)?.value;
    if (!chunk) break;
    chunks.push(chunk);
    i++;
  }

  // Also try the single cookie
  let token = cookies.get(`sb-${projectRef}-auth-token`)?.value;
  if (chunks.length > 0) {
    token = chunks.join('');
  }

  if (!token) return null;

  try {
    const parsed = JSON.parse(token);
    const accessToken = parsed?.access_token || parsed;
    const tokenStr = typeof accessToken === 'string' ? accessToken : token;
    const { data: { user }, error } = await supabase.auth.getUser(tokenStr);
    if (user && !error) return user;
  } catch {
    try {
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (user && !error) return user;
    } catch { /* both failed */ }
  }

  return null;
}
