/**
 * Shared Competitor Research & Analysis Logic
 * 
 * Used by:
 * - /api/competitors/add-from-portfolio (portfolio page "Add as Competitor")
 * - /api/onboarding/process-competitor (onboarding flow)
 * - /api/competitors/research-batch (batch add page)
 * 
 * This avoids the self-fetch problem where Next.js API routes
 * try to HTTP-call each other and fail on URL resolution.
 */

import { supabase } from '@/lib/supabase';
import { createClient } from '@supabase/supabase-js';
import { searchUSPTOPatents, extractAbstractFromXml, extractDescriptionFromXml } from '@/lib/uspto-search';
import { getAssociatedDocuments } from '@/lib/uspto-patent-downloader';

const PATENT_SUMMARY = `Inveniam Capital Partners holds 97+ patents covering:
1. Blockchain & DLT - Load balancing, transaction sharding, import/export, multi-chain data backups
2. Data Structures & Verification - Immutable data structures with self-references, manifest documents, chain of trust
3. Cryptographic Methods - Separating hashing from proof-of-work, RAM hashing, novel mining approaches
4. AI & Machine Learning - Federated learning model modification, AI-powered data analysis
5. Document Verification - Electronic document authentication via blockchain, multi-signature verification
6. Financial Technology - Programmatic collateralization, asset valuation on blockchain
7. IoT & Device Management - Device usage recordation to blockchains
8. Distributed Computing - Transaction processing, blockchain sharding, consensus mechanisms`;

/* ─── Admin Supabase client (bypasses RLS for server-side lookups) ─── */

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    console.warn('⚠️ SUPABASE_SERVICE_ROLE_KEY not set — falling back to anon client');
    return supabase;
  }
  return createClient(url, serviceKey);
}

/* ─── Claude helpers ─── */

async function callClaude(prompt: string, maxTokens = 3000, useWebSearch = false) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not found');

  const requestBody: any = {
    model: 'claude-sonnet-4-20250514',
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: prompt }],
  };
  if (useWebSearch) {
    requestBody.tools = [{ type: 'web_search_20250305', name: 'web_search' }];
  }

  const maxRetries = 4;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(requestBody),
    });

    if (res.ok) {
      const data = await res.json();
      return (data.content || [])
        .filter((block: any) => block.type === 'text')
        .map((block: any) => block.text)
        .join('\n');
    }

    if (res.status === 429 && attempt < maxRetries) {
      const retryAfter = res.headers.get('retry-after');
      const waitMs = retryAfter
        ? parseInt(retryAfter) * 1000
        : Math.min(30000 + (attempt * 30000), 120000);
      console.log(`⏳ Rate limited (attempt ${attempt + 1}/${maxRetries}). Waiting ${Math.round(waitMs / 1000)}s...`);
      await new Promise(resolve => setTimeout(resolve, waitMs));
      continue;
    }

    const errText = await res.text();
    throw new Error(`Claude API error ${res.status}: ${errText}`);
  }

  throw new Error('Max retries exceeded for Claude API');
}

function parseJsonResponse(text: string) {
  const jsonMatch = text.match(/```json\s*([\s\S]*?)```/) || text.match(/(\{[\s\S]*\})/);
  const jsonStr = jsonMatch ? jsonMatch[1].trim() : text.trim();
  return JSON.parse(jsonStr);
}

/* ─── URL helpers ─── */

async function verifyUrl(url: string): Promise<{ live: boolean; contentType: string }> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PatentResearchBot/1.0)' },
    });
    clearTimeout(timeout);
    return { live: res.ok, contentType: res.headers.get('content-type') || '' };
  } catch {
    return { live: false, contentType: '' };
  }
}

async function fetchPageText(url: string): Promise<string> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PatentResearchBot/1.0)' },
    });
    clearTimeout(timeout);
    if (!res.ok) return '';
    const html = await res.text();
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[\s\S]*?<\/nav>/gi, '')
      .replace(/<footer[\s\S]*?<\/footer>/gi, '')
      .replace(/<header[\s\S]*?<\/header>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 5000);
  } catch {
    return '';
  }
}

/* ─── Resolve a real userId from the database ─── */

