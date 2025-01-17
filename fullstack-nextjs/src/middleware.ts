import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  // ロギング対象外のパスはスキップ
  if (request.nextUrl.pathname === '/api/logging') {
    return NextResponse.next()
  }

  try {
    // エッジランタイムで動作する簡易ロギング
    console.log(JSON.stringify({
      level: 'info',
      message: 'API Request',
      method: request.method,
      origin: request.nextUrl.origin,
      pathname: request.nextUrl.pathname,
      headers: Object.fromEntries(request.headers),
      timestamp: new Date().toISOString()
    }));
  } catch (error) {
    console.error('Logging failed:', error);
  }

  return NextResponse.next()
}

// ミドルウェアを適用するパスを設定
// export const config = {
//   matcher: '/api/:path*'
// }