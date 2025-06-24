import { AnchorProvider, setProvider, Wallet } from '@coral-xyz/anchor'
import { Keypair, Connection, PublicKey } from '@solana/web3.js'
import { createMint, getOrCreateAssociatedTokenAccount, mintTo } from '@solana/spl-token'
import { getRewardDistributorProgram } from '../anchor/src/reward-distributor-exports'
import * as fs from 'fs'
import * as path from 'path'

async function main() {
  // --- Load the payer keypair from the standard Solana CLI location ---
  const payerKeypairPath = path.join(process.env.HOME || '', '.config', 'solana', 'id.json')
  const payerSecret = JSON.parse(fs.readFileSync(payerKeypairPath, 'utf-8'))
  const payer = Keypair.fromSecretKey(new Uint8Array(payerSecret))

  // --- Create the connection and provider manually ---
  const connection = new Connection('http://localhost:8899', 'confirmed')
  const provider = new AnchorProvider(connection, new Wallet(payer), { commitment: 'confirmed' })
  setProvider(provider)

  // --- Load the program ---
  const program = getRewardDistributorProgram(provider)
  console.log('Program ID:', program.programId.toBase58())

  // --- Generate or load a fixed keypair for the mint ---
  const MINT_KEYPAIR_PATH = path.join(process.cwd(), 'usdK7BPzzm9PvoUKrTYdshcv7u5AiVaWcfRv3pFyPAE.json')
  let mintKeypair: Keypair

  if (fs.existsSync(MINT_KEYPAIR_PATH)) {
    const secretKey = JSON.parse(fs.readFileSync(MINT_KEYPAIR_PATH, 'utf-8'))
    mintKeypair = Keypair.fromSecretKey(new Uint8Array(secretKey))
    console.log('Loaded existing mint keypair.')
  } else {
    mintKeypair = Keypair.generate()
    fs.writeFileSync(MINT_KEYPAIR_PATH, JSON.stringify(Array.from(mintKeypair.secretKey)))
    console.log('Generated and saved new mint keypair.')
  }
  console.log('Mint Public Key:', mintKeypair.publicKey.toBase58())

  // --- Create the Mint ---
  try {
    await createMint(
      connection,
      payer, // Payer of the transaction
      payer.publicKey, // Mint authority
      null, // Freeze authority
      6, // Decimals
      mintKeypair, // The mint keypair
    )
    console.log('Mint created successfully.')
  } catch (err) {
    if (err instanceof Error && err.message.includes('already in use')) {
      console.log('Mint already exists. Skipping creation.')
    } else {
      throw err
    }
  }

  // --- Get the Treasury PDA ---
  const [treasuryAuthorityPDA] = PublicKey.findProgramAddressSync([Buffer.from('treasury')], program.programId)
  console.log('Treasury PDA:', treasuryAuthorityPDA.toBase58())

  // --- Create and fund the Treasury Token Account ---
  try {
    const treasuryTokenAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      payer,
      mintKeypair.publicKey,
      treasuryAuthorityPDA,
      true, // Allow owner to be off-curve (PDA)
    )
    console.log('Treasury Token Account:', treasuryTokenAccount.address.toBase58())

    await mintTo(
      connection,
      payer,
      mintKeypair.publicKey,
      treasuryTokenAccount.address,
      payer,
      1_000 * 10 ** 6, // 1,000 USDC
    )
    console.log('Minted 1,000 USDC to the treasury.')
  } catch (err) {
    console.error('Failed to create or fund treasury:', err)
  }

  console.log('\nSetup complete! You can now run the web app.')
  console.log('Make sure to update the USDC_MINT_PUBKEY in the frontend to:', mintKeypair.publicKey.toBase58())
}

main().then(
  () => process.exit(),
  (err) => {
    console.error(err)
    process.exit(1)
  },
)
