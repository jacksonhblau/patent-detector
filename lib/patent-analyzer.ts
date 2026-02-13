/**
 * Patent Analysis with Claude
 * 
 * Analyzes patent text using Claude API while preserving page number references.
 */

import type { PageContent } from './textract-extractor';

export interface PatentElement {
  element: string;
  page_number: number;
  text_snippet: string;
}

export interface PatentClaim {
  claim_number: number;
  claim_type: 'independent' | 'dependent';
  page_number: number;
  claim_text: string;
  elements: PatentElement[];
  depends_on?: number;
}

export interface PatentAnalysis {
  patent_number: string;
  title: string;
  abstract: string;
  claims: PatentClaim[];
}

/**
 * Analyze patent with Claude API, preserving page context
 */
export async function analyzePatentWithClaude(
  pages: PageContent[]
): Promise<PatentAnalysis> {
  
  const apiKey = process.env.ANTHROPIC_API_KEY;
  
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY not found in environment variables');
  }
  
  // Build prompt with page-numbered context
  const pagesText = pages.map(page => 
    `=== PAGE ${page.pageNumber} ===\n${page.text}`
  ).join('\n\n');
  
  const prompt = `Analyze this patent document and extract structured information. 
IMPORTANT: Track which PAGE NUMBER each piece of information comes from.

${pagesText}

Extract and return ONLY valid JSON with NO markdown formatting, NO code fences, NO backticks.

CRITICAL JSON FORMATTING RULES:
- Escape all quotes in text with \"
- Escape all backslashes with \\
- Do NOT include any text before or after the JSON
- Do NOT wrap in markdown code blocks
- Return ONLY the raw JSON object

JSON structure:
{
  "patent_number": "US-XXXXXXX-XX",
  "title": "Full patent title",
  "abstract": "Patent abstract/summary",
  "claims": [
    {
      "claim_number": 1,
      "claim_type": "independent",
      "page_number": 7,
      "claim_text": "Full text of claim 1",
      "elements": [
        {
          "element": "network interface",
          "page_number": 7,
          "text_snippet": "exact text from patent showing this element"
        }
      ]
    }
  ]
}

Rules:
- Extract ALL claims from the patent
- For each claim, identify if it's "independent" or "dependent"
- For dependent claims, note which claim it depends on in "depends_on" field
- Break each claim into its component elements
- Track the PAGE NUMBER where each element is described
- Extract a short text snippet showing the element in context
- Be precise with page numbers
- ESCAPE all special characters in JSON strings
- Return ONLY valid JSON, no other text`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 8000,
        messages: [{
          role: 'user',
          content: prompt
        }]
      })
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Claude API error: ${error}`);
    }
    
    const data = await response.json();
    
    // Extract JSON from Claude's response
    const responseText = data.content[0].text;
    
    console.log('📝 Claude response length:', responseText.length);
    
    // Remove markdown code fences if present
    let jsonText = responseText.trim();
    
    // Remove ```json or ``` from start
    if (jsonText.startsWith('```json')) {
      jsonText = jsonText.slice(7); // Remove ```json
    } else if (jsonText.startsWith('```')) {
      jsonText = jsonText.slice(3); // Remove ```
    }
    
    // Remove ``` from end
    if (jsonText.endsWith('```')) {
      jsonText = jsonText.slice(0, -3);
    }
    
    // Remove any leading/trailing whitespace and backticks
    jsonText = jsonText.trim().replace(/^`+|`+$/g, '');
    
    console.log('🔍 First 500 chars of cleaned JSON:', jsonText.substring(0, 500));
    console.log('🔍 Last 500 chars of cleaned JSON:', jsonText.substring(jsonText.length - 500));
    
    try {
      const analysis: PatentAnalysis = JSON.parse(jsonText);
      console.log('✅ Successfully parsed JSON');
      return analysis;
    } catch (parseError) {
      console.error('❌ JSON Parse Error:', parseError);
      console.error('📄 Full JSON text:', jsonText);
      throw parseError;
    }
    
  } catch (error) {
    console.error('Patent analysis error:', error);
    throw new Error(`Failed to analyze patent: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Compare patent claims against competitor document
 */
export async function compareWithCompetitor(
  claims: PatentClaim[],
  competitorPages: PageContent[],
  competitorName: string
): Promise<any[]> {
  
  const apiKey = process.env.ANTHROPIC_API_KEY;
  
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY not found');
  }
  
  const competitorText = competitorPages.map(page => 
    `=== PAGE ${page.pageNumber} ===\n${page.text}`
  ).join('\n\n');
  
  const claimsText = claims.map(claim => 
    `Claim ${claim.claim_number}: ${claim.claim_text}`
  ).join('\n\n');
  
  const prompt = `Compare these patent claims against this competitor document.
Find which elements from the patent claims appear in the competitor document.

PATENT CLAIMS:
${claimsText}

COMPETITOR DOCUMENT (${competitorName}):
${competitorText}

Return JSON array of matches:
[
  {
    "claim_number": 1,
    "element": "network interface",
    "found_on_page": 12,
    "text_snippet": "exact text from competitor doc",
    "confidence_score": 0.95
  }
]

Only include matches where you find clear evidence of the element in the competitor doc.
Track PAGE NUMBERS precisely.`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 8000,
        messages: [{
          role: 'user',
          content: prompt
        }]
      })
    });
    
    const data = await response.json();
    const responseText = data.content[0].text;
    
    // Extract JSON
    let jsonMatch = responseText.match(/```json\n([\s\S]*?)\n```/);
    if (!jsonMatch) {
      jsonMatch = responseText.match(/\[([\s\S]*?)\]/);
    }
    
    const jsonText = jsonMatch ? jsonMatch[1] : responseText;
    const matches = JSON.parse(jsonMatch ? `[${jsonText}]` : jsonText);
    
    return matches;
    
  } catch (error) {
    console.error('Competitor comparison error:', error);
    throw new Error(`Failed to compare with competitor: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
