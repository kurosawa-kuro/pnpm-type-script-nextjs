import { NextResponse } from 'next/server';
// import logger from '@/lib/logger';

export async function GET() {
  const startTime = Date.now();
  
  // logger.info('API test endpoint accessed');

  // CPUテスト
  // while (Date.now() - startTime < 2000) {
  //   Math.random() * Math.random();
  // }

  // logger.info('CPU test completed', {
  //   duration: Date.now() - startTime
  // });

  return NextResponse.json({ 
    status: 'success',
    duration: Date.now() - startTime 
  });
}