import { NextResponse } from 'next/server';

type ErrorResponse = {
  status: string;
  requestId: string;
  message: string;
  errorCode: string;
  severity: string;
  stack?: string;
  timestamp: string;
  duration: number;
};

export async function GET() {
  const startTime = Date.now();
  const requestId = Math.random().toString(36).substring(7);

  try {
    throw new Error('Intentionally thrown error for testing');
  } catch (error) {
    if (error instanceof Error) {
      return NextResponse.json({
        status: 'error',
        requestId,
        message: error.message,
        errorCode: 'TEST_ERROR_500',
        severity: 'high',
        stack: error.stack,
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime 
      } as ErrorResponse, { status: 500 });
    }
    return NextResponse.json({
      status: 'error',
      requestId,
      message: 'Unknown error occurred',
      errorCode: 'TEST_ERROR_500',
      severity: 'high',
      timestamp: new Date().toISOString(),
      duration: Date.now() - startTime 
    } as ErrorResponse, { status: 500 });
  }
}