/**
 * Universal Delete API
 * 
 * Handles deletion of: patents, competitors, competitor documents (products & patents)
 * All cascade deletes are handled by Supabase foreign key constraints.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

const VALID_TYPES = ['patent', 'competitor', 'competitor_document'] as const;
type DeleteType = typeof VALID_TYPES[number];

const TABLE_MAP: Record<DeleteType, string> = {
  patent: 'patents',
  competitor: 'competitors',
  competitor_document: 'competitor_documents',
};

const LABEL_MAP: Record<DeleteType, string> = {
  patent: 'Patent',
  competitor: 'Competitor',
  competitor_document: 'Competitor document',
};

export async function DELETE(request: NextRequest) {
  try {
    const { type, id } = await request.json();

    if (!type || !id) {
      return NextResponse.json({ error: 'Missing type or id' }, { status: 400 });
    }

    if (!VALID_TYPES.includes(type)) {
      return NextResponse.json({ error: `Invalid type: ${type}. Valid: ${VALID_TYPES.join(', ')}` }, { status: 400 });
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      return NextResponse.json({ error: 'Invalid id format' }, { status: 400 });
    }

    const table = TABLE_MAP[type as DeleteType];
    const label = LABEL_MAP[type as DeleteType];

    const { error } = await supabase
      .from(table)
      .delete()
      .eq('id', id);

    if (error) {
      console.error(`❌ Failed to delete ${label}:`, error.message);
      return NextResponse.json({ error: `Failed to delete ${label}: ${error.message}` }, { status: 500 });
    }

    console.log(`🗑️ Deleted ${label}: ${id}`);
    return NextResponse.json({ success: true, deleted: { type, id } });

  } catch (error) {
    console.error('❌ Delete API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Delete failed' },
      { status: 500 }
    );
  }
}
