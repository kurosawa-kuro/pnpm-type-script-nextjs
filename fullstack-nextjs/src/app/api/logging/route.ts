import { NextResponse } from 'next/server'

interface LogData {
  method: string
  origin: string
  pathname: string
  headers: Record<string, string>
  timestamp: string
}

const createLogEntry = (logData: LogData): string => {
  return JSON.stringify(logData)
}

export async function POST(request: Request) {
  try {
    const contentLength = request.headers.get('content-length');
    if (!contentLength || contentLength === '0') {
      return NextResponse.json({ success: true });
    }

    const logData: LogData = await request.json()
    const logEntry = createLogEntry(logData)
    
    console.log(logEntry)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error processing log:', error)
    return NextResponse.json(
      { success: false },
      { status: 500 }
    )
  }
}