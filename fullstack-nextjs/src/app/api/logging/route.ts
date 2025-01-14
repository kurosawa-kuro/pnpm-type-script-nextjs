import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

const LOG_DIR = '/home/ec2-user/app/tmp/pnmp_java_script_express/logs'
const LOG_FILE = 'combined.log'

export async function POST(request: Request) {
    try {
        if (!fs.existsSync(LOG_DIR)) {
            fs.mkdirSync(LOG_DIR, { recursive: true })
        }

        console.log("request", request)
        let logData
        try {
            logData = await request.json()
            console.log("logData", logData)
        } catch (e) {
            logData = { error: 'Invalid JSON data', timestamp: new Date().toISOString() }
        }

        const logPath = path.join(LOG_DIR, LOG_FILE)
        const logEntry = `${new Date().toISOString()} - ${JSON.stringify(logData)}\n`

        fs.appendFileSync(logPath, logEntry)

        return NextResponse.json({ message: 'Log written successfully' })
    } catch (error) {
        console.error('Error writing log:', error)
        return NextResponse.json(
            { message: 'Failed to write log' },
            { status: 500 }
        )
    }
}