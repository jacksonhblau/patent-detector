/**
 * Process Company Patents - Background Processing
 *
 * Starts processing company patents immediately while user continues onboarding.
 * Extracts the real user ID from the Supabase auth session (cookie or header).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { supabase } from '@/lib/supabase-admin';
import { discoverCompanyPatents } from '@/lib/uspto-patent-downloader';
import { cookies } from 'next/headers';

interface ProcessCompanyRequest {
  companyName: string;
  companyAliases: string[];
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

    // ✅ Create Supabase client with proper cookie handling
    const cookieStore = await cookies();
    const supabaseClient = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          },
        },
      }
    );

    // Get the authenticated user
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      console.error('❌ Auth error:', authError);
      return NextResponse.json(
        { error: 'Authentication required. Please sign in again.' },
        { status: 401 }
      );
    }

    const userId = user.id;
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
