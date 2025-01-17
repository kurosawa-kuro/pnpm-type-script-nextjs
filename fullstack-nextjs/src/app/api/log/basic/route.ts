import { NextResponse } from 'next/server';

export async function GET() {
  const startTime = Date.now();
  const requestId = Math.random().toString(36).substring(7);

  return NextResponse.json({ 
    status: 'success',
    requestId,
    message: 'Basic log endpoint called',
    timestamp: new Date().toISOString(),
    duration: Date.now() - startTime 
  });
}