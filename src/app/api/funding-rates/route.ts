import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { data, error } = await supabase
      .from('scanner_cache')
      .select('payload')
      .eq('id', 1)
      .single();

    if (error || !data?.payload) {
      // If cache is empty or fails, we can trigger the cron job to run
      // In production, the cron should populate this automatically
      console.warn('[Scanner API] Cache empty or error:', error);
      return NextResponse.json({ data: [], error: 'Scanner cache is currently empty. Please wait for the next cron cycle.' }, { status: 503 });
    }

    return NextResponse.json(data.payload, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=30',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
      }
    });
  } catch (error: any) {
    console.error('[Scanner API] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