async function resolveUserId(providedUserId?: string): Promise<string> {
  if (providedUserId && providedUserId !== '00000000-0000-0000-0000-000000000000') {
    return providedUserId;
  }

  const admin = getAdminClient();

  const { data: competitors } = await admin
    .from('competitors')
    .select('user_id')
    .not('user_id', 'eq', '00000000-0000-0000-0000-000000000000')
    .limit(1);
  if (competitors && competitors.length > 0 && competitors[0].user_id) {
    return competitors[0].user_id;
  }

  const { data: patents } = await admin
    .from('patents')
    .select('user_id')
    .not('user_id', 'eq', '00000000-0000-0000-0000-000000000000')
    .limit(1);
  if (patents && patents.length > 0 && patents[0].user_id) {
    return patents[0].user_id;
  }

  const { data: companies } = await admin
    .from('companies')
    .select('user_id')
    .not('user_id', 'eq', '00000000-0000-0000-0000-000000000000')
    .limit(1);
  if (companies && companies.length > 0 && companies[0].user_id) {
    return companies[0].user_id;
  }

  throw new Error('No valid user_id found. Please sign in first so a user account exists.');
}

/* ─── Build Google Patents URL from identifiers (same logic as user patents) ─── */

function buildGooglePatentsUrl(patentNumber?: string, applicationNumber?: string, title?: string): string {
  // Prefer grant number (direct link), fall back to search by title
  if (patentNumber && patentNumber !== applicationNumber) {
    // Grant number like "11687916" → https://patents.google.com/patent/US11687916/en
    const num = patentNumber.replace(/\D/g, '');
    return `https://patents.google.com/patent/US${num}/en`;
  }
  // Fall back to title search (always works)
  if (title) {
    return `https://patents.google.com/?q=${encodeURIComponent(title)}`;
  }
  // Last resort: search by application number
  return `https://patents.google.com/?q=${applicationNumber || 'unknown'}`;
}

/* ─── Main exported function ─── */

export interface ResearchResult {
  competitorId: string;
  competitorName: string;
  website: string;
  description: string;
  aliases: string[];
  productsAdded: number;
  patentsFound: number;
  analysis: {
    settlementProbability: number;
    companyRisk: string;
    overallInfringement: number;
  } | null;
}

