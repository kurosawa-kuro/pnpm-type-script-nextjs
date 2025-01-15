import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import logger from './lib/logger'

export async function middleware(request: NextRequest) {
  // ロギング対象外のパスはスキップ
  if (request.nextUrl.pathname === '/api/logging') {
    return NextResponse.next()
  }

  try {
    // Winstonを使用して標準出力にログを書き出し
    logger.info('API Request', {
      method: request.method,
      origin: request.nextUrl.origin,
      pathname: request.nextUrl.pathname,
      headers: Object.fromEntries(request.headers),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Logging failed:', { error });
  }

  return NextResponse.next()
}

// ミドルウェアを適用するパスを設定
export const config = {
  matcher: '/api/:path*'
}