import { NextResponse } from 'next/server';
import { USDMClient } from 'binance';

export async function GET() {
  try {
    const isTestnet = process.env.BINANCE_TESTNET === 'true';

    const apiKey = isTestnet
      ? process.env.BINANCE_TESTNET_API_KEY
      : undefined;
    const secret = isTestnet
      ? process.env.BINANCE_TESTNET_SECRET
      : undefined;

    if (isTestnet && (!apiKey || !secret)) {
      return NextResponse.json({ success: false, error: 'BINANCE_TESTNET_API_KEY or BINANCE_TESTNET_SECRET not set in env' });
    }
    if (!isTestnet) {
      return NextResponse.json({ success: false, error: 'Set BINANCE_TESTNET=true to use this test endpoint' });
    }

    const client = new USDMClient({
      api_key: apiKey!,
      api_secret: secret!,
      baseUrl: 'https://testnet.binancefuture.com',
    });

    const balance = await client.getBalance();
    return NextResponse.json({ success: true, testnet: true, balance });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message, code: e.code });
  }
}
