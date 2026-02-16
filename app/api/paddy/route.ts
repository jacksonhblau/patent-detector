/**
 * Paddy the Patent Defender — Chat API
 * 
 * Gathers patent portfolio + competitor data from Supabase,
 * builds rich context for Claude, returns response.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, getUserId } from '@/lib/supabase-server';

export const maxDuration = 60;

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

async function gatherContext(userId: string | null): Promise<string> {
  const sections: string[] = [];

  // Helper: optionally scope queries to user
  const scopeUser = (query: any) => userId ? query.eq('user_id', userId) : query;

  // 1. Company info
  const { data: companies } = await scopeUser(
    supabaseAdmin.from('companies').select('name, aliases')
  ).limit(1);
  const company = companies?.[0];

  // 2. User patents
  const { data: patents } = await scopeUser(
    supabaseAdmin.from('patents')
      .select('id, title, patent_number, application_number, abstract, filing_date, grant_date, status, assignee, inventors')
      .order('filing_date', { ascending: false })
  ).limit(200);

  // 3. Claims (scoped to user's patents)
  const patentIds = (patents || []).map(p => p.id);
  let claims: any[] = [];
  if (patentIds.length > 0) {
    const { data } = await supabaseAdmin.from('claims')
      .select('patent_id, claim_number, claim_type, claim_text')
      .in('patent_id', patentIds)
      .limit(100);
    claims = data || [];
  }

  // 4. Competitors
  const { data: competitors } = await scopeUser(
    supabaseAdmin.from('competitors')
      .select('id, name, website, notes')
      .not('name', 'ilike', '%inveniam%')
      .order('created_at', { ascending: false })
  );

  // 5. Competitor documents
  const competitorIds = (competitors || []).map(c => c.id);
  let docs: any[] = [];
  if (competitorIds.length > 0) {
    const { data } = await supabaseAdmin.from('competitor_documents')
      .select('competitor_id, document_name, document_type, source_url')
      .in('competitor_id', competitorIds)
      .limit(500);
    docs = data || [];
  }

  // 6. Analyses
  let analyses: any[] = [];
  if (competitorIds.length > 0) {
    const { data } = await supabaseAdmin.from('analyses')
      .select('competitor_id, infringement_score, status, results')
      .in('competitor_id', competitorIds);
    analyses = data || [];
  }

  // --- Build context ---
  if (company) {
    sections.push(`COMPANY: ${company.name}${company.aliases?.length ? ` (aliases: ${company.aliases.join(', ')})` : ''}`);
  }

  sections.push(`\n=== PATENT PORTFOLIO (${patents?.length || 0} patents) ===`);
  const titleGroups = new Map<string, string[]>();
  for (const p of (patents || [])) {
    const key = p.title || 'Untitled';
    if (!titleGroups.has(key)) titleGroups.set(key, []);
    titleGroups.get(key)!.push(p.application_number || p.patent_number || p.id);
  }
  for (const [title, apps] of titleGroups) {
    const sample = patents?.find(p => p.title === title);
    sections.push(`• ${title} [${apps.length} filing(s): ${apps.slice(0, 3).join(', ')}${apps.length > 3 ? '...' : ''}]`);
    if (sample?.abstract) sections.push(`  Abstract: ${sample.abstract.slice(0, 300)}${sample.abstract.length > 300 ? '...' : ''}`);
    if (sample?.filing_date) sections.push(`  Filed: ${sample.filing_date}${sample.grant_date ? `, Granted: ${sample.grant_date}` : ''}`);
    if (sample?.status) sections.push(`  Status: ${sample.status}`);
  }

  if (claims.length > 0) {
    const patentClaims = new Map<string, number>();
    for (const c of claims) patentClaims.set(c.patent_id, (patentClaims.get(c.patent_id) || 0) + 1);
    const indep = claims.filter(c => c.claim_type === 'independent');
    sections.push(`\n=== CLAIMS SUMMARY ===`);
    sections.push(`Total claims sampled: ${claims.length} across ${patentClaims.size} patents (${indep.length} independent)`);
    for (const c of indep.slice(0, 5)) {
      const pat = patents?.find(p => p.id === c.patent_id);
      sections.push(`\n[${pat?.title || 'Unknown patent'}, Claim ${c.claim_number}]:`);
      sections.push(c.claim_text?.slice(0, 400) || '(no text)');
    }
  }

  if (competitors && competitors.length > 0) {
    sections.push(`\n=== COMPETITORS (${competitors.length}) ===`);
    const docsMap = new Map<string, any[]>();
    for (const d of docs) { if (!docsMap.has(d.competitor_id)) docsMap.set(d.competitor_id, []); docsMap.get(d.competitor_id)!.push(d); }
    const analysisMap = new Map<string, any>();
    for (const a of analyses) analysisMap.set(a.competitor_id, a);

    for (const comp of competitors) {
      const compDocs = docsMap.get(comp.id) || [];
      const products = compDocs.filter(d => d.document_type !== 'patent');
      const compPatents = compDocs.filter(d => d.document_type === 'patent');
      const analysis = analysisMap.get(comp.id);

      sections.push(`\n--- ${comp.name} ---`);
      if (comp.website) sections.push(`Website: ${comp.website}`);
      const descMatch = comp.notes?.match(/Description: (.+?)(?:\n|$)/);
      if (descMatch) sections.push(`Description: ${descMatch[1]}`);
      sections.push(`Products/Services: ${products.length}, Patents: ${compPatents.length}`);
      if (products.length > 0) sections.push(`Products: ${products.map(d => d.document_name).join(', ')}`);
      if (compPatents.length > 0) sections.push(`Their patents: ${compPatents.slice(0, 10).map(d => d.document_name).join(', ')}${compPatents.length > 10 ? ` (+${compPatents.length - 10} more)` : ''}`);

      if (analysis) {
        const r = analysis.results || {};
        sections.push(`Analysis: Risk=${r.companyRisk || '?'}, Settlement=${r.settlementProbability || '?'}%, Infringement Score=${analysis.infringement_score || '?'}`);
        if (r.products?.length) {
          for (const p of r.products) sections.push(`  • ${p.name}: ${p.infringementProbability}% infringement — ${p.reasoning?.slice(0, 150) || ''}`);
        }
        if (r.settlementFactors?.length) {
          sections.push(`Settlement factors:`);
          for (const f of r.settlementFactors) sections.push(`  ${f.impact === 'positive' ? '🔴' : f.impact === 'negative' ? '🟢' : '⚪'} ${f.factor}: ${f.detail}`);
        }
      } else {
        sections.push(`Analysis: Not yet completed`);
      }
    }
  }

  return sections.join('\n');
}

export async function POST(request: NextRequest) {
  try {
    const { messages } = (await request.json()) as { messages: Message[] };

    if (!messages || messages.length === 0) {
      return NextResponse.json({ error: 'No messages provided' }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
    }

    // Try to identify user (optional)
    const userId = await getUserId(request);

    // Gather DB context
    const dbContext = await gatherContext(userId);

    const systemPrompt = `You are Paddy the Patent Defender 🥊 — a sharp, confident, and slightly cheeky AI assistant who helps users understand and defend their patent portfolio. You fight for their IP rights like a champion fights in the ring.

PERSONALITY:
- Confident and direct — you don't mince words about infringement risks
- Encouraging — you're on the user's side and help them understand their strengths
- Knowledgeable — you speak fluently about patent law, claims analysis, prior art, and litigation strategy
- Approachable — you use plain language but can get technical when needed
- Slightly witty — you might drop a fighting metaphor now and then ("That competitor's product is walking right into your patent's right hook")
- Concise — keep responses focused, use short paragraphs, avoid walls of text

You have FULL ACCESS to the user's patent portfolio data, competitor analysis, and infringement scores. When asked about specific patents, competitors, products, or analysis results, reference the ACTUAL DATA below. If you don't have data on something, say so honestly.

WHAT YOU CAN HELP WITH:
- Explaining patent claims in plain language
- Summarizing infringement risks by competitor
- Comparing user patents vs competitor products
- Discussing litigation/settlement strategy
- Helping prioritize which infringements to pursue
- Explaining patent strength and remaining life
- General patent law questions

CURRENT DATABASE CONTEXT:
${dbContext}

FORMATTING RULES:
- Keep responses concise (2-4 short paragraphs max unless more detail is requested)
- Use bold for key terms when helpful
- Don't use bullet lists unless the user asks for a list
- Reference specific patent titles, competitor names, and scores from the data above
- If asked about data that isn't in your context, say you don't have that info yet`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1500,
        system: systemPrompt,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Claude API error:', response.status, errText);
      if (response.status === 429) {
        return NextResponse.json({ error: 'Paddy needs a quick breather — too many requests. Try again in a moment! 🥊' }, { status: 429 });
      }
      return NextResponse.json({ error: 'Failed to get response from Paddy' }, { status: 500 });
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || "Paddy's at a loss for words — that's a first! Try asking again.";

    return NextResponse.json({ response: text });

  } catch (error) {
    console.error('Paddy API error:', error);
    return NextResponse.json(
      { error: 'Something went wrong. Even champions have off days — try again!' },
      { status: 500 }
    );
  }
}
