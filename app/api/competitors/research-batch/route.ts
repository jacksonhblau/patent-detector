/**
 * Batch Competitor Research API
 * 
 * Processes multiple competitors at once. For each competitor:
 * 1. Creates competitor entry
 * 2. Saves any user-provided doc URLs
 * 3. Calls add-from-portfolio for AI web research + USPTO + analysis
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase-admin';
import { extractPdfWithPages } from '@/lib/textract-extractor';
import { fetchUrlAsDocument } from '@/lib/url-fetcher';

interface ProductUrl {
  url: string;
  description: string;
}

interface CompetitorData {
  companyName: string;
  aliases: string[];
  websiteUrl: string | null;
  patentNumbers: string[];
  productUrls: ProductUrl[];
}

interface BatchRequest {
  competitors: CompetitorData[];
}

export async function POST(request: NextRequest) {
  try {
    const body: BatchRequest = await request.json();
    const { competitors } = body;

    if (!competitors || competitors.length === 0) {
      return NextResponse.json({ error: 'At least one competitor is required' }, { status: 400 });
    }

    console.log(`🔍 Starting batch research for ${competitors.length} companies`);
    const userId = '00000000-0000-0000-0000-000000000000';
    const results = [];
    let totalDocuments = 0;
    let totalPages = 0;

    for (const competitorData of competitors) {
      try {
        const result = await processCompetitor(competitorData, userId, request);
        results.push(result);
        totalDocuments += result.documentsFound || 0;
        totalPages += result.pagesExtracted || 0;
      } catch (error) {
        console.error(`❌ Error processing ${competitorData.companyName}:`, error);
        results.push({
          name: competitorData.companyName,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          documentsFound: 0,
          pagesExtracted: 0,
        });
      }
    }

    console.log(`✅ Batch research complete: ${results.filter(r => r.success).length}/${competitors.length}`);

    return NextResponse.json({
      success: true,
      companiesProcessed: results.filter(r => r.success).length,
      totalDocuments,
      totalPages,
      competitors: results,
    });

  } catch (error) {
    console.error('❌ Batch research error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to process batch research' },
      { status: 500 }
    );
  }
}

async function processCompetitor(
  data: CompetitorData,
  userId: string,
  originalRequest: NextRequest
): Promise<any> {
  console.log(`\n📋 Processing: ${data.companyName}`);

  // Step 1: Create competitor entry
  const { data: competitor, error: competitorError } = await supabase
    .from('competitors')
    .insert({
      user_id: userId,
      name: data.companyName,
      website: data.websiteUrl || null,
      notes: [
        `Aliases: ${data.aliases.join(', ') || 'None'}`,
        `Source: Batch research`,
      ].join('\n'),
    })
    .select()
    .single();

  if (competitorError) {
    throw new Error(`Failed to create competitor: ${competitorError.message}`);
  }
  console.log(`✅ Created competitor: ${competitor.id}`);

  let documentsFound = 0;
  let pagesExtracted = 0;

  // Step 2: Process any user-provided PDF URLs via Textract
  for (const product of data.productUrls) {
    if (!product.url) continue;
    try {
      console.log(`📄 Fetching user-provided URL: ${product.url}`);
      const documentBuffer = await fetchUrlAsDocument(product.url);
      if (!documentBuffer) {
        console.warn(`⚠️ Could not fetch: ${product.url}`);
        await supabase.from('competitor_documents').insert({
          competitor_id: competitor.id,
          source_url: product.url,
          document_name: product.description || new URL(product.url).pathname.split('/').pop() || 'Document',
          document_type: 'pdf',
          total_pages: 0,
          extracted_text: `User-provided URL (could not fetch): ${product.url}`,
          status: 'fetch_failed',
        });
        continue;
      }

      const extraction = await extractPdfWithPages(documentBuffer);
      console.log(`   ✅ Extracted ${extraction.totalPages} pages`);

      const { data: document, error: docError } = await supabase
        .from('competitor_documents')
        .insert({
          competitor_id: competitor.id,
          source_url: product.url,
          document_name: product.description || new URL(product.url).pathname.split('/').pop() || 'Document',
          document_type: 'pdf',
          total_pages: extraction.totalPages,
          extracted_text: extraction.fullText,
          status: 'extracted',
        })
        .select()
        .single();

      if (docError) { console.error(`   ❌ Error saving document:`, docError); continue; }

      const pages = extraction.pages.map((p: any) => ({
        document_id: document.id,
        page_number: p.pageNumber,
        text: p.text,
        raw_text: p.rawText,
      }));

      const { error: pagesError } = await supabase.from('competitor_document_pages').insert(pages);

      if (!pagesError) {
        console.log(`   💾 Saved ${pages.length} pages`);
        documentsFound++;
        pagesExtracted += extraction.totalPages;
      }
    } catch (error) {
      console.error(`   ❌ Error processing ${product.url}:`, error);
    }
  }

  // Step 3: Call add-from-portfolio for web research + USPTO + analysis
  console.log(`🤖 Starting AI web research & analysis for ${data.companyName}...`);
  try {
    const origin = originalRequest.headers.get('origin')
      || (originalRequest.headers.get('x-forwarded-host')
        ? `https://${originalRequest.headers.get('x-forwarded-host')}`
        : `http://${originalRequest.headers.get('host') || 'localhost:3000'}`);

    const analysisRes = await fetch(`${origin}/api/competitors/add-from-portfolio`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companyName: data.companyName,
        patentCategory: 'Blockchain & Distributed Ledger Technology',
        sourcePatentId: 'batch-research',
        existingCompetitorId: competitor.id,
      }),
    });

    const analysisData = await analysisRes.json();
    if (analysisData.success) {
      console.log(`✅ Web research & analysis complete for ${data.companyName}`);
      documentsFound += analysisData.competitor?.documentsFound || 0;
    } else {
      console.warn(`⚠️ Analysis error: ${analysisData.error}`);
    }
  } catch (err) {
    console.warn(`⚠️ Analysis call failed:`, err);
  }

  return {
    id: competitor.id,
    name: data.companyName,
    success: true,
    documentsFound,
    pagesExtracted,
    aliases: data.aliases,
  };
}
