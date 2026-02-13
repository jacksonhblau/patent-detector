/**
 * Patent XML Viewer API
 * 
 * Fetches patent XML for display in the viewer.
 * Sources:
 * 1. patents.xml_content (user's own patents, already stored)
 * 2. competitor_documents.extracted_text (competitor patents with XML)
 * 3. Live fetch from USPTO if not cached
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { fetchPatentXml, parsePatentXml } from '@/lib/uspto-search';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const patentId = searchParams.get('patentId');       // UUID from patents table
    const docId = searchParams.get('docId');             // UUID from competitor_documents
    const appNumber = searchParams.get('appNumber');      // Application number for live fetch
    const patentNumber = searchParams.get('patentNumber');

    let xmlContent: string | null = null;
    let source = '';
    let patentTitle = '';

    // Source 1: User's patent from patents table
    if (patentId) {
      const { data: patent, error } = await supabase
        .from('patents')
        .select('patent_number, title, xml_content, application_number')
        .eq('id', patentId)
        .single();

      if (error) {
        return NextResponse.json({ error: 'Patent not found' }, { status: 404 });
      }

      patentTitle = patent.title || patent.patent_number;

      if (patent.xml_content) {
        xmlContent = patent.xml_content;
        source = 'database';
      } else if (patent.application_number || patent.patent_number) {
        // Try live fetch
        const result = await fetchPatentXml(
          patent.application_number || '',
          patent.patent_number,
        );
        if (result) {
          xmlContent = result.xmlContent;
          source = `live_${result.product}`;
          
          // Cache it for next time
          await supabase.from('patents')
            .update({ xml_content: xmlContent, status: 'xml_available' })
            .eq('id', patentId);
        }
      }
    }

    // Source 2: Competitor patent from competitor_documents
    if (docId) {
      const { data: doc, error } = await supabase
        .from('competitor_documents')
        .select('document_name, extracted_text, source_url, status')
        .eq('id', docId)
        .single();

      if (error) {
        return NextResponse.json({ error: 'Document not found' }, { status: 404 });
      }

      patentTitle = doc.document_name;

      // Check if the extracted_text looks like XML
      if (doc.extracted_text && doc.extracted_text.includes('<?xml')) {
        xmlContent = doc.extracted_text;
        source = 'database';
      } else if (doc.source_url) {
        // Extract app number from URL for live fetch
        const urlMatch = doc.source_url.match(/(\d{8,})/);
        const appNum = urlMatch ? urlMatch[1] : '';
        
        if (appNum) {
          const result = await fetchPatentXml(appNum);
          if (result) {
            xmlContent = result.xmlContent;
            source = `live_${result.product}`;
          }
        }
      }
    }

    // Source 3: Direct lookup by application/patent number
    if (!xmlContent && (appNumber || patentNumber)) {
      const result = await fetchPatentXml(
        appNumber || '',
        patentNumber || undefined,
      );
      if (result) {
        xmlContent = result.xmlContent;
        source = `live_${result.product}`;
        patentTitle = patentNumber ? `US${patentNumber}` : `Application ${appNumber}`;
      }
    }

    if (!xmlContent) {
      return NextResponse.json({
        success: false,
        error: 'No XML available for this patent. The patent may only have metadata.',
        patentTitle,
      }, { status: 404 });
    }

    // Parse XML into structured data for the viewer
    const parsed = parsePatentXml(xmlContent);

    return NextResponse.json({
      success: true,
      source,
      patentTitle: patentTitle || parsed.title,
      parsed: {
        title: parsed.title,
        abstract: parsed.abstract,
        claims: parsed.claims,
        description: parsed.description.substring(0, 50000), // Cap at 50k chars
        inventors: parsed.inventors,
        assignee: parsed.assignee,
        filingDate: parsed.filingDate,
        applicationNumber: parsed.applicationNumber,
        patentNumber: parsed.patentNumber,
      },
      rawXml: xmlContent,
      xmlLength: xmlContent.length,
    });

  } catch (error) {
    console.error('Patent XML API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch patent XML' },
      { status: 500 }
    );
  }
}
