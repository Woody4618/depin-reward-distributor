import { NextRequest, NextResponse } from 'next/server'
import * as web3 from '@solana/web3.js'
import nacl from 'tweetnacl'
import bs58 from 'bs58'
import fs from 'fs/promises'
import path from 'path'

// Define the structure of our database
interface PingData {
  temperature: number
  humidity: number
  receivedAt: string
}

interface DeviceData {
  unclaimedRewards: number
  lastPingAt: string | null
  data: PingData[]
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
    // 1. Get the device public key from the request body
    const { devicePublicKey } = await req.json()

    if (!devicePublicKey) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // 2. Load device data from the database
    const db = await readDb()
    const device = db.devices[devicePublicKey]

    if (!device || device.unclaimedRewards <= 0) {
      return NextResponse.json({ error: 'No rewards to claim' }, { status: 400 })
    }

    const lifetimeRewards = device.unclaimedRewards // This is the amount to be claimed
    const timestamp = Date.now() // Use current timestamp for the signature

    // 3. Load the oracle's secret key from environment variables
    const oracleSecretKey = process.env.ORACLE_SECRET_KEY
    if (!oracleSecretKey) {
      console.error('ORACLE_SECRET_KEY not set')
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }

    let secretKeyBytes: Uint8Array
    try {
      // Handle both formats: JSON array string and Base58 string
      if (oracleSecretKey.startsWith('[') && oracleSecretKey.endsWith(']')) {
        secretKeyBytes = Uint8Array.from(JSON.parse(oracleSecretKey))
      } else {
        secretKeyBytes = bs58.decode(oracleSecretKey)
      }
    } catch (e) {
      console.error('Failed to parse ORACLE_SECRET_KEY. Make sure it is a valid JSON array or a Base58 string.', e)
      return NextResponse.json({ error: 'Invalid secret key format in environment variable' }, { status: 500 })
    }

    const oracleKeypair = web3.Keypair.fromSecretKey(secretKeyBytes)

    // 4. Construct the message buffer exactly as the on-chain program expects
    const devicePubkeyBytes = new web3.PublicKey(devicePublicKey).toBuffer()
    const lifetimeRewardsBytes = Buffer.alloc(8)
    lifetimeRewardsBytes.writeBigUInt64LE(BigInt(lifetimeRewards))
    const timestampBytes = Buffer.alloc(8)
    timestampBytes.writeBigUInt64LE(BigInt(timestamp))

    const message = Buffer.concat([devicePubkeyBytes, lifetimeRewardsBytes, timestampBytes])

    // 5. Sign the message with the oracle's key
    const signature = nacl.sign.detached(message, oracleKeypair.secretKey)

    // IMPORTANT: Reset unclaimed rewards to prevent double-claiming
    device.unclaimedRewards = 0
    await writeDb(db)

    // 6. Return the signature and other necessary data
    return NextResponse.json({
      signature: bs58.encode(signature),
      oraclePublicKey: oracleKeypair.publicKey.toBase58(),
      lifetimeRewards: lifetimeRewards.toString(),
      timestamp: timestamp.toString(),
    })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 })
  }
}
