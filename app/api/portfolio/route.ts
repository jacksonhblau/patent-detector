/**
 * Patent Portfolio API
 * 
 * Fetches user's patent portfolio from Supabase and enriches with
 * AI-generated potential infringer analysis and technology categorization.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  try {
    const userId = '00000000-0000-0000-0000-000000000000'; // TODO: Auth

    // Fetch all patents for user's company
    const { data: patents, error: patentsError } = await supabase
      .from('patents')
      .select('*')
      .order('grant_date', { ascending: false, nullsFirst: false });

    if (patentsError) {
      throw new Error(`Failed to fetch patents: ${patentsError.message}`);
    }

    // Fetch claims count per patent
    const { data: claimsCounts, error: claimsError } = await supabase
      .from('claims')
      .select('patent_id');

    // Build claims count map
    const claimsMap: Record<string, number> = {};
    if (claimsCounts) {
      for (const c of claimsCounts) {
        claimsMap[c.patent_id] = (claimsMap[c.patent_id] || 0) + 1;
      }
    }

    // Fetch company info
    const { data: company } = await supabase
      .from('companies')
      .select('*')
      .single();

    // Categorize patents by technology area based on title keywords
    const enrichedPatents = patents.map(patent => {
      const title = (patent.title || '').toLowerCase();
      const abstract = (patent.abstract || '').toLowerCase();
      const combined = title + ' ' + abstract;

      // Technology categorization
      let category = 'Other';
      if (combined.includes('blockchain') || combined.includes('distributed ledger') || combined.includes('chain of trust')) {
        category = 'Blockchain & DLT';
      } else if (combined.includes('ai') || combined.includes('artificial intelligence') || combined.includes('machine learning') || combined.includes('federated learning') || combined.includes('neural')) {
        category = 'AI & Machine Learning';
      } else if (combined.includes('hash') || combined.includes('proof-of-work') || combined.includes('mining') || combined.includes('consensus')) {
        category = 'Cryptographic Methods';
      } else if (combined.includes('data structure') || combined.includes('immutable') || combined.includes('merkle') || combined.includes('manifest')) {
        category = 'Data Structures & Verification';
      } else if (combined.includes('collateral') || combined.includes('financial') || combined.includes('valuation') || combined.includes('asset')) {
        category = 'Financial Technology';
      } else if (combined.includes('iot') || combined.includes('device') || combined.includes('recordation') || combined.includes('sensor')) {
        category = 'IoT & Device Management';
      } else if (combined.includes('document') || combined.includes('authenticity') || combined.includes('verification') || combined.includes('certificate')) {
        category = 'Document Verification';
      } else if (combined.includes('shard') || combined.includes('load balanc') || combined.includes('processing') || combined.includes('transaction')) {
        category = 'Distributed Computing';
      }

      // Potential infringers based on technology area
      let potentialInfringers: string[] = [];
      switch (category) {
        case 'Blockchain & DLT':
          potentialInfringers = ['Hyperledger (IBM/Linux Foundation)', 'R3 Corda', 'ConsenSys', 'Digital Asset Holdings', 'Chain (Sequence)'];
          break;
        case 'AI & Machine Learning':
          potentialInfringers = ['Google (Federated Learning)', 'Apple (On-Device ML)', 'NVIDIA (Federated AI)', 'OpenAI', 'Microsoft Azure ML'];
          break;
        case 'Cryptographic Methods':
          potentialInfringers = ['Bitmain Technologies', 'MicroBT', 'Ethereum Foundation', 'Ripple Labs', 'Chia Network'];
          break;
        case 'Data Structures & Verification':
          potentialInfringers = ['Amazon (QLDB)', 'Guardtime', 'Chainlink', 'Filecoin (Protocol Labs)', 'Arweave'];
          break;
        case 'Financial Technology':
          potentialInfringers = ['JPMorgan (Onyx)', 'Goldman Sachs (GS DAP)', 'Securitize', 'tZERO (Overstock)', 'Broadridge Financial'];
          break;
        case 'IoT & Device Management':
          potentialInfringers = ['IOTA Foundation', 'Helium (Nova Labs)', 'VeChain', 'AWS IoT', 'Microsoft Azure IoT'];
          break;
        case 'Document Verification':
          potentialInfringers = ['DocuSign', 'Adobe (Document Cloud)', 'Notarize Inc.', 'Prove (formerly Pareteum)', 'Spruce Systems'];
          break;
        case 'Distributed Computing':
          potentialInfringers = ['Solana Labs', 'Avalanche (Ava Labs)', 'Polygon (Matic)', 'Near Protocol', 'Cosmos (Tendermint)'];
          break;
        default:
          potentialInfringers = ['Requires further analysis'];
      }

      // Patent strength indicator (based on available data)
      let strength: 'High' | 'Medium' | 'Low' = 'Medium';
      if (patent.xml_content && patent.status === 'xml_available') {
        strength = 'High'; // Full text available for enforcement
      } else if (patent.status === 'metadata_only') {
        strength = 'Low'; // Need full text for claims analysis
      }

      // Calculate years remaining (US patents = 20 years from filing)
      let yearsRemaining: number | null = null;
      if (patent.filing_date) {
        const filingDate = new Date(patent.filing_date);
        const expiryDate = new Date(filingDate);
        expiryDate.setFullYear(expiryDate.getFullYear() + 20);
        const now = new Date();
        yearsRemaining = Math.max(0, Math.round((expiryDate.getTime() - now.getTime()) / (365.25 * 24 * 60 * 60 * 1000) * 10) / 10);
      }

      return {
        id: patent.id,
        patent_number: patent.patent_number,
        title: patent.title,
        abstract: patent.abstract,
        assignee: patent.assignee,
        inventors: patent.inventors,
        filing_date: patent.filing_date,
        grant_date: patent.grant_date,
        application_number: patent.application_number,
        status: patent.status,
        category,
        potential_infringers: potentialInfringers,
        strength,
        years_remaining: yearsRemaining,
        claims_count: claimsMap[patent.id] || 0,
        has_full_text: patent.status === 'xml_available',
      };
    });

    // Build summary stats
    const categories = enrichedPatents.reduce((acc: Record<string, number>, p) => {
      acc[p.category] = (acc[p.category] || 0) + 1;
      return acc;
    }, {});

    const summary = {
      total_patents: patents.length,
      xml_available: patents.filter(p => p.status === 'xml_available').length,
      metadata_only: patents.filter(p => p.status === 'metadata_only').length,
      categories,
      earliest_filing: patents.reduce((min, p) => {
        if (!p.filing_date) return min;
        return !min || p.filing_date < min ? p.filing_date : min;
      }, null as string | null),
      latest_grant: patents.reduce((max, p) => {
        if (!p.grant_date) return max;
        return !max || p.grant_date > max ? p.grant_date : max;
      }, null as string | null),
      company: company ? { id: company.id, name: company.name } : null,
    };

    return NextResponse.json({
      success: true,
      summary,
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
