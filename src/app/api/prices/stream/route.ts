import { NextRequest } from 'next/server';
import { wsManager } from '@/lib/ws-manager';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const encoder = new TextEncoder();

  const customReadable = new ReadableStream({
    start(controller) {
      // Send initial state immediately so the client has all prices
      const initialPayload = JSON.stringify({
        prices: wsManager.getPrices(),
        statuses: wsManager.getStatuses(),
      });
      controller.enqueue(encoder.encode(`data: ${initialPayload}\n\n`));

      // Listen for unified JSON broadcast (emitted every 100ms if there are changes)
      const onBroadcast = (payload: string) => {
        controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
      };

      wsManager.on('broadcast', onBroadcast);

      // Keep connection alive with pings every 15 seconds
      const pingId = setInterval(() => {
        controller.enqueue(encoder.encode(':\n\n'));
      }, 15000);

      req.signal.addEventListener('abort', () => {
        clearInterval(pingId);
        wsManager.off('broadcast', onBroadcast);
        controller.close();
      });
    },
  });

  return new Response(customReadable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  });
}
