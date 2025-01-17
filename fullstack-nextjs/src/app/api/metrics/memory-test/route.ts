import { NextResponse } from 'next/server';

type MemoryData = string[];
const memoryLeakArray: MemoryData[] = [];

type Metrics = {
  startTime: number;
  memoryUsage: NodeJS.MemoryUsage;
  memoryUsageAfter?: NodeJS.MemoryUsage;
  asyncDuration: number;
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
    memoryUsage: process.memoryUsage(),
    asyncDuration: 0,
  };

  try {
    // メモリテスト
    const memoryData = new Array(1000000).fill('test');
    memoryLeakArray.push(memoryData);
    metrics.memoryUsageAfter = process.memoryUsage();

    // 非同期処理テスト
    const asyncStartTime = Date.now();
    await new Promise(resolve => setTimeout(resolve, 1000));
    metrics.asyncDuration = Date.now() - asyncStartTime;

    // エラーログテスト（10%の確率でエラー発生）
    if (Math.random() < 0.1) {
      throw new Error('Intentional error for testing');
    }

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