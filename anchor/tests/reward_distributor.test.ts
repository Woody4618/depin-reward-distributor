import * as anchor from '@coral-xyz/anchor'
import { Program } from '@coral-xyz/anchor'
import { RewardDistributor } from '../target/types/reward_distributor'
import { Keypair, LAMPORTS_PER_SOL, PublicKey, Ed25519Program } from '@solana/web3.js'
import { createMint, getOrCreateAssociatedTokenAccount, mintTo, getAccount, TOKEN_PROGRAM_ID } from '@solana/spl-token'
import nacl from 'tweetnacl'
import fs from 'fs'
import path from 'path'
import { createCreateMetadataAccountV3Instruction } from '@metaplex-foundation/mpl-token-metadata'

describe('reward-distributor', () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env()
  anchor.setProvider(provider)

  const program = anchor.workspace.RewardDistributor as Program<RewardDistributor>
  const wallet = provider.wallet as anchor.Wallet

  // Keypairs
  const deviceKeypair = Keypair.generate()
  // Load the oracle keypair from secret key file (must match oraXrapkbpe6pCVJ2sm3MRZAdyemtWXyGg4W6mGarjL)
  const ORACLE_KEYPAIR_PATH = path.join(__dirname, '../../oraXrapkbpe6pCVJ2sm3MRZAdyemtWXyGg4W6mGarjL.json')
  const oracleSecret = JSON.parse(fs.readFileSync(ORACLE_KEYPAIR_PATH, 'utf-8'))
  const oracleKeypair = Keypair.fromSecretKey(new Uint8Array(oracleSecret))
  const newAuthorityKeypair = Keypair.generate()
  const anotherAuthorityKeypair = Keypair.generate()

  // Mints and Token Accounts
  let usdgMint: PublicKey
  let userTokenAccount: PublicKey
  let treasuryTokenAccount: PublicKey

  const [treasuryAuthorityPDA] = PublicKey.findProgramAddressSync([Buffer.from('treasury')], program.programId)

  // Load the persistent mint keypair
  const MINT_KEYPAIR_PATH = path.join(__dirname, '../../usdK7BPzzm9PvoUKrTYdshcv7u5AiVaWcfRv3pFyPAE.json')
  const mintSecret = JSON.parse(fs.readFileSync(MINT_KEYPAIR_PATH, 'utf-8'))
  const usdcMintKeypair = Keypair.fromSecretKey(new Uint8Array(mintSecret))

  beforeAll(async () => {
    // Airdrop SOL to the new authorities
    await provider.connection.requestAirdrop(newAuthorityKeypair.publicKey, LAMPORTS_PER_SOL)
    await provider.connection.requestAirdrop(anotherAuthorityKeypair.publicKey, LAMPORTS_PER_SOL)

    // Create USDG Mint
    usdgMint = await createMint(
      provider.connection,
      wallet.payer,
      wallet.publicKey,
      wallet.publicKey,
      6,
      usdcMintKeypair,
    )

    // Add Metaplex metadata to the mint
    const TOKEN_METADATA_PROGRAM_ID = new anchor.web3.PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s')
    const [metadataPDA] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from('metadata'), TOKEN_METADATA_PROGRAM_ID.toBuffer(), usdgMint.toBuffer()],
      TOKEN_METADATA_PROGRAM_ID,
    )
    const metadataData = {
      name: 'USDG Example',
      symbol: 'USDGX',
      uri: 'https://arweave.net/your-metadata.json', // Replace with your actual metadata URI
      sellerFeeBasisPoints: 0,
      creators: null,
      collection: null,
      uses: null,
    }
    const createMetadataIx = createCreateMetadataAccountV3Instruction(
      {
        metadata: metadataPDA,
        mint: usdgMint,
        mintAuthority: wallet.publicKey,
        payer: wallet.publicKey,
        updateAuthority: wallet.publicKey,
      },
      {
        createMetadataAccountArgsV3: {
          data: metadataData,
          isMutable: true,
          collectionDetails: null,
        },
      },
    )
    const tx = new anchor.web3.Transaction().add(createMetadataIx)
    await provider.sendAndConfirm(tx, [])

    // Create User's Associated Token Account
    const userAta = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      wallet.payer,
      usdgMint,
      wallet.publicKey,
    )
    userTokenAccount = userAta.address

    // Create Treasury Token Account (owned by PDA)
    const treasuryAta = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      wallet.payer,
      usdgMint,
      treasuryAuthorityPDA,
      true, // Allow owner to be off-curve (i.e. a PDA)
    )
    treasuryTokenAccount = treasuryAta.address

    // Fund the treasury
    await mintTo(
      provider.connection,
      wallet.payer,
      usdgMint,
      treasuryTokenAccount,
      wallet.payer,
      1_000_000_000, // 1,000 USDC
    )
  })

  it('Is initialized!', async () => {
    const [rewardAccountPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('reward'), deviceKeypair.publicKey.toBuffer()],
      program.programId,
    )

    await program.methods
      .initializeRewardAccount(deviceKeypair.publicKey)
      .accounts({
        payer: wallet.publicKey,
        devicePubkey: deviceKeypair.publicKey,
      })
      .rpc()

    const account = await program.account.rewardAccount.fetch(rewardAccountPda)
    expect(account.devicePubkey.equals(deviceKeypair.publicKey)).toBeTruthy()
    expect(account.withdrawAuthority.equals(wallet.publicKey)).toBeTruthy()
    expect(account.totalClaimed.toNumber()).toBe(0)
  })

  it('Changes authority with device signature', async () => {
    const [rewardAccountPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('reward'), deviceKeypair.publicKey.toBuffer()],
      program.programId,
    )
    const msg = Buffer.from(`I want to claim: ${newAuthorityKeypair.publicKey.toString()}`)
    const signature = nacl.sign.detached(msg, deviceKeypair.secretKey)

    const ed25519Instruction = Ed25519Program.createInstructionWithPublicKey({
      publicKey: deviceKeypair.publicKey.toBytes(),
      message: msg,
      signature: signature,
    })

    await program.methods
      .changeAuthorityWithDeviceSig()
      .accounts({
        rewardAccount: rewardAccountPda,
        newAuthority: newAuthorityKeypair.publicKey,
      })
      .preInstructions([ed25519Instruction])
      .signers([newAuthorityKeypair])
      .rpc()

    const account = await program.account.rewardAccount.fetch(rewardAccountPda)
    expect(account.withdrawAuthority.equals(newAuthorityKeypair.publicKey)).toBeTruthy()
  })

  it('Changes authority with current authority signature', async () => {
    const [rewardAccountPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('reward'), deviceKeypair.publicKey.toBuffer()],
      program.programId,
    )
    await program.methods
      .changeAuthority(anotherAuthorityKeypair.publicKey)
      .accounts({
        rewardAccount: rewardAccountPda,
        currentAuthority: newAuthorityKeypair.publicKey,
      })
      .signers([newAuthorityKeypair])
      .rpc()

    const account = await program.account.rewardAccount.fetch(rewardAccountPda)
    expect(account.withdrawAuthority.equals(anotherAuthorityKeypair.publicKey)).toBeTruthy()
  })

  it('Claims rewards', async () => {
    const [rewardAccountPda] = PublicKey.findProgramAddressSync(
      [Buffer.from('reward'), deviceKeypair.publicKey.toBuffer()],
      program.programId,
    )
    const lifetimeRewards = new anchor.BN(100 * 10 ** 6) // 100 USDC
    const timestamp = new anchor.BN(Date.now())

    const devicePubkeyBytes = (await program.account.rewardAccount.fetch(rewardAccountPda)).devicePubkey.toBuffer()
    const lifetimeRewardsBytes = lifetimeRewards.toArrayLike(Buffer, 'le', 8)
    const timestampBytes = timestamp.toArrayLike(Buffer, 'le', 8)
    const message = Buffer.concat([devicePubkeyBytes, lifetimeRewardsBytes, timestampBytes])

    const signature = nacl.sign.detached(message, oracleKeypair.secretKey)

    const ed25519Instruction = Ed25519Program.createInstructionWithPublicKey({
      publicKey: oracleKeypair.publicKey.toBytes(),
      message: message,
      signature: signature,
    })

    const initialUserBalance = (await getAccount(provider.connection, userTokenAccount)).amount
    const initialTreasuryBalance = (await getAccount(provider.connection, treasuryTokenAccount)).amount

    await program.methods
      .claimRewards(lifetimeRewards, timestamp)
      .accounts({
        rewardAccount: rewardAccountPda,
        user: wallet.publicKey,
        oracle: oracleKeypair.publicKey,
        mint: usdgMint,
        treasuryTokenAccount: treasuryTokenAccount,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .preInstructions([ed25519Instruction])
      .rpc({
        skipPreflight: true,
      })

    const finalUserBalance = (await getAccount(provider.connection, userTokenAccount)).amount
    const finalTreasuryBalance = (await getAccount(provider.connection, treasuryTokenAccount)).amount

    expect(finalUserBalance).toBe(initialUserBalance + BigInt(lifetimeRewards.toNumber()))
    expect(finalTreasuryBalance).toBe(initialTreasuryBalance - BigInt(lifetimeRewards.toNumber()))

    const rewardAccountState = await program.account.rewardAccount.fetch(rewardAccountPda)
    expect(rewardAccountState.totalClaimed.toNumber()).toBe(lifetimeRewards.toNumber())
  })
})
