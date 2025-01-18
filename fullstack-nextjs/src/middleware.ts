import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  // ロギング対象外のパスはスキップ
  if (request.nextUrl.pathname === '/api/logging') {
    return NextResponse.next()
  }

  try {
    // CloudFrontヘッダーから国情報を取得
    const country = request.headers.get('CloudFront-Viewer-Country') || 'Unknown';
    const countryName = request.headers.get('CloudFront-Viewer-Country-Name') || 'Unknown';
    const region = request.headers.get('CloudFront-Viewer-Country-Region') || 'Unknown';
    const city = request.headers.get('CloudFront-Viewer-City') || 'Unknown';

    // エッジランタイムで動作する簡易ロギング
    console.log(JSON.stringify({
      level: 'info',
      message: 'API Request',
      method: request.method,
      origin: request.nextUrl.origin,
      pathname: request.nextUrl.pathname,
      headers: Object.fromEntries(request.headers),
      geoInfo: {
        country,
        countryName,
        region,
        city
      },
      timestamp: new Date().toISOString()
    }));

    // レスポンスヘッダーに国情報を追加
    const response = NextResponse.next();
    response.headers.set('X-Country-Code', country);
    response.headers.set('X-Country-Name', countryName);
    response.headers.set('X-Region', region);
    response.headers.set('X-City', city);

    return response;

  } catch (error) {
    console.error('Logging failed:', error);
    return NextResponse.next()
  }
}

// ミドルウェアを適用するパスを設定
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ]
}