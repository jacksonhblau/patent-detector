import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * Server-side admin client — bypasses RLS.
 */
export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

/**
 * Best-effort user identification from the request.
 * Returns user_id if found, null if not.
 * NEVER throws.
 */
export async function getUserId(request: Request): Promise<string | null> {
  try {
    const authHeader = request.headers.get('Authorization');
    if (authHeader?.startsWith('Bearer ') && authHeader.length > 10) {
      const token = authHeader.replace('Bearer ', '');
      const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
      if (user && !error) return user.id;
    }
  } catch { /* ignore */ }
  return null;
}
