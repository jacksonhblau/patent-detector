/**
 * Onboarding API Endpoint
 * 
 * Handles company setup and auto-discovery of patents
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { discoverCompanyPatents } from '@/lib/uspto-patent-downloader';

interface OnboardingRequest {
  companyName: string;
  companyAliases: string[];
  competitorName: string;
  competitorAliases: string[];
  competitorWebsite?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: OnboardingRequest = await request.json();
    const { companyName, companyAliases, competitorName, competitorAliases, competitorWebsite } = body;

    if (!companyName) {
      return NextResponse.json(
        { error: 'Company name is required' },
        { status: 400 }
      );
    }

    console.log(`🚀 Starting onboarding for: ${companyName}`);

    // TODO: Replace with actual user authentication
    const userId = '00000000-0000-0000-0000-000000000000';

    // Step 1: Create company record
    const { data: company, error: companyError } = await supabase
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

    console.log(`✅ Company created: ${company.id}`);

    // Step 2: Create competitor record (optional)
    let competitorId = null;
    if (competitorName) {
      const { data: competitor, error: competitorError } = await supabase
        .from('competitors')
        .insert({
          user_id: userId,
          name: competitorName,
          aliases: competitorAliases || [],
          website: competitorWebsite || null,
        })
        .select()
        .single();

      if (!competitorError) {
        competitorId = competitor.id;
        console.log(`✅ Competitor created: ${competitorId}`);
      }
    }

    // Step 3: Auto-discover company patents
    console.log(`\n🔍 Discovering company patents...`);
    const patentResults = await discoverCompanyPatents(
      companyName,
      companyAliases || [],
      company.id,
      userId
    );

    // Step 4: Auto-discover competitor patents (if provided)
    let competitorPatentResults = null;
    if (competitorId && competitorName) {
      console.log(`\n🔍 Discovering competitor patents...`);
      
      // Reuse existing competitor research system
      // We'll integrate this in the next step
    }

    return NextResponse.json({
      success: true,
      company: {
        id: company.id,
        name: companyName,
      },
      patents: patentResults,
      competitor: competitorId ? {
        id: competitorId,
        name: competitorName,
      } : null,
    });
  } catch (error) {
    console.error('❌ Onboarding error:', error);
    return NextResponse.json(
      { error: 'Onboarding failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
