import { NextResponse } from 'next/server';

export async function GET() {
  const startTime = Date.now();
  const requestId = Math.random().toString(36).substring(7);

  return NextResponse.json({ 
    status: 'info',
    requestId,
    message: 'Information log entry',
    details: {
      environment: process.env.NODE_ENV,
      apiVersion: '1.0.0'
    },
    timestamp: new Date().toISOString(),
    duration: Date.now() - startTime 
  });
}