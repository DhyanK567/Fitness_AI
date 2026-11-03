import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({ status: 'ok', uptime: process.uptime() }, { status: 200 });
}

export async function HEAD() {
  return new Response(null, { status: 200 });
}
