import { NextResponse } from 'next/server';

type Metrics = {
  startTime: number;
  cpuDuration: number;
};

type ApiResponse = {
  status: string;
  metrics: Metrics;
  totalDuration: number;
  error?: string;
};

export async function GET() {
  const startTime = Date.now();
  const metrics: Metrics = {
    startTime,
    cpuDuration: 0,
  };

  try {
    // CPUテスト
    const cpuStartTime = Date.now();
    // CPU負荷をかけるためのループ
    /* eslint-disable @typescript-eslint/no-unused-vars */
    let dummy = 0;
    while (Date.now() - cpuStartTime < 2000) {
      dummy += Math.random() * Math.random(); // 結果を変数に代入
    }
    /* eslint-enable @typescript-eslint/no-unused-vars */
    metrics.cpuDuration = Date.now() - cpuStartTime;

    return NextResponse.json({
      status: 'success',
      metrics,
      totalDuration: Date.now() - startTime
    } as ApiResponse);

  } catch (error) {
    if (error instanceof Error) {
      return NextResponse.json({
        status: 'error',
        error: error.message,
        metrics,
        totalDuration: Date.now() - startTime
      } as ApiResponse, { status: 500 });
    }
    return NextResponse.json({
      status: 'error',
      error: 'Unknown error occurred',
      metrics,
      totalDuration: Date.now() - startTime
    } as ApiResponse, { status: 500 });
  }
}