import { NextRequest, NextResponse } from 'next/server'
import { PublicKey } from '@solana/web3.js'
import nacl from 'tweetnacl'
import bs58 from 'bs58'
import fs from 'fs/promises'
import path from 'path'

// Define the structure of our database
interface PingData {
  temperature: number
  humidity: number
}

interface DeviceData {
  unclaimedRewards: number
  lastPingAt: string | null
  data: (PingData & { receivedAt: string })[]
}

interface Database {
  devices: {
    [publicKey: string]: DeviceData
  }
}

// Path to our flat-file database
const DB_PATH = path.join(process.cwd(), 'db.json')

// Helper to read the database
async function readDb(): Promise<Database> {
  try {
    const data = await fs.readFile(DB_PATH, 'utf-8')
    return JSON.parse(data)
  } catch {
    // If the file doesn't exist or is invalid, return a default structure
    return { devices: {} }
  }
}

// Helper to write to the database
async function writeDb(data: Database): Promise<void> {
  await fs.writeFile(DB_PATH, JSON.stringify(data, null, 2), 'utf-8')
}

export async function POST(req: NextRequest) {
  try {
    const { devicePublicKey, data, signature } = await req.json()

    if (!devicePublicKey || !data || !signature) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // 1. Verify the signature
    // The message is the JSON string of the data payload
    const message = Buffer.from(JSON.stringify(data))
    const signatureBytes = bs58.decode(signature)
    const publicKeyBytes = new PublicKey(devicePublicKey).toBuffer()

    // Validate temperature and humidity. Depending on the project this
    // could be much more serious and maybe also slash the device reward in case or malicious data
    if (
      typeof data.temperature !== 'number' ||
      typeof data.humidity !== 'number' ||
      data.temperature < -100 ||
      data.temperature > 80 ||
      data.humidity < 0 ||
      data.humidity > 100
    ) {
      return NextResponse.json(
        { error: 'Invalid sensor data: temperature must be between -100 and 80, humidity between 0 and 100.' },
        { status: 400 },
      )
    }

    const isVerified = nacl.sign.detached.verify(message, signatureBytes, publicKeyBytes)

    if (!isVerified) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    // 2. Update the database
    const db = await readDb()

    if (!db.devices[devicePublicKey]) {
      db.devices[devicePublicKey] = {
        unclaimedRewards: 0,
        lastPingAt: null,
        data: [],
      }
    }

    const device = db.devices[devicePublicKey]
    // For each valid ping, grant a small reward. This is a simple starting point.
    device.unclaimedRewards += 1
    device.lastPingAt = new Date().toISOString()
    device.data.push({ ...(data as PingData), receivedAt: new Date().toISOString() })

    await writeDb(db)

    return NextResponse.json({ success: true, message: 'Ping received and verified.' })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 })
  }
}
