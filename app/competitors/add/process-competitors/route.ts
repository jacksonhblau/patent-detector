/**
 * Onboarding Process Competitor API
 * 
 * Creates competitor entry, saves user doc URLs, then calls
 * shared researchAndAnalyzeCompetitor() directly (no self-fetch).
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
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

export async function POST(request: NextRequest) {
  try {
    const body: RequestBody = await request.json();
    const userId = '00000000-0000-0000-0000-000000000000';

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
          sourcePatentId: null,
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
