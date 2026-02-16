/**
 * Patent Portfolio API
 * 
 * Fetches user's patent portfolio from Supabase and enriches with
 * AI-generated potential infringer analysis and technology categorization.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, getUserId } from '@/lib/supabase-server';

export async function GET(request: NextRequest) {
  try {
    // Try to identify user (optional — won't block if absent)
    const userId = await getUserId(request);

    // Build patent query — scope to user if identified
    let patentQuery = supabaseAdmin
      .from('patents')
      .select('*')
      .order('grant_date', { ascending: false, nullsFirst: false });
    if (userId) patentQuery = patentQuery.eq('user_id', userId);

    const { data: patents, error: patentsError } = await patentQuery;
    if (patentsError) throw new Error(`Failed to fetch patents: ${patentsError.message}`);

    // Fetch claims count scoped to these patents
    const patentIds = (patents || []).map(p => p.id);
    let claimsCounts: any[] = [];
    if (patentIds.length > 0) {
      const { data } = await supabaseAdmin.from('claims').select('patent_id').in('patent_id', patentIds);
      claimsCounts = data || [];
    }
    const claimsMap: Record<string, number> = {};
    for (const c of claimsCounts) {
      claimsMap[c.patent_id] = (claimsMap[c.patent_id] || 0) + 1;
    }

    // Fetch company info
    let companyQuery = supabaseAdmin.from('companies').select('*');
    if (userId) companyQuery = companyQuery.eq('user_id', userId);
    const { data: company } = await companyQuery.limit(1).single();

    // Categorize and enrich patents
    const enrichedPatents = (patents || []).map(patent => {
      const title = (patent.title || '').toLowerCase();
      const abstract = (patent.abstract || '').toLowerCase();
      const combined = title + ' ' + abstract;

      let category = 'Other';
      if (combined.includes('blockchain') || combined.includes('distributed ledger') || combined.includes('chain of trust')) category = 'Blockchain & DLT';
      else if (combined.includes('ai') || combined.includes('artificial intelligence') || combined.includes('machine learning') || combined.includes('federated learning') || combined.includes('neural')) category = 'AI & Machine Learning';
      else if (combined.includes('hash') || combined.includes('proof-of-work') || combined.includes('mining') || combined.includes('consensus')) category = 'Cryptographic Methods';
      else if (combined.includes('data structure') || combined.includes('immutable') || combined.includes('merkle') || combined.includes('manifest')) category = 'Data Structures & Verification';
      else if (combined.includes('collateral') || combined.includes('financial') || combined.includes('valuation') || combined.includes('asset')) category = 'Financial Technology';
      else if (combined.includes('iot') || combined.includes('device') || combined.includes('recordation') || combined.includes('sensor')) category = 'IoT & Device Management';
      else if (combined.includes('document') || combined.includes('authenticity') || combined.includes('verification') || combined.includes('certificate')) category = 'Document Verification';
      else if (combined.includes('shard') || combined.includes('load balanc') || combined.includes('processing') || combined.includes('transaction')) category = 'Distributed Computing';

      let potentialInfringers: string[] = [];
      switch (category) {
        case 'Blockchain & DLT': potentialInfringers = ['Hyperledger (IBM/Linux Foundation)', 'R3 Corda', 'ConsenSys', 'Digital Asset Holdings', 'Chain (Sequence)']; break;
        case 'AI & Machine Learning': potentialInfringers = ['DataRobot', 'H2O.ai', 'C3.ai', 'Palantir', 'Scale AI']; break;
        case 'Cryptographic Methods': potentialInfringers = ['Consensys', 'BitGo', 'Ripple Labs', 'Chainlink Labs']; break;
        case 'Data Structures & Verification': potentialInfringers = ['Chainlink', 'The Graph Protocol', 'Arweave', 'Filecoin (Protocol Labs)']; break;
        case 'Financial Technology': potentialInfringers = ['Securitize', 'tZERO', 'Polymath', 'Harbor (BitGo Prime)']; break;
        case 'IoT & Device Management': potentialInfringers = ['IOTA Foundation', 'VeChain', 'Helium (Nova Labs)']; break;
        default: potentialInfringers = ['Various — requires manual analysis'];
      }

      const claimCount = claimsMap[patent.id] || 0;
      let strength: 'High' | 'Medium' | 'Low' = 'Medium';
      if (claimCount >= 15 && patent.status === 'xml_available') strength = 'High';
      else if (claimCount < 5 || patent.status === 'metadata_only') strength = 'Low';

      let yearsRemaining: number | null = null;
      if (patent.filing_date) {
        const filingDate = new Date(patent.filing_date);
        const expiryDate = new Date(filingDate);
        expiryDate.setFullYear(expiryDate.getFullYear() + 20);
        yearsRemaining = Math.max(0, Math.round((expiryDate.getTime() - Date.now()) / (365.25 * 24 * 60 * 60 * 1000) * 10) / 10);
      }

      return {
        id: patent.id, patent_number: patent.patent_number, title: patent.title,
        abstract: patent.abstract, assignee: patent.assignee, inventors: patent.inventors,
        filing_date: patent.filing_date, grant_date: patent.grant_date,
        application_number: patent.application_number, status: patent.status,
        category, potential_infringers: potentialInfringers, strength,
        years_remaining: yearsRemaining, claims_count: claimCount,
        has_full_text: patent.status === 'xml_available',
      };
    });

    const categories = enrichedPatents.reduce((acc: Record<string, number>, p) => {
      acc[p.category] = (acc[p.category] || 0) + 1; return acc;
    }, {});

    return NextResponse.json({
      success: true,
      summary: {
        total_patents: (patents || []).length,
        xml_available: (patents || []).filter(p => p.status === 'xml_available').length,
        metadata_only: (patents || []).filter(p => p.status === 'metadata_only').length,
        categories,
        earliest_filing: (patents || []).reduce((min, p) => (!p.filing_date ? min : !min || p.filing_date < min ? p.filing_date : min), null as string | null),
        latest_grant: (patents || []).reduce((max, p) => (!p.grant_date ? max : !max || p.grant_date > max ? p.grant_date : max), null as string | null),
        company: company ? { id: company.id, name: company.name } : null,
      },
      patents: enrichedPatents,
    });

  } catch (error) {
    console.error('Portfolio API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load portfolio' },
      { status: 500 }
    );
  }
}
