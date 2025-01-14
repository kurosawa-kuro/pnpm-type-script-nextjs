import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

const CONFIG = {
  LOG_DIR: '/home/ec2-user/app/tmp/pnmp_java_script_express/logs',
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

const ensureLogDirectory = (): void => {
  if (!fs.existsSync(CONFIG.LOG_DIR)) {
    fs.mkdirSync(CONFIG.LOG_DIR, { recursive: true })
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
    const logData: LogData = await request.json()
    
    ensureLogDirectory()
    const logEntry = createLogEntry(logData)
    writeLogToFile(logEntry)

    return NextResponse.json({ message: 'Log written successfully' })
  } catch (error) {
    console.error('Error writing log:', error)
    return NextResponse.json(
      { message: 'Failed to write log' },
      { status: 500 }
    )
  }
}