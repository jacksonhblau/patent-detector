/**
 * Infringement Analysis API (READ-ONLY)
 * 
 * Reads pre-computed analysis from the analyses table.
 * Analysis is run when competitors are added (in add-from-portfolio endpoint),
 * NOT when this page is viewed.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  try {
    // 1. Get all unique competitors (deduplicated by name, prefer one with notes)
    const { data: allCompetitors, error: compError } = await supabase
      .from('competitors')
      .select('*')
      .order('name');

    if (compError) throw new Error(`Failed to fetch competitors: ${compError.message}`);

    // Deduplicate by name, keep the one with the most notes
    const compMap = new Map<string, any>();
    for (const c of (allCompetitors || [])) {
      const key = c.name.toLowerCase().trim();
      const existing = compMap.get(key);
      if (!existing || (c.notes && c.notes.length > (existing.notes?.length || 0))) {
        compMap.set(key, c);
      }
    }

    // Filter out self (Inveniam)
    const competitors = Array.from(compMap.values()).filter(c =>
      !c.name.toLowerCase().includes('inveniam')
    );

    if (competitors.length === 0) {
      return NextResponse.json({ success: true, totalCompetitors: 0, results: [] });
    }

    // 2. Gather ALL competitor IDs per name (since there may be dupes)
    const nameToIds = new Map<string, string[]>();
    for (const c of (allCompetitors || [])) {
      const key = c.name.toLowerCase().trim();
      const ids = nameToIds.get(key) || [];
      ids.push(c.id);
      nameToIds.set(key, ids);
    }

    // 3. Fetch all competitor documents
    const allIds = Array.from(nameToIds.values()).flat();
    const { data: allDocs } = await supabase
      .from('competitor_documents')
      .select('*')
      .in('competitor_id', allIds);

    // 4. Fetch all cached analyses
    const { data: allAnalyses } = await supabase
      .from('analyses')
      .select('*')
      .in('competitor_id', allIds);

    const analysisMap = new Map<string, any>();
    for (const a of (allAnalyses || [])) {
      if (a.results) analysisMap.set(a.competitor_id, a.results);
    }

    // 5. Build results
    const results = [];

    for (const comp of competitors) {
      const key = comp.name.toLowerCase().trim();
      const relatedIds = nameToIds.get(key) || [comp.id];

      // Gather docs from all duplicate competitor entries
      const docs = (allDocs || []).filter((d: any) => relatedIds.includes(d.competitor_id));
      const seen = new Set<string>();
      const uniqueDocs: any[] = [];
      for (const d of docs) {
        if (!seen.has(d.document_name)) {
          seen.add(d.document_name);
          uniqueDocs.push(d);
        }
      }

      // Find cached analysis (check all related IDs)
      let analysis: any = null;
      for (const id of relatedIds) {
        if (analysisMap.has(id)) { analysis = analysisMap.get(id); break; }
      }

      const productDocs = uniqueDocs.filter((d: any) => ['product_page', 'product_service', 'pdf', 'uploaded'].includes(d.document_type));
      const patentDocs = uniqueDocs.filter((d: any) => d.document_type === 'patent');

      // Extract description/aliases from notes
      const descMatch = comp.notes?.match(/Description: (.+?)(?:\n|$)/);
      const aliasMatch = comp.notes?.match(/Aliases: (.+?)(?:\n|$)/);

      // Build competitor patents list with overlap detection
      const competitorPatents = patentDocs.map((d: any) => {
        const patentName = d.document_name || '';
        // Simple keyword overlap with user's patent categories
        const blockchainKeywords = ['blockchain', 'distributed ledger', 'smart contract', 'cryptocurrency', 'token', 'consensus', 'hash', 'merkle', 'mining', 'proof of work', 'proof-of-work', 'stablecoin', 'defi', 'decentralized'];
        const docKeywords = ['document', 'validation', 'verification', 'authentication', 'audit', 'mortgage', 'due diligence', 'electronic document'];
        const aiKeywords = ['artificial intelligence', 'machine learning', 'federated learning', 'neural network'];
        
        const nameLower = patentName.toLowerCase();
        const overlapAreas: string[] = [];
        if (blockchainKeywords.some(k => nameLower.includes(k))) overlapAreas.push('Blockchain');
        if (docKeywords.some(k => nameLower.includes(k))) overlapAreas.push('Document Verification');
        if (aiKeywords.some(k => nameLower.includes(k))) overlapAreas.push('AI/ML');
        
        return {
          id: d.id,
          name: patentName,
          url: d.source_url || '',
          applicationNumber: d.source_url?.match(/patent\/(\d+)/)?.[1] || '',
          overlapAreas,
        };
      });
      results.push({
        id: comp.id,
        name: comp.name,
        website: comp.website,
        description: descMatch?.[1] || '',
        aliases: aliasMatch?.[1]?.split(', ').filter(Boolean) || [],
        createdAt: comp.created_at,
        totalDocuments: uniqueDocs.length,
        productDocuments: productDocs.length,
        patentDocuments: patentDocs.length,
        competitorPatents,
        analysisStatus: analysis ? 'complete' : 'pending',
        // Products: use analysis results as primary source, fall back to docs
        products: analysis?.products?.length
          ? analysis.products.map((ap: any) => {
              // Try to find matching doc for URL/description enrichment
              const matchingDoc = productDocs.find((d: any) =>
                d.document_name.toLowerCase() === ap.name.toLowerCase()
                || d.document_name.toLowerCase().includes(ap.name.toLowerCase())
                || ap.name.toLowerCase().includes(d.document_name.toLowerCase())
              );
              return {
                id: matchingDoc?.id || `analysis-${ap.name}`,
                name: ap.name,
                url: matchingDoc?.source_url || comp.website || '',
                description: matchingDoc?.extracted_text || ap.reasoning || '',
                type: matchingDoc?.document_type || 'product_service',
                infringementProbability: ap.infringementProbability ?? null,
                relevantPatents: ap.relevantPatents ?? [],
                reasoning: ap.reasoning ?? '',
              };
            })
          : productDocs.map((d: any) => ({
              id: d.id,
              name: d.document_name,
              url: d.source_url,
              description: d.extracted_text || '',
              type: d.document_type,
              infringementProbability: null,
              relevantPatents: [],
              reasoning: '',
            })),
        settlementProbability: analysis?.settlementProbability ?? null,
        settlementFactors: analysis?.settlementFactors ?? [],
        companyRisk: analysis?.companyRisk ?? null,
        overallInfringementScore: analysis?.products?.length
          ? Math.round(analysis.products.reduce((s: number, p: any) => s + (p.infringementProbability || 0), 0) / analysis.products.length)
          : null,
      });
    }

    // Sort by overall risk (highest infringement first), pending at bottom
    results.sort((a, b) => {
      if (a.analysisStatus === 'pending' && b.analysisStatus !== 'pending') return 1;
      if (b.analysisStatus === 'pending' && a.analysisStatus !== 'pending') return -1;
      return (b.overallInfringementScore ?? 0) - (a.overallInfringementScore ?? 0);
    });

    return NextResponse.json({
      success: true,
      totalCompetitors: results.length,
      results,
    });

  } catch (error) {
    console.error('❌ Analysis API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load analysis' },
      { status: 500 }
    );
  }
}
