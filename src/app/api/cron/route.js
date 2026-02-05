import { NextResponse } from 'next/server';
import { syncActiveStore } from '@/lib/syncStore';

export async function GET() {
  try {
    const result = await syncActiveStore();

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (err) {
    console.error('❌ Sync active_store failed:', err);

    return NextResponse.json(
      { success: false, error: 'Sync failed' },
      { status: 500 }
    );
  }
}
