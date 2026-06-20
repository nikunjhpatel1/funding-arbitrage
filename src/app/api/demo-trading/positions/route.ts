import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { PositionSync } from '@/lib/position-sync';

export async function GET(req: Request) {
  try {
    // Optionally trigger a sync before fetching if requested (e.g. ?sync=true)
    const { searchParams } = new URL(req.url);
    if (searchParams.get('sync') === 'true') {
      await PositionSync.syncDemoPositions();
    }

    const { data, error } = await supabase
      .from('demo_positions')
      .select('*')
      .order('opened_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
