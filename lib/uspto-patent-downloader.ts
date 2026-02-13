/**
 * USPTO Patent Auto-Discovery System
 * 
 * Automatically discovers, downloads, and processes all patents for a company:
 * 1. Search USPTO by company name
 * 2. Get document list for each patent
 * 3. Download patent PDFs
 * 4. Extract with Textract
 * 5. Analyze with Claude
 * 6. Store in database
 */

import { searchUSPTOPatents, USPTOPatent } from './uspto-search';
import { extractPdfWithPages } from './textract-extractor';
import { supabase } from './supabase';

interface PatentDocument {
  documentIdentifier: string;
  documentCode: string;
  documentCodeDescriptionText: string;
  downloadOptionBag: Array<{
    mimeTypeIdentifier: string;
    downloadUrl: string;
    pageTotalQuantity: number;
  }>;
}

interface DocumentsResponse {
  documentBag: PatentDocument[];
}

/**
 * Get associated documents (XML files with full text, abstract, claims)
 */
async function getAssociatedDocuments(
  applicationNumber: string
): Promise<any | null> {
  const apiKey = process.env.USPTO_API_KEY;
  
  if (!apiKey) {
    return null;
  }

  try {
    const response = await fetch(
      `https://api.uspto.gov/api/v1/patent/applications/${applicationNumber}/associated-documents`,
      {
        headers: {
          'X-API-KEY': apiKey,
          'accept': 'application/json',
        },
      }
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data.patentFileWrapperDataBag?.[0] || null;
  } catch (error) {
    return null;
  }
}

/**
 * Get documents for a specific patent application
 */
async function getPatentDocuments(
  applicationNumber: string
): Promise<DocumentsResponse | null> {
  const apiKey = process.env.USPTO_API_KEY;
  
  if (!apiKey) {
    console.error('⚠️  USPTO_API_KEY not found');
    return null;
  }

  try {
    console.log(`   📄 Fetching documents for ${applicationNumber}...`);
    
    const response = await fetch(
      `https://api.uspto.gov/api/v1/patent/applications/${applicationNumber}/documents`,
      {
        headers: {
          'X-API-KEY': apiKey,
          'accept': 'application/json',
        },
      }
    );

    if (!response.ok) {
      console.error(`   ❌ Failed to fetch documents: ${response.status}`);
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error(`   ❌ Error fetching documents:`, error);
    return null;
  }
}

/**
 * Download patent PDF from USPTO
 */
async function downloadPatentPDF(downloadUrl: string): Promise<Buffer | null> {
  try {
    console.log(`   ⬇️  Downloading patent PDF...`);
    
    const response = await fetch(downloadUrl);
    
    if (!response.ok) {
      console.error(`   ❌ Failed to download PDF: ${response.status}`);
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (error) {
    console.error(`   ❌ Error downloading PDF:`, error);
    return null;
  }
}

/**
 * Process a single patent: download, extract, analyze, store
 */
async function processPatent(
  patent: USPTOPatent,
  companyId: string,
  userId: string
): Promise<boolean> {
  try {
    console.log(`\n📋 Processing patent: ${patent.applicationNumberText}`);
    console.log(`   Title: ${patent.patentTitle || 'Unknown'}`);

    // Fetch associated documents to get full text XML
    const associatedDoc = await getAssociatedDocuments(patent.applicationNumberText);
    
    let fullAbstract = patent.abstract;
    let xmlUrl = null;
    let xmlContent = null; // Store the full XML
    
    if (associatedDoc) {
      // Prefer grant document, fallback to PGPUB
      const xmlMetadata = associatedDoc.grantDocumentMetaData || associatedDoc.pgpubDocumentMetaData;
      
      if (xmlMetadata?.fileLocationURI) {
        xmlUrl = xmlMetadata.fileLocationURI;
        console.log(`   📄 Found XML: ${xmlMetadata.productIdentifier}`);
        console.log(`   🔗 XML URL: ${xmlUrl}`);
        
        // Fetch the XML to get full abstract
        try {
          const apiKey = process.env.USPTO_API_KEY;
          console.log(`   🔑 Using API key: ${apiKey ? 'YES' : 'NO'}`);
          
          const xmlResponse = await fetch(xmlUrl, {
            headers: apiKey ? {
              'X-API-KEY': apiKey,
              'accept': 'application/xml',
            } : {},
          });
          
          console.log(`   📡 XML Response status: ${xmlResponse.status}`);
          
          if (xmlResponse.ok) {
            const xmlText = await xmlResponse.text();
            console.log(`   📝 XML length: ${xmlText.length} characters`);
            
            // Store the full XML for later use
            xmlContent = xmlText;
            
            // Extract abstract from XML (simple regex - could be improved)
            const abstractMatch = xmlText.match(/<abstract[^>]*>([\s\S]*?)<\/abstract>/i);
            if (abstractMatch) {
              // Remove XML tags and clean up
              fullAbstract = abstractMatch[1]
                .replace(/<[^>]+>/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
              console.log(`   ✅ Extracted abstract (${fullAbstract.length} chars): ${fullAbstract.substring(0, 100)}...`);
            } else {
              console.log(`   ⚠️  No <abstract> tag found in XML`);
            }
          } else {
            const errorText = await xmlResponse.text();
            console.log(`   ❌ XML fetch failed: ${xmlResponse.status} - ${errorText.substring(0, 200)}`);
          }
        } catch (xmlError) {
          console.log(`   ❌ XML fetch error:`, xmlError);
        }
      } else {
        console.log(`   ⚠️  No XML URL available`);
      }
    } else {
      console.log(`   ⚠️  No associated documents found`);
    }

    // Store patent with full abstract
    const { data: savedPatent, error: patentError } = await supabase
      .from('patents')
      .insert({
        user_id: userId,
        company_id: companyId,
        patent_number: patent.patentNumber || patent.applicationNumberText,
        application_number: patent.applicationNumberText,
        title: patent.patentTitle,
        filing_date: patent.filingDate,
        grant_date: patent.grantDate,
        inventors: patent.inventors?.join(', '),
        assignee: patent.applicants?.[0] || null,
        abstract: fullAbstract,
        pdf_url: xmlUrl,
        xml_content: xmlContent,
        status: xmlUrl ? 'xml_available' : 'metadata_only',
      })
      .select()
      .single();

    if (patentError) {
      console.error(`   ❌ Error saving patent:`, patentError);
      return false;
    }

    console.log(`   ✅ Patent saved: ${savedPatent.id}`);
    return true;
  } catch (error) {
    console.error(`   ❌ Error processing patent:`, error);
    return false;
  }
}

/**
 * Store patent metadata when we can't get the full PDF
 */
async function storePatentMetadata(
  patent: USPTOPatent,
  companyId: string,
  userId: string
): Promise<void> {
  await supabase.from('patents').insert({
    user_id: userId,
    company_id: companyId,
    patent_number: patent.patentNumber || patent.applicationNumberText,
    application_number: patent.applicationNumberText,
    title: patent.patentTitle,
    filing_date: patent.filingDate,
    grant_date: patent.grantDate,
    inventors: patent.inventors?.join(', '),
    assignee: patent.applicants?.[0] || null,
    abstract: patent.abstract,
    status: 'metadata_only',
  });
}

/**
 * Auto-discover and process ALL patents for a company
 */
export async function discoverCompanyPatents(
  companyName: string,
  aliases: string[],
  companyId: string,
  userId: string
): Promise<{
  total: number;
  processed: number;
  failed: number;
}> {
  console.log(`🔍 Starting patent discovery for: ${companyName}`);
  
  // Search for patents by company name and aliases
  const searchNames = [companyName, ...aliases];
  const allPatents = await searchUSPTOPatents(searchNames);

  console.log(`   Found ${allPatents.length} total patents`);

  let processed = 0;
  let failed = 0;

  // Process each patent
  for (const patent of allPatents) {
    const success = await processPatent(patent, companyId, userId);
    
    if (success) {
      processed++;
    } else {
      failed++;
    }
  }

  console.log(`\n✅ Patent discovery complete!`);
  console.log(`   Total: ${allPatents.length}`);
  console.log(`   Processed: ${processed}`);
  console.log(`   Failed: ${failed}`);

  return {
    total: allPatents.length,
    processed,
    failed,
  };
}
