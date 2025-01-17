import { NextResponse } from 'next/server';

export async function GET() {
  const startTime = Date.now();
  const requestId = Math.random().toString(36).substring(7);

  try {
    // 意図的にエラーを発生させる
    throw new Error('Intentionally thrown error for testing');

    // 以下のコードは実行されない
    return NextResponse.json({ 
      status: 'error',
      requestId,
      message: 'Test error log generated',
      errorCode: 'TEST_ERROR_001',
      severity: 'low',
      timestamp: new Date().toISOString(),
      duration: Date.now() - startTime 
    });

  } catch (error: any) {
    return NextResponse.json({
      status: 'error',
      requestId,
      message: error.message,
      errorCode: 'TEST_ERROR_500',
      severity: 'high',
      stack: error.stack,
      timestamp: new Date().toISOString(),
      duration: Date.now() - startTime 
    }, { status: 500 });
  }
}