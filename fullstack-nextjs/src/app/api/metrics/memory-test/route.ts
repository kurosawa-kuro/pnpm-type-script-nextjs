import { NextResponse } from 'next/server';

// メモリ使用量テスト用の配列
let memoryLeakArray: any[] = [];

export async function GET() {
  const startTime = Date.now();
  const metrics: any = {
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