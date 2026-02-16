import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
          set(name: string, value: string, options: any) {
            cookieStore.set({ name, value, ...options });
          },
          remove(name: string, options: any) {
            cookieStore.set({ name, value: '', ...options });
          },
        },
      }
    );

    // Sign out the user from Supabase (clears auth session and tokens)
    await supabase.auth.signOut();

    // Clear all Supabase-related cookies explicitly
    const allCookies = cookieStore.getAll();
    for (const cookie of allCookies) {
      if (cookie.name.includes('supabase') || cookie.name.includes('sb-')) {
        cookieStore.delete(cookie.name);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Logout error:', error);
    return NextResponse.json({ success: true }); // Return success anyway to allow redirect
  }
}
