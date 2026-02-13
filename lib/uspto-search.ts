/**
 * USPTO Open Data Portal Patent Search + XML Fetching
 * 
 * Searches for patents by company name/aliases using the USPTO API,
 * and fetches full patent XML from the Bulk Data (Datasets) API.
 * 
 * Two API surfaces used:
 * 1. Patent Applications Search: /api/v1/patent/applications/search
 * 2. Bulk Data Files: /api/v1/datasets/products/files/{PRODUCT}/{year}/{bundle}/{file}.xml
 */

export interface USPTOPatent {
  applicationNumberText: string;
  patentNumber?: string;
  patentTitle?: string;
  filingDate?: string;
  grantDate?: string;
  applicants?: string[];
  inventors?: string[];
  abstract?: string;
}

export interface PatentXmlResult {
  xmlContent: string;
  xmlUrl: string;
  product: 'PTGRXML' | 'APPXML';
  abstract: string;
}

const API_BASE = 'https://api.uspto.gov/api/v1';

function getApiKey(): string {
  return process.env.USPTO_API_KEY || 'llargygvqeecpsxabhbzgwldolljua';
}

/**
 * Search USPTO for patents by company name
 */
export async function searchUSPTOPatents(
  companyNames: string[]
): Promise<USPTOPatent[]> {
  const apiKey = getApiKey();
  
  console.log('🔍 DEBUG: USPTO_API_KEY exists?', !!apiKey);
  console.log('🔍 DEBUG: API key length:', apiKey?.length || 0);
  
  if (!apiKey) {
    console.warn('⚠️  USPTO_API_KEY not found - skipping patent search');
    return [];
  }

  const allPatents: USPTOPatent[] = [];

  for (const companyName of companyNames) {
    try {
      console.log(`🔍 Searching USPTO for: ${companyName}`);

      const response = await fetch(
        `${API_BASE}/patent/applications/search`,
        {
          method: 'POST',
          headers: {
            'X-API-KEY': apiKey,
            'Content-Type': 'application/json',
            'accept': 'application/json',
          },
          body: JSON.stringify({
            q: `${companyName}`,
            pagination: { offset: 0, limit: 25 },
            sort: [{ field: 'applicationMetaData.filingDate', order: 'desc' }],
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`❌ USPTO API error for ${companyName}:`, response.status, errorText);
        continue;
      }

      const data = await response.json();
      const results = data.results || [];
      console.log(`   Found ${results.length} patents for ${companyName} (total: ${data.count || '?'})`);

      for (const result of results) {
        const metadata = result.applicationMetaData || {};
        allPatents.push({
          applicationNumberText: result.applicationNumberText || '',
          patentNumber: metadata.patentNumber,
          patentTitle: metadata.inventionTitle,
          filingDate: metadata.filingDate,
          grantDate: metadata.grantDate,
          applicants: metadata.applicantBag?.map((a: any) => a.applicantNameText) || [],
          inventors: metadata.inventorBag?.map((i: any) => i.inventorNameText) || [],
          abstract: metadata.inventionAbstract,
        });
      }
    } catch (error) {
      console.error(`❌ Error searching USPTO for ${companyName}:`, error);
    }
  }

  return allPatents;
}

/**
 * Fetch full patent XML from USPTO Bulk Data API
 * 
 * Tries both granted patent XML (PTGRXML-SPLT) and application XML (APPXML-SPLT).
 * Uses the datasets/products file search to discover the correct file path.
 * 
 * @param applicationNumber - The application number (e.g., "15456067")
 * @param patentNumber - Optional grant number (e.g., "10411897")
 * @param publicationNumber - Optional publication number (e.g., "20180260889")
 * @returns PatentXmlResult or null if no XML available
 */
export async function fetchPatentXml(
  applicationNumber: string,
  patentNumber?: string,
  publicationNumber?: string,
): Promise<PatentXmlResult | null> {
  const apiKey = getApiKey();
  if (!apiKey) return null;

  const appNum = applicationNumber.replace(/\D/g, ''); // strip non-digits
  
  const headers = {
    'X-API-KEY': apiKey,
    'accept': 'application/xml',
  };

  // Strategy: search the datasets API for XML files matching this application
  // Try PTGRXML (granted) first, then APPXML (published applications)
  const products = ['PTGRXML-SPLT', 'APPXML-SPLT'] as const;
  
  for (const product of products) {
    try {
      // Search for files matching this application number
      const searchUrl = `${API_BASE}/datasets/products/files/${product}?applicationNumberText=${appNum}`;
      console.log(`   🔍 Searching ${product} for app ${appNum}...`);
      
      const searchRes = await fetch(searchUrl, {
        headers: { 'X-API-KEY': apiKey, 'accept': 'application/json' },
      });
      
      if (!searchRes.ok) {
        // Try alternative search approach: query by patent number
        if (patentNumber && product === 'PTGRXML-SPLT') {
          const altUrl = `${API_BASE}/datasets/products/files/${product}?patentNumber=${patentNumber.replace(/\D/g, '')}`;
          const altRes = await fetch(altUrl, {
            headers: { 'X-API-KEY': apiKey, 'accept': 'application/json' },
          });
          if (!altRes.ok) continue;
          const altData = await altRes.json();
          const files = altData?.files || altData?.results || [];
          if (files.length === 0) continue;
          
          // Try to download the first matching XML file
          const xmlFile = files[0];
          const xmlUrl = xmlFile.url || xmlFile.fileUrl || `${API_BASE}/datasets/products/files/${product}/${xmlFile.path || xmlFile.filePath}`;
          const xmlResult = await tryFetchXml(xmlUrl, apiKey);
          if (xmlResult) {
            console.log(`   ✅ Found XML via ${product} (patent number search)`);
            return {
              ...xmlResult,
              product: product === 'PTGRXML-SPLT' ? 'PTGRXML' : 'APPXML',
            };
          }
        }
        continue;
      }
      
      const searchData = await searchRes.json();
      const files = searchData?.files || searchData?.results || searchData?.productFiles || [];
      
      if (files.length > 0) {
        // Found XML files — try to download
        for (const xmlFile of files.slice(0, 3)) {
          const xmlUrl = xmlFile.url || xmlFile.fileUrl 
            || `${API_BASE}/datasets/products/files/${product}/${xmlFile.path || xmlFile.filePath || xmlFile.fileName}`;
          
          const xmlResult = await tryFetchXml(xmlUrl, apiKey);
          if (xmlResult) {
            console.log(`   ✅ Found XML via ${product}`);
            return {
              ...xmlResult,
              product: product === 'PTGRXML-SPLT' ? 'PTGRXML' : 'APPXML',
            };
          }
        }
      }
    } catch (err) {
      console.warn(`   ⚠️ Error searching ${product}:`, err);
    }
  }

  // Fallback: try constructing URLs directly based on known patterns
  // Pattern: /files/{product}/{year}/{bundle}/{appNum}_{pubNum}.xml
  return await tryDirectXmlLookup(appNum, patentNumber, publicationNumber, apiKey);
}

/**
 * Try to fetch XML from a given URL
 */
async function tryFetchXml(url: string, apiKey: string): Promise<{ xmlContent: string; xmlUrl: string; abstract: string } | null> {
  try {
    const res = await fetch(url, {
      headers: { 'X-API-KEY': apiKey, 'accept': 'application/xml' },
    });
    
    if (!res.ok) return null;
    
    const xml = await res.text();
    if (!xml || xml.length < 100 || !xml.includes('<')) return null;
    
    console.log(`   📝 XML length: ${xml.length} characters`);
    const abstract = extractAbstractFromXml(xml);
    if (abstract) {
      console.log(`   ✅ Extracted abstract (${abstract.length} chars): ${abstract.substring(0, 100)}...`);
    }
    
    return { xmlContent: xml, xmlUrl: url, abstract };
  } catch {
    return null;
  }
}

/**
 * Try direct URL construction based on known USPTO bulk data patterns
 */
async function tryDirectXmlLookup(
  appNum: string,
  patentNumber?: string,
  publicationNumber?: string,
  apiKey?: string,
): Promise<PatentXmlResult | null> {
  if (!apiKey) return null;

  // Try getting the full patent application details first to find document references
  try {
    const detailRes = await fetch(`${API_BASE}/patent/applications/${appNum}`, {
      headers: { 'X-API-KEY': apiKey, 'accept': 'application/json' },
    });
    
    if (detailRes.ok) {
      const detail = await detailRes.json();
      
      // Look for XML document references in the response
      const docs = detail?.documentBag || detail?.documents || [];
      for (const doc of docs) {
        if (doc.documentCategory === 'PTGRXML' || doc.documentCategory === 'APPXML' ||
            (doc.url && doc.url.includes('.xml'))) {
          const xmlUrl = doc.url || doc.documentUrl;
          if (xmlUrl) {
            const xmlResult = await tryFetchXml(xmlUrl, apiKey);
            if (xmlResult) {
              const product = xmlUrl.includes('PTGRXML') ? 'PTGRXML' : 'APPXML';
              console.log(`   ✅ Found XML via application detail: ${product}`);
              return { ...xmlResult, product };
            }
          }
        }
      }
      
      // Try to extract filing date for constructing direct URLs
      const filingDate = detail?.applicationMetaData?.filingDate 
        || detail?.filingDate;
      const grantDate = detail?.applicationMetaData?.grantDate 
        || detail?.grantDate;
      const pn = patentNumber || detail?.applicationMetaData?.patentNumber;
      const pubNum = publicationNumber || detail?.applicationMetaData?.publicationNumber;
      
      // Try constructing direct grant XML URL
      if (pn && grantDate) {
        const year = grantDate.substring(0, 4);
        const dateStr = grantDate.replace(/-/g, '').substring(2, 8); // YYMMDD
        const bundle = `ipg${dateStr}`;
        const filename = `${appNum}_${pn.replace(/\D/g, '')}`;
        const directUrl = `${API_BASE}/datasets/products/files/PTGRXML-SPLT/${year}/${bundle}/${filename}.xml`;
        
        console.log(`   🔗 Trying direct grant XML: ${directUrl}`);
        const xmlResult = await tryFetchXml(directUrl, apiKey);
        if (xmlResult) return { ...xmlResult, product: 'PTGRXML' };
      }
      
      // Try constructing direct application XML URL
      if (pubNum && filingDate) {
        const year = filingDate.substring(0, 4);
        const dateStr = filingDate.replace(/-/g, '').substring(2, 8);
        const bundle = `ipa${dateStr}`;
        const filename = `${appNum}_${pubNum.replace(/\D/g, '')}`;
        const directUrl = `${API_BASE}/datasets/products/files/APPXML-SPLT/${year}/${bundle}/${filename}.xml`;
        
        console.log(`   🔗 Trying direct app XML: ${directUrl}`);
        const xmlResult = await tryFetchXml(directUrl, apiKey);
        if (xmlResult) return { ...xmlResult, product: 'APPXML' };
      }
    }
  } catch (err) {
    console.warn(`   ⚠️ Detail lookup failed:`, err);
  }

  return null;
}

/**
 * Extract abstract text from patent XML
 * Handles both grant XML and application XML formats
 */
export function extractAbstractFromXml(xml: string): string {
  // Try common XML patterns for abstract
  const patterns = [
    /<abstract[^>]*>([\s\S]*?)<\/abstract>/i,
    /<us-abstract[^>]*>([\s\S]*?)<\/us-abstract>/i,
    /<subdoc-abstract[^>]*>([\s\S]*?)<\/subdoc-abstract>/i,
  ];
  
  for (const pattern of patterns) {
    const match = xml.match(pattern);
    if (match) {
      // Strip XML tags from content
      const text = match[1]
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (text.length > 10) return text;
    }
  }
  
  return '';
}

/**
 * Extract claims from patent XML
 */
export function extractClaimsFromXml(xml: string): { number: number; type: string; text: string }[] {
  const claims: { number: number; type: string; text: string }[] = [];
  
  // Match individual claim elements
  const claimPattern = /<claim[^>]*id="CLM-(\d+)"[^>]*>([\s\S]*?)<\/claim>/gi;
  let match;
  let claimNum = 0;
  
  while ((match = claimPattern.exec(xml)) !== null) {
    claimNum++;
    const claimText = match[2]
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    
    // Determine if dependent (references another claim)
    const isDependent = /claim \d+/i.test(claimText) || /<claim-ref[^>]*>/i.test(match[2]);
    
    claims.push({
      number: parseInt(match[1]) || claimNum,
      type: isDependent ? 'dependent' : 'independent',
      text: claimText,
    });
  }
  
  // Fallback: try <claims> block
  if (claims.length === 0) {
    const claimsBlock = xml.match(/<claims[^>]*>([\s\S]*?)<\/claims>/i);
    if (claimsBlock) {
      const singleClaims = claimsBlock[1].split(/<claim[^>]*>/i).filter(s => s.trim());
      singleClaims.forEach((c, i) => {
        const text = c.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        if (text.length > 10) {
          claims.push({
            number: i + 1,
            type: /claim \d+/i.test(text) ? 'dependent' : 'independent',
            text,
          });
        }
      });
    }
  }
  
  return claims;
}

/**
 * Extract description/specification from patent XML
 */
export function extractDescriptionFromXml(xml: string): string {
  const patterns = [
    /<description[^>]*>([\s\S]*?)<\/description>/i,
    /<us-description[^>]*>([\s\S]*?)<\/us-description>/i,
    /<subdoc-description[^>]*>([\s\S]*?)<\/subdoc-description>/i,
    /<specification[^>]*>([\s\S]*?)<\/specification>/i,
  ];
  
  for (const pattern of patterns) {
    const match = xml.match(pattern);
    if (match) {
      return match[1]
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }
  }
  
  return '';
}

/**
 * Extract key metadata from patent XML into structured format
 */
export function parsePatentXml(xml: string): {
  title: string;
  abstract: string;
  claims: { number: number; type: string; text: string }[];
  description: string;
  inventors: string[];
  assignee: string;
  filingDate: string;
  applicationNumber: string;
  patentNumber: string;
} {
  const getText = (pattern: RegExp): string => {
    const match = xml.match(pattern);
    return match ? match[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : '';
  };
  
  // Title
  const title = getText(/<invention-title[^>]*>([\s\S]*?)<\/invention-title>/i)
    || getText(/<title-of-invention[^>]*>([\s\S]*?)<\/title-of-invention>/i);
  
  // Inventors
  const inventors: string[] = [];
  const inventorPattern = /<(?:inventor|given-name)[^>]*>([\s\S]*?)<\/(?:inventor|given-name)>/gi;
  // Better approach: find inventor name pairs
  const lastNames = xml.match(/<family-name[^>]*>([\s\S]*?)<\/family-name>/gi) || [];
  const firstNames = xml.match(/<given-name[^>]*>([\s\S]*?)<\/given-name>/gi) || [];
  for (let i = 0; i < Math.max(lastNames.length, firstNames.length); i++) {
    const first = firstNames[i]?.replace(/<[^>]+>/g, '').trim() || '';
    const last = lastNames[i]?.replace(/<[^>]+>/g, '').trim() || '';
    if (first || last) inventors.push(`${first} ${last}`.trim());
  }
  
  // Assignee
  const assignee = getText(/<assignee[^>]*>[\s\S]*?<orgname[^>]*>([\s\S]*?)<\/orgname>/i)
    || getText(/<us-applicant[^>]*>[\s\S]*?<orgname[^>]*>([\s\S]*?)<\/orgname>/i);
  
  // Filing date
  const filingDate = getText(/<filing-date[^>]*>([\s\S]*?)<\/filing-date>/i);
  
  // Application number
  const applicationNumber = getText(/<doc-number[^>]*>([\s\S]*?)<\/doc-number>/i);
  
  // Patent number (grant number)
  const patentNumber = getText(/<us-patent-grant[^>]*[^>]*doc-number="(\d+)"/i)
    || getText(/<publication-reference[^>]*>[\s\S]*?<doc-number[^>]*>([\s\S]*?)<\/doc-number>/i);
  
  return {
    title,
    abstract: extractAbstractFromXml(xml),
    claims: extractClaimsFromXml(xml),
    description: extractDescriptionFromXml(xml),
    inventors: inventors.slice(0, 20), // cap at 20
    assignee,
    filingDate,
    applicationNumber,
    patentNumber,
  };
}

/**
 * Get full patent details by application number
 */
export async function getPatentDetails(
  applicationNumber: string
): Promise<any | null> {
  const apiKey = process.env.USPTO_API_KEY;
  if (!apiKey) return null;

  try {
    const response = await fetch(
      `${API_BASE}/patent/applications/${applicationNumber}`,
      {
        headers: { 'X-API-KEY': apiKey, 'accept': 'application/json' },
      }
    );
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.error('Error fetching patent details:', error);
    return null;
  }
}
