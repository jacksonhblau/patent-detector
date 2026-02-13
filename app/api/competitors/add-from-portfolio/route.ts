/**
 * Add Competitor from Portfolio API
 * Thin wrapper around shared researchAndAnalyzeCompetitor()
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
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

    // Quick duplicate check (only if not providing an existing ID)
    if (!existingCompetitorId) {
      const { data: existing } = await supabase.from('competitors').select('id, name')
        .ilike('name', `%${companyName.split('(')[0].trim()}%`).limit(1);
      if (existing && existing.length > 0) {
        // Check if already has analysis
        const { data: existingAnalysis } = await supabase.from('analyses')
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
