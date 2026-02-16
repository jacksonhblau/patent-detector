/**
 * Onboarding Process Competitor API
 * 
 * Creates competitor entry, saves user doc URLs, then calls
 * shared researchAndAnalyzeCompetitor() directly (no self-fetch).
 * 
 * Extracts the real user ID from the Supabase auth session (cookie or header).
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase-admin';
import { researchAndAnalyzeCompetitor } from '@/lib/competitor-research';

interface SingleCompetitor {
  competitorName: string;
  competitorAliases?: string[];
  competitorWebsite?: string;
  productDocs?: string[];
}

interface RequestBody {
  companyName: string;
  competitors?: SingleCompetitor[];
  competitorName?: string;
  competitorAliases?: string[];
  competitorWebsite?: string;
  productDocs?: string[];
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
  const accessTokenMatch = cookieHeader.match(/sb-[^-]+-auth-token=([^;]+)/);
  if (accessTokenMatch) {
    try {
      let token = decodeURIComponent(accessTokenMatch[1]);
      if (token.startsWith('base64-')) {
        token = Buffer.from(token.replace('base64-', ''), 'base64').toString();
      }
      try {
        const parsed = JSON.parse(token);
        if (Array.isArray(parsed)) {
          token = parsed[0];
        }
      } catch {
        // Not JSON, use as-is
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
    const body: RequestBody = await request.json();

    // ✅ FIX: Resolve the REAL user ID from the auth session
    const userId = await resolveUserId(request);
    if (!userId) {
      return NextResponse.json(
        { error: 'Authentication required. Please sign in again.' },
        { status: 401 }
      );
    }
    console.log(`👤 Authenticated user: ${userId}`);

    // Build competitor list — support both multi and legacy single
    let competitorList: SingleCompetitor[] = [];
    if (body.competitors && body.competitors.length > 0) {
      competitorList = body.competitors;
    } else if (body.competitorName) {
      competitorList = [{
        competitorName: body.competitorName,
        competitorAliases: body.competitorAliases,
        competitorWebsite: body.competitorWebsite,
        productDocs: body.productDocs,
      }];
    }

    if (competitorList.length === 0) {
      return NextResponse.json({ error: 'At least one competitor is required' }, { status: 400 });
    }

    console.log(`🔍 Processing ${competitorList.length} competitor(s) from onboarding`);
    const results = [];

    for (let i = 0; i < competitorList.length; i++) {
      const comp = competitorList[i];

      // Wait between competitors to avoid rate limits (each uses ~2 Claude calls)
      if (i > 0) {
        console.log(`⏳ Waiting 65s before next competitor to respect rate limits...`);
        await new Promise(resolve => setTimeout(resolve, 65000));
      }

      try {
        console.log(`\n🔍 Processing competitor ${i + 1}/${competitorList.length}: ${comp.competitorName}`);

        // Step 1: Create competitor entry
        const { data: competitor, error: compError } = await supabase.from('competitors').insert({
          user_id: userId,
          name: comp.competitorName,
          website: comp.competitorWebsite || null,
          notes: [
            `Aliases: ${comp.competitorAliases?.join(', ') || 'None'}`,
            `Source: User-provided during onboarding`,
          ].join('\n'),
        }).select().single();

        if (compError) {
          console.error(`❌ Error creating competitor:`, compError);
          results.push({ name: comp.competitorName, success: false, error: compError.message });
          continue;
        }

        // Step 2: Save any user-provided document URLs
        let userDocsAdded = 0;
        for (const url of (comp.productDocs || [])) {
          if (!url.trim()) continue;
          const docName = url.split('/').pop()?.split('?')[0] || 'Document';
          const { error: docErr } = await supabase.from('competitor_documents').insert({
            competitor_id: competitor.id,
            source_url: url.trim(),
            document_name: docName,
            document_type: 'pdf',
            total_pages: 0,
            extracted_text: `User-provided document URL: ${url}`,
            status: 'pending_extraction',
          });
          if (!docErr) userDocsAdded++;
        }
        if (userDocsAdded > 0) console.log(`📄 Saved ${userDocsAdded} user-provided doc URLs`);

        // Step 3: Run full research + analysis directly (no HTTP self-fetch!)
        console.log(`🤖 Starting AI web research & analysis for ${comp.competitorName}...`);
        const result = await researchAndAnalyzeCompetitor({
          companyName: comp.competitorName,
          patentCategory: 'Blockchain & Distributed Ledger Technology',
          sourcePatentId: 'onboarding',
          existingCompetitorId: competitor.id,
          userId,
        });

        console.log(`✅ Research & analysis complete for ${comp.competitorName}`);
        results.push({
          name: comp.competitorName,
          id: competitor.id,
          success: true,
          analysis: result.analysis,
        });

      } catch (err) {
        console.error(`❌ Error processing ${comp.competitorName}:`, err);
        results.push({
          name: comp.competitorName,
          success: false,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    console.log(`\n✅ Onboarding complete: ${successCount}/${competitorList.length}`);

    return NextResponse.json({ success: true, competitorsProcessed: successCount, results });
  } catch (error) {
    console.error('❌ Process competitor error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to process competitors' },
      { status: 500 }
    );
  }
}
