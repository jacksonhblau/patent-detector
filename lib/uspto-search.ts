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
 * Deep-extract a field value from an object, trying multiple paths
 */
function deepGet(obj: any, ...paths: string[]): string {
  for (const path of paths) {
    const parts = path.split('.');
    let val = obj;
    for (const part of parts) {
      if (val == null) break;
      val = val[part];
    }
    if (val != null && typeof val === 'string' && val.trim()) return val.trim();
    if (val != null && typeof val === 'number') return String(val);
  }
  return '';
}

/**
 * Extract all keys from an object up to 3 levels deep (for debugging)
 */
function getDeepKeys(obj: any, prefix = '', depth = 0): string[] {
  if (depth > 3 || obj == null || typeof obj !== 'object') return [];
  const keys: string[] = [];
  for (const key of Object.keys(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    keys.push(fullKey);
    if (!Array.isArray(obj[key]) && typeof obj[key] === 'object') {
      keys.push(...getDeepKeys(obj[key], fullKey, depth + 1));
    }
  }
  return keys;
}

/**
 * Try to extract patent info from a single API result object,
 * handling multiple USPTO response formats (old and new)
 */
function extractPatentFromResult(result: any): USPTOPatent | null {
  // Try to find applicationNumberText in many possible locations
  const appNum = deepGet(result,
    'applicationNumberText',
    'applicationMetaData.applicationNumberText',
    'patentApplicationNumber',
    'applicationNumber',
    'applicationMetaData.applicationNumber',
    'applicationMetaData.patentApplicationNumber',
    'appNum',
    'applicationDataBag.applicationNumberText',
    'applicationDataBag.applicationNumber',
    'patentFileWrapperIdentifier',
    'applicationIdentifier',
  );

  if (!appNum) return null;

  const metadata = result.applicationMetaData || result.applicationDataBag || result;

  return {
    applicationNumberText: appNum,
    patentNumber: deepGet(result,
      'patentNumber',
      'applicationMetaData.patentNumber',
      'patentGrantIdentifier',
      'applicationDataBag.patentNumber',
      'grantDocumentIdentifier',
    ) || undefined,
    patentTitle: deepGet(result,
      'inventionTitle',
      'applicationMetaData.inventionTitle',
      'patentTitle',
      'applicationMetaData.patentTitle',
      'applicationDataBag.inventionTitle',
      'titleOfInvention',
    ) || undefined,
    filingDate: deepGet(result,
      'filingDate',
      'applicationMetaData.filingDate',
      'applicationDataBag.filingDate',
      'applicationFilingDate',
    ) || undefined,
    grantDate: deepGet(result,
      'grantDate',
      'applicationMetaData.grantDate',
      'applicationDataBag.grantDate',
      'patentGrantDate',
    ) || undefined,
    applicants: metadata.applicantBag?.map((a: any) =>
      a.applicantNameText || a.name || a.organizationName || ''
    ).filter(Boolean) || [],
    inventors: metadata.inventorBag?.map((i: any) =>
      i.inventorNameText || i.name || ''
    ).filter(Boolean) || [],
    abstract: deepGet(result,
      'abstract',
      'applicationMetaData.inventionAbstract',
      'inventionAbstract',
      'applicationDataBag.abstract',
    ) || undefined,
  };
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
  const seenAppNums = new Set<string>();

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
      
      // Try all known response array locations
      const results = data.results || data.patentFileWrapperDataBag || data.patents || data.data || [];
      const total = data.count || data.totalCount || '?';
      
      // Log the first result's full structure for debugging
      if (results.length > 0) {
        const firstKeys = getDeepKeys(results[0]);
        console.log(`   📊 Response has ${results.length} items (total: ${total})`);
        console.log(`   📊 First result all keys: ${firstKeys.join(', ')}`);
        
        // Try to extract from first result as a test
        const testExtract = extractPatentFromResult(results[0]);
        if (!testExtract) {
          console.log(`   ⚠️ Could not extract applicationNumberText from first result`);
          console.log(`   📋 First result (full): ${JSON.stringify(results[0]).substring(0, 1500)}`);
        } else {
          console.log(`   ✅ Test extract OK: ${testExtract.applicationNumberText} — ${testExtract.patentTitle || 'no title'}`);
        }
      } else {
        console.log(`   Found 0 results for ${companyName}`);
      }

      let extracted = 0;
      for (const result of results) {
        const patent = extractPatentFromResult(result);
        if (patent && !seenAppNums.has(patent.applicationNumberText)) {
          seenAppNums.add(patent.applicationNumberText);
          allPatents.push(patent);
          extracted++;
        }
      }
      console.log(`   ✅ Extracted ${extracted} patents from ${results.length} results for ${companyName}`);

    } catch (error) {
      console.error(`❌ Error searching USPTO for ${companyName}:`, error);
    }
  }

  console.log(`   Found ${allPatents.length} total patents`);
  return allPatents;
}

