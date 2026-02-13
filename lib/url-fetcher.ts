/**
 * URL Document Fetcher
 * 
 * Fetches documents from URLs and converts them to buffers for Textract processing.
 * Handles PDF downloads and webpage text extraction.
 */

/**
 * Fetch a document from a URL and return as Buffer
 * 
 * Strategy:
 * 1. If URL points to PDF directly (.pdf extension) - download it
 * 2. If URL is a webpage - we'll need to convert HTML to PDF
 * 3. For other formats - handle accordingly
 */
export async function fetchUrlAsDocument(url: string): Promise<Buffer | null> {
  try {
    console.log(`🌐 Fetching URL: ${url}`);

    // Parse URL to check file type
    const urlObj = new URL(url);
    const pathname = urlObj.pathname.toLowerCase();

    // Case 1: Direct PDF link
    if (pathname.endsWith('.pdf')) {
      console.log('📄 Detected PDF file, downloading...');
      return await downloadPdf(url);
    }

    // Case 2: HTML webpage - convert to PDF
    if (pathname.endsWith('.html') || pathname.endsWith('.htm') || !pathname.includes('.')) {
      console.log('🌐 Detected webpage, converting to PDF...');
      return await webpageToPdf(url);
    }

    // Case 3: Other document formats (.doc, .docx, etc)
    // For now, try to download as-is
    console.log('📎 Attempting to download document...');
    return await downloadDocument(url);

  } catch (error) {
    console.error('❌ Error fetching URL:', error);
    return null;
  }
}

/**
 * Download a PDF from a URL
 */
async function downloadPdf(url: string): Promise<Buffer> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; PatentDetectorBot/1.0)',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to download PDF: ${response.status} ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Download any document from a URL
 */
async function downloadDocument(url: string): Promise<Buffer> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; PatentDetectorBot/1.0)',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to download document: ${response.status} ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Extract clean text from a webpage using Jina.ai Reader
 * This is simpler and more Next.js-friendly than Puppeteer
 */
async function webpageToPdf(url: string): Promise<Buffer | null> {
  try {
    console.log('📄 Extracting webpage content with Jina.ai...');
    
    // Jina.ai Reader API - free, no signup required
    const jinaUrl = `https://r.jina.ai/${url}`;
    
    const response = await fetch(jinaUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; PatentDetectorBot/1.0)',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch webpage: ${response.status}`);
    }

    const markdown = await response.text();
    
    console.log(`✅ Extracted ${markdown.length} characters from webpage`);
    
    // For now, return null and handle text extraction separately
    // The caller will need to handle this as text instead of PDF
    return null;

  } catch (error) {
    console.error('❌ Error extracting webpage:', error);
    return null;
  }
}

/**
 * Helper: Extract text from HTML (alternative to PDF conversion)
 * This could be used to send HTML directly to Claude instead of Textract
 */
export async function fetchUrlAsText(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; PatentDetectorBot/1.0)',
      },
    });

    if (!response.ok) {
      return null;
    }

    const html = await response.text();
    
    // Basic HTML stripping (remove tags)
    const text = html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    return text;

  } catch (error) {
    console.error('Error fetching URL as text:', error);
    return null;
  }
}

/**
 * Discover product documentation URLs from a company website
 * 
 * Crawls the website and finds links to:
 * - PDFs (especially specs, datasheets, whitepapers)
 * - Product pages
 * - Documentation sections
 */
export async function discoverProductUrls(websiteUrl: string): Promise<Array<{url: string, description: string}>> {
  try {
    console.log(`🕷️  Crawling website: ${websiteUrl}`);

    const response = await fetch(websiteUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; PatentDetectorBot/1.0)',
      },
    });

    if (!response.ok) {
      console.warn(`Failed to fetch website: ${response.status}`);
      return [];
    }

    const html = await response.text();
    const baseUrl = new URL(websiteUrl);
    const discoveredUrls: Array<{url: string, description: string}> = [];

    // Find all PDF links
    const pdfRegex = /href=["']([^"']*\.pdf[^"']*)["']/gi;
    let match;
    
    while ((match = pdfRegex.exec(html)) !== null) {
      try {
        const pdfPath = match[1];
        const fullUrl = new URL(pdfPath, baseUrl).href;
        
        // Extract description from surrounding context or filename
        const filename = pdfPath.split('/').pop()?.replace('.pdf', '') || 'Document';
        const description = filename
          .replace(/[-_]/g, ' ')
          .replace(/\b\w/g, l => l.toUpperCase());
        
        // Only include if it looks like product documentation
        if (
          description.toLowerCase().includes('spec') ||
          description.toLowerCase().includes('datasheet') ||
          description.toLowerCase().includes('whitepaper') ||
          description.toLowerCase().includes('technical') ||
          description.toLowerCase().includes('manual') ||
          description.toLowerCase().includes('guide')
        ) {
          discoveredUrls.push({
            url: fullUrl,
            description,
          });
        }
      } catch (error) {
        // Skip invalid URLs
      }
    }

    // Find common product/documentation page patterns
    const linkRegex = /href=["']([^"']*)["'][^>]*>([^<]*)</gi;
    
    while ((match = linkRegex.exec(html)) !== null) {
      try {
        const linkPath = match[1];
        const linkText = match[2].trim();
        
        // Skip if already found as PDF or is external
        if (linkPath.endsWith('.pdf') || linkPath.startsWith('http')) continue;
        
        const fullUrl = new URL(linkPath, baseUrl).href;
        
        // Only include internal links from same domain
        if (new URL(fullUrl).hostname !== baseUrl.hostname) continue;
        
        // Check if link looks like product documentation
        const textLower = linkText.toLowerCase();
        const pathLower = linkPath.toLowerCase();
        
        if (
          textLower.includes('product') ||
          textLower.includes('specification') ||
          textLower.includes('technical') ||
          textLower.includes('documentation') ||
          pathLower.includes('/products/') ||
          pathLower.includes('/docs/') ||
          pathLower.includes('/specifications/')
        ) {
          discoveredUrls.push({
            url: fullUrl,
            description: linkText || 'Product Page',
          });
        }
      } catch (error) {
        // Skip invalid URLs
      }
    }

    // Remove duplicates
    const unique = discoveredUrls.filter(
      (item, index, self) => 
        index === self.findIndex(t => t.url === item.url)
    );

    console.log(`   Found ${unique.length} potential product URLs`);
    
    // Limit to top 10 to avoid overwhelming
    return unique.slice(0, 10);

  } catch (error) {
    console.error('Error discovering product URLs:', error);
    return [];
  }
}
