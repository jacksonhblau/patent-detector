/**
 * Process Company Patents - Background Processing
 * 
 * Starts processing company patents immediately while user continues onboarding.
 * Extracts the real user ID from the Supabase auth session (cookie or header).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase-admin';
import { discoverCompanyPatents } from '@/lib/uspto-patent-downloader';

interface ProcessCompanyRequest {
  companyName: string;
  companyAliases: string[];
}

/**
 * Resolve the authenticated user's ID from the request.
 * 
 * Tries three strategies in order:
 *   1. Authorization: Bearer <access_token> header
 *   2. Supabase auth cookies (sb-<ref>-auth-token)
 *   3. x-user-id header (fallback from frontend)
 * 
 * Returns the user's UUID or null if unauthenticated.
 */
async function resolveUserId(request: NextRequest): Promise<string | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  // Strategy 1: Bearer token in Authorization header
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.replace('Bearer ', '');
    const client = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: { user } } = await client.auth.getUser(token);
    if (user?.id) {
      console.log(`🔑 Auth resolved via Bearer token: ${user.id}`);
      return user.id;
    }
  }

  // Strategy 2: Supabase auth cookies
  const cookieHeader = request.headers.get('cookie') || '';
  // Look for the access token in the cookie (format varies by Supabase version)
  const accessTokenMatch = cookieHeader.match(/sb-[^-]+-auth-token=([^;]+)/);
  if (accessTokenMatch) {
    try {
      // The cookie value might be a JSON-encoded array [access_token, refresh_token]
      let token = decodeURIComponent(accessTokenMatch[1]);
      // Handle base64-encoded JSON array format
      if (token.startsWith('base64-')) {
        token = Buffer.from(token.replace('base64-', ''), 'base64').toString();
      }
      // Parse if it's a JSON array
      try {
        const parsed = JSON.parse(token);
        if (Array.isArray(parsed)) {
          token = parsed[0]; // First element is the access token
        }
      } catch {
        // Not JSON, use as-is (raw JWT)
      }

      const client = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: `Bearer ${token}` } },
      });
      const { data: { user } } = await client.auth.getUser(token);
      if (user?.id) {
        console.log(`🔑 Auth resolved via cookie: ${user.id}`);
        return user.id;
      }
    } catch (e) {
      console.warn('⚠️ Cookie auth parse failed:', e);
    }
  }

  // Strategy 3: x-user-id header (set by frontend authFetch helper)
  const headerUserId = request.headers.get('x-user-id');
  if (headerUserId && headerUserId !== '00000000-0000-0000-0000-000000000000') {
    // Verify this user actually exists in auth.users using admin client
    const { data: authUser } = await supabase.auth.admin.getUserById(headerUserId);
    if (authUser?.user?.id) {
      console.log(`🔑 Auth resolved via x-user-id header: ${authUser.user.id}`);
      return authUser.user.id;
    }
  }

  console.error('❌ Could not resolve user ID from request');
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const body: ProcessCompanyRequest = await request.json();
    const { companyName, companyAliases } = body;

    if (!companyName) {
      return NextResponse.json(
        { error: 'Company name is required' },
        { status: 400 }
      );
    }

    console.log(`🚀 Starting background processing for: ${companyName}`);

    // ✅ FIX: Resolve the REAL user ID from the auth session
    const userId = await resolveUserId(request);
    if (!userId) {
      return NextResponse.json(
        { error: 'Authentication required. Please sign in again.' },
        { status: 401 }
      );
    }
    console.log(`👤 Authenticated user: ${userId}`);

    // Step 1: Create or get company record
    const { data: existingCompany } = await supabase
      .from('companies')
      .select('*')
      .eq('user_id', userId)
      .eq('name', companyName)
      .single();

    let company = existingCompany;

    if (!company) {
      const { data: newCompany, error: companyError } = await supabase
        .from('companies')
        .insert({
          user_id: userId,
          name: companyName,
          aliases: companyAliases || [],
        })
        .select()
        .single();

      if (companyError) {
        console.error('❌ Error creating company:', companyError);
        return NextResponse.json(
          { error: 'Failed to create company' },
          { status: 500 }
        );
      }

      company = newCompany;
    }

    console.log(`✅ Company ready: ${company.id}`);

    // Step 2: Start patent discovery (this runs asynchronously)
    discoverCompanyPatents(
      companyName,
      companyAliases || [],
      company.id,
      userId
    ).then(results => {
      console.log(`✅ Background processing complete: ${results.processed} patents processed`);
    }).catch(error => {
      console.error(`❌ Background processing error:`, error);
    });

    // Return immediately so user can continue
    return NextResponse.json({
      success: true,
      message: 'Patent processing started in background',
      companyId: company.id,
    });
  } catch (error) {
    console.error('❌ Error starting background processing:', error);
    return NextResponse.json(
      { error: 'Failed to start processing', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
