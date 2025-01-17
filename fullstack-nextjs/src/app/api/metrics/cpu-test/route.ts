import { NextResponse } from 'next/server';

export async function GET() {
  const startTime = Date.now();
  const metrics: any = {
    startTime,
    cpuDuration: 0,
  };

  try {
    // CPUテスト
    const cpuStartTime = Date.now();
    while (Date.now() - cpuStartTime < 2000) {
      Math.random() * Math.random();
    }
    metrics.cpuDuration = Date.now() - cpuStartTime;

    return NextResponse.json({
      status: 'success',
      metrics,
      totalDuration: Date.now() - startTime
    });

  } catch (error: any) {
    return NextResponse.json({
      status: 'error',
      error: error.message,
      metrics,
      totalDuration: Date.now() - startTime
    }, { status: 500 });
  }
}