import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * Server-side admin client — bypasses RLS entirely.
 * Used by all API routes and background jobs.
 */
export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

/**
 * Gets the logged-in user's ID from the request.
 *
 * Tries in order:
 *  1. Bearer token in Authorization header
 *  2. Supabase auth cookies (set by Google OAuth)
 *  3. ?user_id query param (temporary, for client-side fallback)
 *
 * Returns null only if all strategies fail.
 */
export async function getUserId(request: Request): Promise<string | null> {
  // ── Strategy 1: Bearer token ──
  const authHeader = request.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ') && authHeader.length > 10) {
    const token = authHeader.replace('Bearer ', '');
    try {
      const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
      if (user && !error) return user.id;
    } catch { /* token invalid — fall through */ }
  }

  // ── Strategy 2: Supabase auth cookies ──
  // After Google OAuth, Supabase stores session tokens in cookies named
  // sb-<project-ref>-auth-token or sb-<project-ref>-auth-token.0 / .1 (chunked)
  const cookieHeader = request.headers.get('cookie') || '';
  if (cookieHeader.includes('sb-')) {
    try {
      let tokenStr = '';

      // Check for chunked cookies first (sb-xxx-auth-token.0, .1, etc.)
      const chunkPattern = /sb-[^=]+-auth-token\.(\d+)=([^;]+)/g;
      const chunks: { index: number; value: string }[] = [];
      let match;
      while ((match = chunkPattern.exec(cookieHeader)) !== null) {
        chunks.push({ index: parseInt(match[1]), value: match[2] });
      }

      if (chunks.length > 0) {
        // Reassemble chunked cookie
        chunks.sort((a, b) => a.index - b.index);
        tokenStr = chunks.map(c => c.value).join('');
      } else {
        // Non-chunked: sb-xxx-auth-token=value
        const singleMatch = cookieHeader.match(/sb-[^=]+-auth-token=([^;]+)/);
        if (singleMatch) tokenStr = singleMatch[1];
      }

      if (tokenStr) {
        const decoded = JSON.parse(
          Buffer.from(decodeURIComponent(tokenStr), 'base64').toString()
        );
        const accessToken = Array.isArray(decoded) ? decoded[0] : decoded?.access_token;
        if (accessToken) {
          const { data: { user }, error } = await supabaseAdmin.auth.getUser(accessToken);
          if (user && !error) return user.id;
        }
      }
    } catch { /* cookie parse failed — fall through */ }
  }

  // ── Strategy 3: Query parameter fallback ──
  // The client can pass ?user_id=xxx when it knows the Supabase user ID
  // from its local auth state. This is a temporary bridge until we add
  // proper auth middleware.
  try {
    const url = new URL(request.url);
    const paramUserId = url.searchParams.get('user_id');
    if (paramUserId && paramUserId.length > 30) {
      // Validate this is a real user
      const { data } = await supabaseAdmin
        .from('patents')
        .select('user_id')
        .eq('user_id', paramUserId)
        .limit(1)
        .single();
      if (data) return paramUserId;
    }
  } catch { /* not a valid user — fall through */ }

  return null;
}
