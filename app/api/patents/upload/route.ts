/**
 * Patent Upload and Analysis API
 * 
 * Accepts PDF upload, extracts text with page numbers, 
 * analyzes with Claude, and saves to database with page references.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { extractPdfWithPages } from '@/lib/textract-extractor';
import { analyzePatentWithClaude } from '@/lib/patent-analyzer';

export async function POST(request: NextRequest) {
  try {
    // Get the uploaded file
    const formData = await request.formData();
    const file = formData.get('patent') as File;
    
    if (!file) {
      return NextResponse.json(
        { error: 'No file uploaded' },
        { status: 400 }
      );
    }
    
    if (file.type !== 'application/pdf') {
      return NextResponse.json(
        { error: 'File must be a PDF' },
        { status: 400 }
      );
    }
    
    console.log('📄 Processing PDF:', file.name);
    
    // Step 1: Extract text with page numbers
    console.log('🔍 Extracting text from PDF...');
    const extraction = await extractPdfWithPages(file);
    
    console.log(`✅ Extracted ${extraction.totalPages} pages`);
    
    // Step 2: Analyze with Claude
    console.log('🤖 Analyzing patent with Claude...');
    const analysis = await analyzePatentWithClaude(extraction.pages);
    
    console.log(`✅ Found ${analysis.claims.length} claims`);
    
    // Step 3: Upload PDF to Supabase Storage
    console.log('☁️  Uploading PDF to storage...');
    
    const fileName = `${analysis.patent_number}-${Date.now()}.pdf`;
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('patents')
      .upload(fileName, fileBuffer, {
        contentType: 'application/pdf',
        upsert: false
      });
    
    if (uploadError) {
      console.error('Storage upload error:', uploadError);
      throw new Error(`Failed to upload PDF: ${uploadError.message}`);
    }
    
    const fileUrl = supabase.storage.from('patents').getPublicUrl(fileName).data.publicUrl;
    
    console.log('✅ PDF uploaded to:', fileUrl);
    
    // Step 4: Save to database
    console.log('💾 Saving to database...');
    
    // TODO: Get user_id from auth when authentication is implemented
    // For now, using a placeholder
    const userId = '00000000-0000-0000-0000-000000000000';
    
    // Insert patent
    const { data: patent, error: patentError } = await supabase
      .from('patents')
      .insert({
        patent_number: analysis.patent_number,
        title: analysis.title,
        abstract: analysis.abstract,
        file_url: fileUrl,
        file_name: file.name,
        total_pages: extraction.totalPages,
        user_id: userId
      })
      .select()
      .single();
    
    if (patentError) {
      console.error('Patent insert error:', patentError);
      throw new Error(`Failed to save patent: ${patentError.message}`);
    }
    
    console.log('✅ Patent saved:', patent.id);
    
    // Insert claims with page numbers
    const claimsToInsert = analysis.claims.map(claim => ({
      patent_id: patent.id,
      claim_number: claim.claim_number,
      claim_type: claim.claim_type,
      claim_text: claim.claim_text,
      page_number: claim.page_number,
      depends_on: claim.depends_on || null,
      elements: claim.elements // JSONB column
    }));
    
    const { error: claimsError } = await supabase
      .from('claims')
      .insert(claimsToInsert);
    
    if (claimsError) {
      console.error('Claims insert error:', claimsError);
      throw new Error(`Failed to save claims: ${claimsError.message}`);
    }
    
    console.log(`✅ Saved ${claimsToInsert.length} claims`);
    
    // Return success
    return NextResponse.json({
      success: true,
      patent: {
        id: patent.id,
        patent_number: patent.patent_number,
        title: patent.title,
        total_pages: patent.total_pages,
        claims_count: claimsToInsert.length,
        file_url: fileUrl
      }
    });
    
  } catch (error) {
    console.error('❌ Upload error:', error);
    
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        details: error instanceof Error ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}

// Configure to allow large file uploads
export const config = {
  api: {
    bodyParser: false,
  },
};
