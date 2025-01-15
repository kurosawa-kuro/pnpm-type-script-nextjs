import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

const CONFIG = {
  LOG_DIR: '/home/ec2-user/app/logs',
  LOG_FILE: 'combined.log',
  DATE_FORMAT: 'ISO'
} as const

interface LogData {
  method: string
  origin: string
  pathname: string
  headers: Record<string, string>
  timestamp: string
}

function ensureLogDirectory() {
  const logDir = path.join(process.cwd(), CONFIG.LOG_DIR)
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true })
  }
}

const createLogEntry = (logData: LogData): string => {
  return `${JSON.stringify(logData)}\n`
}

const writeLogToFile = (logEntry: string): void => {
  const logPath = path.join(CONFIG.LOG_DIR, CONFIG.LOG_FILE)
  fs.appendFileSync(logPath, logEntry)
}

export async function POST(request: Request) {
  try {
    // console.log('Request received:', {
    //   method: request.method,
    //   url: request.url,
    //   headers: Object.fromEntries(request.headers),
    // });

    // 空のリクエストの場合は静かにスキップ
    const contentLength = request.headers.get('content-length');
    if (!contentLength || contentLength === '0') {
      return NextResponse.json({ success: true });
    }

    const logData: LogData = await request.json()
    // console.log('Request body:', logData);
    
    ensureLogDirectory()
    const logEntry = createLogEntry(logData)
    writeLogToFile(logEntry)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error writing log:', error)
    return NextResponse.json(
      { success: false },
      { status: 500 }
    )
  }
}