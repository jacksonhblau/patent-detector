import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * Server-side admin client — bypasses RLS entirely.
 * Use for:
 *  - API routes that verify the user themselves (via getUserId)
 *  - Background jobs (competitor research, onboarding processing)
 */
export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

/**
 * Gets the logged-in user's ID from an Authorization header.
 * API routes should call this to scope queries to the current user.
 */
export async function getUserId(request: Request): Promise<string | null> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return null;
  return user.id;
}
