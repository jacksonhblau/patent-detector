/**
 * Add Competitor from Portfolio API
 * Thin wrapper around shared researchAndAnalyzeCompetitor()
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { supabase as supabaseAdmin } from '@/lib/supabase-admin';
import { researchAndAnalyzeCompetitor } from '@/lib/competitor-research';

interface AddCompetitorRequest {
  companyName: string;
  patentCategory?: string;
  sourcePatentId?: string;
  existingCompetitorId?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: AddCompetitorRequest = await request.json();
    const { companyName, patentCategory, sourcePatentId, existingCompetitorId } = body;
    if (!companyName) return NextResponse.json({ error: 'Company name is required' }, { status: 400 });

    // ✅ Authenticate the user
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

    // Quick duplicate check (only if not providing an existing ID)
    if (!existingCompetitorId) {
      const { data: existing } = await supabaseAdmin.from('competitors').select('id, name')
        .eq('user_id', userId)
        .ilike('name', `%${companyName.split('(')[0].trim()}%`).limit(1);
      if (existing && existing.length > 0) {
        // Check if already has analysis
        const { data: existingAnalysis } = await supabaseAdmin.from('analyses')
          .select('id').eq('competitor_id', existing[0].id).eq('status', 'complete').limit(1);
        if (existingAnalysis && existingAnalysis.length > 0) {
          return NextResponse.json({
            success: true, alreadyExists: true, competitor: existing[0],
            message: `${existing[0].name} is already tracked and analyzed`,
          });
        }
        // Has competitor but no analysis — run analysis on it
        const result = await researchAndAnalyzeCompetitor({
          companyName,
          patentCategory,
          sourcePatentId,
          existingCompetitorId: existing[0].id,
          userId,
        });
        return NextResponse.json({
          success: true, alreadyExists: true,
          competitor: {
            id: result.competitorId, name: result.competitorName, website: result.website,
            description: result.description, aliases: result.aliases,
            documentsFound: result.productsAdded, patentsFound: result.patentsFound,
            analysis: result.analysis,
          },
        });
      }
    }

    // Run full research + analysis
    const result = await researchAndAnalyzeCompetitor({
      companyName,
      patentCategory,
      sourcePatentId,
      existingCompetitorId,
      userId,
    });

    return NextResponse.json({
      success: true,
      alreadyExists: false,
      competitor: {
        id: result.competitorId,
        name: result.competitorName,
        website: result.website,
        description: result.description,
        aliases: result.aliases,
        documentsFound: result.productsAdded,
        patentsFound: result.patentsFound,
        analysis: result.analysis,
      },
    });
  } catch (error) {
    console.error('❌ Add competitor error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed' }, { status: 500 });
  }
}