export async function researchAndAnalyzeCompetitor(opts: {
  companyName: string;
  patentCategory?: string;
  sourcePatentId?: string;
  existingCompetitorId?: string;
  userId?: string;
}): Promise<ResearchResult> {
  const {
    companyName,
    patentCategory = 'Blockchain & Distributed Ledger Technology',
    sourcePatentId,
    existingCompetitorId,
  } = opts;

  const userId = await resolveUserId(opts.userId);

  let competitorId = existingCompetitorId || null;
  let competitorName = companyName;
  let competitorWebsite = '';
  let competitorDescription = '';

  // ─── Step 1: Web search for real products ───
  console.log(`🔍 Web-searching for ${companyName} products & services...`);

  const researchText = await callClaude(
    `Research the company "${companyName}" in the ${patentCategory} space.

Search the web for their products, services, and technology documentation. I need:
1. Their official website URL
2. A description of the company
3. Their key products and services with REAL URLs to actual product/documentation pages
4. Alternative company names or aliases

Return your findings as JSON in this format:
\`\`\`json
{
  "officialName": "Company legal name",
  "aliases": ["alt names"],
  "websiteUrl": "https://...",
  "description": "What the company does",
  "technologyStack": ["key technologies they use"],
  "products": [
    {
      "name": "Product name",
      "url": "https://real-url-to-product-page",
      "description": "What this product does and its key technical features",
      "category": "Platform|Protocol|Infrastructure|Trading|Analytics|Security|Wallet|DeFi|Tokenization|Other"
    }
  ]
}
\`\`\`

CRITICAL: Only include URLs you actually found in search results. Every URL must be a real, currently accessible page. Include 3-8 products/services focused on blockchain, DLT, cryptography, data verification, or financial technology.`,
    4000,
    true
  );

  let research: any;
  try {
    research = parseJsonResponse(researchText);
  } catch {
    console.warn('⚠️ Could not parse research JSON, using fallback');
    research = { officialName: companyName, aliases: [], websiteUrl: '', description: '', technologyStack: [], products: [] };
  }

  console.log(`✅ Research found: ${research.officialName} — ${research.products?.length || 0} products`);

  competitorName = research.officialName || companyName;
  competitorWebsite = research.websiteUrl || '';
  competitorDescription = research.description || '';

  // ─── Step 2: Create or update competitor ───
  if (!competitorId) {
    const { data: competitor, error: compError } = await supabase.from('competitors').insert({
      user_id: userId,
      name: competitorName,
      website: competitorWebsite || null,
      notes: [
        `Aliases: ${research.aliases?.join(', ') || 'None'}`,
        `Description: ${competitorDescription}`,
        `Technology: ${research.technologyStack?.join(', ') || 'N/A'}`,
        `Source: AI web research in ${patentCategory}`,
        sourcePatentId ? `Source Patent: ${sourcePatentId}` : '',
      ].filter(Boolean).join('\n'),
    }).select().single();
    if (compError) throw new Error(`DB error: ${compError.message}`);
    competitorId = competitor.id;
  } else {
    await supabase.from('competitors').update({
      website: competitorWebsite || undefined,
      notes: [
        `Aliases: ${research.aliases?.join(', ') || 'None'}`,
        `Description: ${competitorDescription}`,
        `Technology: ${research.technologyStack?.join(', ') || 'N/A'}`,
        `Source: AI web research in ${patentCategory}`,
      ].join('\n'),
    }).eq('id', competitorId);
  }

  // ─── Step 3: Verify URLs and save products ───
  let productsAdded = 0;
  for (const p of (research.products || [])) {
    const { data: existingDoc } = await supabase.from('competitor_documents')
      .select('id').eq('competitor_id', competitorId).eq('document_name', p.name).limit(1);
    if (existingDoc && existingDoc.length > 0) continue;

    let url = p.url || '';
    let pageContent = '';
    let isLive = false;

    if (url) {
      console.log(`🔗 Verifying: ${url}`);
      const check = await verifyUrl(url);
      isLive = check.live;
      if (isLive && !check.contentType.includes('pdf')) {
        pageContent = await fetchPageText(url);
        console.log(`   ✅ Live — fetched ${pageContent.length} chars`);
      } else if (isLive) {
        console.log(`   ✅ Live (PDF)`);
      } else {
        console.log(`   ❌ URL not reachable`);
        url = '';
      }
    }

    const { error } = await supabase.from('competitor_documents').insert({
      competitor_id: competitorId,
      source_url: url || competitorWebsite || null,
      document_name: p.name,
      document_type: 'product_service',
      total_pages: 0,
      extracted_text: pageContent
        ? `[${p.category || 'Product'}] ${p.description}\n\n--- Page Content ---\n${pageContent}`
        : `[${p.category || 'Product'}] ${p.description}`,
      status: isLive ? 'verified' : 'ai_researched',
    });
    if (!error) productsAdded++;
  }
  console.log(`📦 Saved ${productsAdded} products`);

  // ─── Step 4: USPTO patent search + associated documents ───
  // This mirrors the EXACT same process as user patent discovery in
  // lib/uspto-patent-downloader.ts processPatent(), just storing into
  // competitor_documents instead of patents table.
  let patentsFound = 0;
  let xmlFetched = 0;
  try {
    const searchNames = [competitorName, ...(research.aliases || [])];
    const patents = await searchUSPTOPatents(searchNames);
    
    for (let i = 0; i < Math.min(patents.length, 15); i++) {
      const pat = patents[i];
      
      console.log(`\n📋 Processing competitor patent: ${pat.applicationNumberText}`);
      console.log(`   Title: ${pat.patentTitle || 'Unknown'}`);

      // Skip duplicates by application_number
      const { data: existingPat } = await supabase.from('competitor_documents')
        .select('id').eq('competitor_id', competitorId)
        .eq('application_number', pat.applicationNumberText)
        .limit(1);
      if (existingPat && existingPat.length > 0) {
        console.log(`   ⏭️ Already exists, skipping`);
        continue;
      }

      // ── Same flow as processPatent() in uspto-patent-downloader.ts ──
      
      // 1. Fetch associated documents to get full text XML
      const associatedDoc = await getAssociatedDocuments(pat.applicationNumberText);
      
      let fullAbstract = pat.abstract || '';
      let xmlUrl: string | null = null;
      let xmlContent: string | null = null;
      let grantNumber: string | null = pat.patentNumber || null;
      
      if (associatedDoc) {
        // Prefer grant document, fallback to PGPUB (same as user process)
        const xmlMetadata = associatedDoc.grantDocumentMetaData || associatedDoc.pgpubDocumentMetaData;
        
        if (xmlMetadata?.fileLocationURI) {
          xmlUrl = xmlMetadata.fileLocationURI;
          console.log(`   📄 Found XML: ${xmlMetadata.productIdentifier}`);
          console.log(`   🔗 XML URL: ${xmlUrl}`);
          
          // 2. Fetch the XML to get full abstract (same as user process)
          try {
            const apiKey = process.env.USPTO_API_KEY;

            const xmlResponse = await fetch(xmlUrl!, {
              headers: apiKey ? {
                'X-API-KEY': apiKey,
                'accept': 'application/xml',
              } : {},
            });
            
            console.log(`   📡 XML Response status: ${xmlResponse.status}`);
            
            if (xmlResponse.ok) {
              const xmlText = await xmlResponse.text();
              console.log(`   📝 XML length: ${xmlText.length} characters`);
              
              xmlContent = xmlText;
              
              // 3. Extract abstract from XML (same regex as user process)
              const abstractMatch = xmlText.match(/<abstract[^>]*>([\s\S]*?)<\/abstract>/i);
              if (abstractMatch) {
                fullAbstract = abstractMatch[1]
                  .replace(/<[^>]+>/g, ' ')
                  .replace(/\s+/g, ' ')
                  .trim();
                console.log(`   ✅ Extracted abstract (${fullAbstract.length} chars): ${fullAbstract.substring(0, 100)}...`);
              }
              
              // Try to extract grant number from XML if we don't have one
              if (!grantNumber) {
                const grantMatch = xmlText.match(/<us-patent-grant[^>]*doc-number="(\d+)"/i)
                  || xmlText.match(/<publication-reference[^>]*>[\s\S]*?<doc-number[^>]*>(\d+)<\/doc-number>/i);
                if (grantMatch) {
                  grantNumber = grantMatch[1];
                  console.log(`   📋 Extracted grant number from XML: ${grantNumber}`);
                }
              }
              
              xmlFetched++;
            } else {
              const errorText = await xmlResponse.text();
              console.log(`   ❌ XML fetch failed: ${xmlResponse.status} - ${errorText.substring(0, 200)}`);
            }
          } catch (xmlError) {
            console.log(`   ❌ XML fetch error:`, xmlError);
          }
        } else {
          console.log(`   ⚠️ No XML URL available`);
        }
      } else {
        console.log(`   ⚠️ No associated documents found`);
      }

      // 4. Build Google Patents URL for viewing (grant number → direct link)
      const patentNumberForDb = grantNumber || pat.applicationNumberText;
      const sourceUrl = buildGooglePatentsUrl(grantNumber || undefined, pat.applicationNumberText, pat.patentTitle);

      // 5. Build extracted text for analysis (abstract + description excerpt)
      let extractedText = fullAbstract;
      if (xmlContent) {
        const desc = extractDescriptionFromXml(xmlContent);
        if (desc) {
          extractedText = [
            fullAbstract,
            `\n\n--- Description (excerpt) ---\n${desc.substring(0, 2000)}`,
          ].join('');
        }
      }

      // 6. Store — same columns as patents table (patent_number, application_number)
      const { error } = await supabase.from('competitor_documents').insert({
        competitor_id: competitorId,
        source_url: sourceUrl,
        document_name: pat.patentTitle || `Patent ${pat.applicationNumberText}`,
        document_type: 'patent',
        total_pages: 1,
        extracted_text: extractedText,
        status: xmlUrl ? 'xml_available' : 'metadata_only',
        // Consistent with patents table columns:
        patent_number: patentNumberForDb,
        application_number: pat.applicationNumberText,
      });
      
      if (!error) {
        patentsFound++;
        console.log(`   ✅ Patent saved: patent_number=${patentNumberForDb}, application_number=${pat.applicationNumberText}`);
        console.log(`   🔗 View URL: ${sourceUrl}`);
      } else {
        console.error(`   ❌ Error saving patent:`, error.message);
      }
    }
  } catch (err) { console.warn('USPTO search failed:', err); }
  console.log(`\n📋 Found ${patentsFound} USPTO patents (${xmlFetched} with XML)`);

  // ─── Step 5: Gather all docs for analysis ───
  const { data: allDocs } = await supabase.from('competitor_documents')
    .select('document_name, document_type, extracted_text')
    .eq('competitor_id', competitorId);

  const productDescriptions = (allDocs || [])
    .filter((d: any) => ['product_service', 'product_page'].includes(d.document_type))
    .map((d: any) => `- ${d.document_name}: ${(d.extracted_text || '').slice(0, 500)}`)
    .join('\n');

  const uploadedDocSummaries = (allDocs || [])
    .filter((d: any) => ['pdf', 'uploaded'].includes(d.document_type))
    .map((d: any) => `- ${d.document_name}: ${(d.extracted_text || '').slice(0, 500)}`)
    .join('\n');

  const competitorPatentAbstracts = (allDocs || [])
    .filter((d: any) => d.document_type === 'patent' && d.extracted_text)
    .slice(0, 10)
    .map((d: any) => `- ${d.document_name}: ${(d.extracted_text || '').slice(0, 300)}`)
    .join('\n');

  // ─── Step 6: Run infringement analysis ───
  console.log(`⏳ Waiting 60s for rate limit window to reset before analysis...`);
  await new Promise(resolve => setTimeout(resolve, 60000));
  console.log(`🤖 Running infringement analysis for ${competitorName}...`);
  const analysisText = await callClaude(
    `You are a patent infringement analyst. Analyze this competitor against Inveniam Capital Partners' patent portfolio.

INVENIAM PATENT PORTFOLIO:
${PATENT_SUMMARY}

COMPETITOR: ${competitorName}
Website: ${competitorWebsite}
Description: ${competitorDescription}
Technology Stack: ${research.technologyStack?.join(', ') || 'Unknown'}

COMPETITOR PRODUCTS & SERVICES:
${productDescriptions || 'No product data available'}

${uploadedDocSummaries ? `USER-UPLOADED COMPETITOR DOCUMENTATION:\n${uploadedDocSummaries}\n` : ''}
${competitorPatentAbstracts ? `COMPETITOR PATENTS (from USPTO):\n${competitorPatentAbstracts}\n` : ''}

Analyze each product/service for potential infringement on Inveniam's patents. Consider:
- Direct technology overlap (same blockchain techniques, data structures, verification methods)
- Functional equivalence (different implementation but same patented concept)
- Use of patented methods (hashing approaches, sharding, load balancing, federated learning)

Return ONLY valid JSON:
\`\`\`json
{
  "settlementProbability": <0-100>,
  "settlementFactors": [
    {"factor": "Factor name", "impact": "positive|negative|neutral", "detail": "Why this affects settlement likelihood"}
  ],
  "companyRisk": "High|Medium|Low",
  "products": [
    {
      "name": "Exact product/service name from the list above",
      "infringementProbability": <0-100>,
      "relevantPatents": ["Which Inveniam patent areas overlap"],
      "reasoning": "2-3 sentences explaining the infringement risk with specific technical overlap"
    }
  ]
}
\`\`\`

SCORING GUIDELINES:
- settlementProbability: Startups with limited funding 60-80%, large well-funded companies 20-40%
- infringementProbability: Products directly implementing patented concepts = 60-90%. Tangentially related = 20-50%. Unrelated = 0-15%.
- Include 3-5 settlement factors
- Be specific in reasoning — cite which Inveniam patent areas overlap`,
    4000,
    false
  );

  let analysis: any;
  try {
    analysis = parseJsonResponse(analysisText);
  } catch {
    console.warn('⚠️ Could not parse analysis JSON, using fallback');
    analysis = {
      settlementProbability: 50,
      settlementFactors: [{ factor: 'Analysis Error', impact: 'neutral', detail: 'Could not complete analysis' }],
      companyRisk: 'Medium',
      products: [],
    };
  }

  // ─── Step 7: Cache analysis ───
  const productScores = analysis.products?.map((p: any) => p.infringementProbability) || [0];
  const maxScore = Math.max(...productScores);
  const avgScore = productScores.length > 0
    ? Math.round(productScores.reduce((s: number, v: number) => s + v, 0) / productScores.length)
    : 0;

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const validPatentId = sourcePatentId && uuidRegex.test(sourcePatentId) ? sourcePatentId : null;

  const { error: analysisError } = await supabase.from('analyses').upsert({
    competitor_id: competitorId,
    patent_id: validPatentId,
    status: 'complete',
    results: analysis,
    infringement_score: maxScore,
  }, { onConflict: 'competitor_id' });

  if (analysisError) {
    console.error('❌ Failed to save analysis:', analysisError.message);
  } else {
    console.log(`✅ Analysis cached: risk=${analysis.companyRisk}, settlement=${analysis.settlementProbability}%, max=${maxScore}%`);
  }

  return {
    competitorId: competitorId!,
    competitorName,
    website: competitorWebsite,
    description: competitorDescription,
    aliases: research.aliases || [],
    productsAdded,
    patentsFound,
    analysis: {
      settlementProbability: analysis.settlementProbability,
      companyRisk: analysis.companyRisk,
      overallInfringement: avgScore,
    },
  };
}