/**
 * Fetch full patent XML from USPTO Bulk Data API
 */
export async function fetchPatentXml(
  applicationNumber: string,
  patentNumber?: string,
  publicationNumber?: string,
): Promise<PatentXmlResult | null> {
  const apiKey = getApiKey();
  if (!apiKey) return null;

  const appNum = applicationNumber.replace(/\D/g, '');
  
  const products = ['PTGRXML-SPLT', 'APPXML-SPLT'] as const;
  
  for (const product of products) {
    try {
      const searchUrl = `${API_BASE}/datasets/products/files/${product}?applicationNumberText=${appNum}`;
      console.log(`   🔍 Searching ${product} for app ${appNum}...`);
      
      const searchRes = await fetch(searchUrl, {
        headers: { 'X-API-KEY': apiKey, 'accept': 'application/json' },
      });
      
      if (!searchRes.ok) {
        if (patentNumber && product === 'PTGRXML-SPLT') {
          const altUrl = `${API_BASE}/datasets/products/files/${product}?patentNumber=${patentNumber.replace(/\D/g, '')}`;
          const altRes = await fetch(altUrl, {
            headers: { 'X-API-KEY': apiKey, 'accept': 'application/json' },
          });
          if (!altRes.ok) continue;
          const altData = await altRes.json();
          const files = altData?.files || altData?.results || [];
          if (files.length === 0) continue;
          
          const xmlFile = files[0];
          const xmlUrl = xmlFile.url || xmlFile.fileUrl || `${API_BASE}/datasets/products/files/${product}/${xmlFile.path || xmlFile.filePath}`;
          const xmlResult = await tryFetchXml(xmlUrl, apiKey);
          if (xmlResult) {
            return { ...xmlResult, product: product === 'PTGRXML-SPLT' ? 'PTGRXML' : 'APPXML' };
          }
        }
        continue;
      }
      
      const searchData = await searchRes.json();
      const files = searchData?.files || searchData?.results || searchData?.productFiles || [];
      
      if (files.length > 0) {
        for (const xmlFile of files.slice(0, 3)) {
          const xmlUrl = xmlFile.url || xmlFile.fileUrl 
            || `${API_BASE}/datasets/products/files/${product}/${xmlFile.path || xmlFile.filePath || xmlFile.fileName}`;
          
          const xmlResult = await tryFetchXml(xmlUrl, apiKey);
          if (xmlResult) {
            return { ...xmlResult, product: product === 'PTGRXML-SPLT' ? 'PTGRXML' : 'APPXML' };
          }
        }
      }
    } catch (err) {
      console.warn(`   ⚠️ Error searching ${product}:`, err);
    }
  }

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
    
    console.log(`   📄 Found XML: ${url.includes('PTGRXML') ? 'PTGRXML' : 'APPXML'}`);
    console.log(`   🔗 XML URL: ${url}`);
    console.log(`   🔑 Using API key: YES`);
    console.log(`   📡 XML Response status: ${res.status}`);
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
 * Try direct URL patterns for XML lookup
 */
async function tryDirectXmlLookup(
  appNum: string,
  patentNumber?: string,
  publicationNumber?: string,
  apiKey?: string,
): Promise<PatentXmlResult | null> {
  if (!apiKey) return null;

  try {
    const detailRes = await fetch(`${API_BASE}/patent/applications/${appNum}`, {
      headers: { 'X-API-KEY': apiKey, 'accept': 'application/json' },
    });
    
    if (detailRes.ok) {
      const detail = await detailRes.json();
      
      for (const product of ['PTGRXML-SPLT', 'APPXML-SPLT'] as const) {
        const searchUrl = `${API_BASE}/datasets/products/files/${product}?applicationNumberText=${appNum}`;
        try {
          const searchRes = await fetch(searchUrl, {
            headers: { 'X-API-KEY': apiKey, 'accept': 'application/json' },
          });
          if (searchRes.ok) {
            const searchData = await searchRes.json();
            const files = searchData?.files || searchData?.results || [];
            for (const f of files.slice(0, 3)) {
              const xmlUrl = f.url || f.fileUrl || `${API_BASE}/datasets/products/files/${product}/${f.path || f.filePath || f.fileName}`;
              const xmlResult = await tryFetchXml(xmlUrl, apiKey);
              if (xmlResult) {
                return { ...xmlResult, product: product === 'PTGRXML-SPLT' ? 'PTGRXML' : 'APPXML' };
              }
            }
          }
        } catch { /* continue */ }
      }
      
      const filingDate = detail?.applicationMetaData?.filingDate || detail?.filingDate;
      const grantDate = detail?.applicationMetaData?.grantDate || detail?.grantDate;
      const pn = patentNumber || detail?.applicationMetaData?.patentNumber;
      const pubNum = publicationNumber || detail?.applicationMetaData?.publicationNumber;
      
      if (pn && grantDate) {
        const year = grantDate.substring(0, 4);
        const dateStr = grantDate.replace(/-/g, '').substring(2, 8);
        const bundle = `ipg${dateStr}`;
        const filename = `${appNum}_${pn.replace(/\D/g, '')}`;
        const directUrl = `${API_BASE}/datasets/products/files/PTGRXML-SPLT/${year}/${bundle}/${filename}.xml`;
        
        console.log(`   🔗 Trying direct grant XML: ${directUrl}`);
        const xmlResult = await tryFetchXml(directUrl, apiKey);
        if (xmlResult) return { ...xmlResult, product: 'PTGRXML' };
      }
      
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
 */
export function extractAbstractFromXml(xml: string): string {
  const patterns = [
    /<abstract[^>]*>([\s\S]*?)<\/abstract>/i,
    /<us-abstract[^>]*>([\s\S]*?)<\/us-abstract>/i,
    /<subdoc-abstract[^>]*>([\s\S]*?)<\/subdoc-abstract>/i,
  ];
  
  for (const pattern of patterns) {
    const match = xml.match(pattern);
    if (match) {
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
  
  const claimPattern = /<claim[^>]*id="CLM-(\d+)"[^>]*>([\s\S]*?)<\/claim>/gi;
  let match;
  let claimNum = 0;
  
  while ((match = claimPattern.exec(xml)) !== null) {
    claimNum++;
    const claimText = match[2]
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    
    const isDependent = /claim \d+/i.test(claimText) || /<claim-ref[^>]*>/i.test(match[2]);
    
    claims.push({
      number: parseInt(match[1]) || claimNum,
      type: isDependent ? 'dependent' : 'independent',
      text: claimText,
    });
  }
  
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
  
  const title = getText(/<invention-title[^>]*>([\s\S]*?)<\/invention-title>/i)
    || getText(/<title-of-invention[^>]*>([\s\S]*?)<\/title-of-invention>/i);
  
  const inventors: string[] = [];
  const lastNames = xml.match(/<family-name[^>]*>([\s\S]*?)<\/family-name>/gi) || [];
  const firstNames = xml.match(/<given-name[^>]*>([\s\S]*?)<\/given-name>/gi) || [];
  for (let i = 0; i < Math.max(lastNames.length, firstNames.length); i++) {
    const first = firstNames[i]?.replace(/<[^>]+>/g, '').trim() || '';
    const last = lastNames[i]?.replace(/<[^>]+>/g, '').trim() || '';
    if (first || last) inventors.push(`${first} ${last}`.trim());
  }
  
  const assignee = getText(/<assignee[^>]*>[\s\S]*?<orgname[^>]*>([\s\S]*?)<\/orgname>/i)
    || getText(/<us-applicant[^>]*>[\s\S]*?<orgname[^>]*>([\s\S]*?)<\/orgname>/i);
  
  const filingDate = getText(/<filing-date[^>]*>([\s\S]*?)<\/filing-date>/i);
  const applicationNumber = getText(/<doc-number[^>]*>([\s\S]*?)<\/doc-number>/i);
  const patentNumber = getText(/<us-patent-grant[^>]*[^>]*doc-number="(\d+)"/i)
    || getText(/<publication-reference[^>]*>[\s\S]*?<doc-number[^>]*>([\s\S]*?)<\/doc-number>/i);
  
  return {
    title,
    abstract: extractAbstractFromXml(xml),
    claims: extractClaimsFromXml(xml),
    description: extractDescriptionFromXml(xml),
    inventors: inventors.slice(0, 20),
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
