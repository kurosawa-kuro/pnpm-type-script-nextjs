import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// ミドルウェア関数の定義
export async function middleware(request: NextRequest) {
    // /api/logging へのリクエストはスキップ
    if (request.nextUrl.pathname === '/api/logging') {
        return NextResponse.next()
    }

    const logData = {
        method: request.method,
        path: request.nextUrl.pathname,
        ip: request.headers.get('x-forwarded-for') || '127.0.0.1',
        timestamp: new Date().toISOString()
    }

    try {
        const protocol = request.headers.get('x-forwarded-proto') || 'http'
        const host = request.headers.get('host')
        const url = `${protocol}://${host}/api/logging`

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(logData),
            cache: 'no-store'
        })

        if (!response.ok) {
            console.error('Logging failed:', await response.text())
        }
    } catch (error) {
        console.error('Logging failed:', error)
    }

    return NextResponse.next()
}

// ミドルウェアを適用するパスを設定
export const config = {
  matcher: [
    // APIルートを含むすべてのパスにマッチ
    '/:path*'
  ],
}