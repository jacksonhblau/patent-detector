/**
 * PDF Text Extraction using AWS Textract
 * 
 * This extracts text from PDF files with page-level tracking using AWS Textract.
 * Much more reliable than client-side PDF parsing libraries.
 */

import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { 
  TextractClient, 
  StartDocumentTextDetectionCommand,
  GetDocumentTextDetectionCommand,
  Block 
} from '@aws-sdk/client-textract';

export interface PageContent {
  pageNumber: number;
  text: string;
  rawText: string;
}

export interface PdfExtractionResult {
  pages: PageContent[];
  totalPages: number;
  fullText: string;
}

// Initialize AWS clients
const s3Client = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const textractClient = new TextractClient({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

/**
 * Extract text from PDF using AWS Textract (Async API)
 */
export async function extractPdfWithPages(
  file: File | Buffer
): Promise<PdfExtractionResult> {
  const s3Key = `temp-${Date.now()}-${Math.random().toString(36).substring(7)}.pdf`;
  
  try {
    console.log('📤 Uploading PDF to S3...');
    
    // Convert File to Buffer if needed
    const buffer = file instanceof File 
      ? Buffer.from(await file.arrayBuffer())
      : file;

    // Upload to S3
    await s3Client.send(new PutObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET!,
      Key: s3Key,
      Body: buffer,
      ContentType: 'application/pdf',
    }));

    console.log('🔍 Starting Textract analysis (async)...');

    // Start async Textract job
    const startCommand = new StartDocumentTextDetectionCommand({
      DocumentLocation: {
        S3Object: {
          Bucket: process.env.AWS_S3_BUCKET!,
          Name: s3Key,
        },
      },
    });

    const startResponse = await textractClient.send(startCommand);
    const jobId = startResponse.JobId;

    if (!jobId) {
      throw new Error('Failed to start Textract job - no JobId returned');
    }

    console.log(`⏳ Textract job started: ${jobId}`);
    console.log('   Waiting for completion...');

    // Poll for completion
    let jobComplete = false;
    let attempts = 0;
    const maxAttempts = 60; // 5 minutes max (5 second intervals)
    
    while (!jobComplete && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
      attempts++;

      const getCommand = new GetDocumentTextDetectionCommand({ JobId: jobId });
      const getResponse = await textractClient.send(getCommand);

      console.log(`   Status: ${getResponse.JobStatus} (attempt ${attempts}/${maxAttempts})`);

      if (getResponse.JobStatus === 'SUCCEEDED') {
        jobComplete = true;
        
        // Process results
        const blocks = getResponse.Blocks || [];
        const pageMap = new Map<number, string[]>();
        let totalPages = 0;

        // Collect all blocks (may need pagination)
        let allBlocks = [...blocks];
        let nextToken = getResponse.NextToken;

        while (nextToken) {
          console.log('   Fetching next page of results...');
          const nextCommand = new GetDocumentTextDetectionCommand({ 
            JobId: jobId,
            NextToken: nextToken 
          });
          const nextResponse = await textractClient.send(nextCommand);
          allBlocks = [...allBlocks, ...(nextResponse.Blocks || [])];
          nextToken = nextResponse.NextToken;
        }

        // Group LINE blocks by page
        for (const block of allBlocks) {
          if (block.BlockType === 'LINE' && block.Page && block.Text) {
            const pageNum = block.Page;
            totalPages = Math.max(totalPages, pageNum);
            
            if (!pageMap.has(pageNum)) {
              pageMap.set(pageNum, []);
            }
            pageMap.get(pageNum)!.push(block.Text);
          }
        }

        // Build pages array
        const pages: PageContent[] = [];
        for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
          const lines = pageMap.get(pageNum) || [];
          const rawText = lines.join('\n');
          const text = rawText.replace(/\s+/g, ' ').trim();
          
          pages.push({
            pageNumber: pageNum,
            text,
            rawText,
          });
        }

        // Combine all pages
        const fullText = pages.map(p => p.text).join('\n\n');

        console.log(`✅ Extracted ${totalPages} pages successfully`);

        return {
          pages,
          totalPages,
          fullText,
        };

      } else if (getResponse.JobStatus === 'FAILED') {
        throw new Error(`Textract job failed: ${getResponse.StatusMessage || 'Unknown error'}`);
      }
      // Otherwise still IN_PROGRESS, continue polling
    }

    if (!jobComplete) {
      throw new Error('Textract job timed out after 5 minutes');
    }

    throw new Error('Unexpected error in Textract processing');

  } catch (error) {
    console.error('❌ Textract extraction error:', error);
    throw new Error(
      `Failed to extract PDF with Textract: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`
    );
  } finally {
    // Clean up: Delete file from S3
    try {
      console.log('🗑️  Cleaning up S3...');
      await s3Client.send(
        new DeleteObjectCommand({
          Bucket: process.env.AWS_S3_BUCKET!,
          Key: s3Key,
        })
      );
      console.log('✅ Cleanup complete');
    } catch (cleanupError) {
      console.error('⚠️  Failed to cleanup S3:', cleanupError);
      // Don't throw - cleanup failure shouldn't fail the request
    }
  }
}

/**
 * Helper: Find which page(s) contain specific text
 */
export function findTextInPages(
  pages: PageContent[],
  searchText: string
): number[] {
  const normalizedSearch = searchText.toLowerCase().trim();
  
  return pages
    .filter(page => page.text.toLowerCase().includes(normalizedSearch))
    .map(page => page.pageNumber);
}

/**
 * Helper: Extract a snippet around found text
 */
export function extractSnippet(
  pageText: string,
  searchText: string,
  contextChars: number = 100
): string {
  const lowerText = pageText.toLowerCase();
  const lowerSearch = searchText.toLowerCase();
  const index = lowerText.indexOf(lowerSearch);
  
  if (index === -1) return '';
  
  const start = Math.max(0, index - contextChars);
  const end = Math.min(pageText.length, index + searchText.length + contextChars);
  
  let snippet = pageText.substring(start, end);
  
  if (start > 0) snippet = '...' + snippet;
  if (end < pageText.length) snippet = snippet + '...';
  
  return snippet;
}
