'use client'

import { getRewardDistributorProgram, getRewardDistributorProgramId } from '@project/anchor'
import { useConnection } from '@solana/wallet-adapter-react'
import { Cluster, Keypair, PublicKey } from '@solana/web3.js'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useCluster } from '../cluster/cluster-data-access'
import { useAnchorProvider } from '../solana/solana-provider'
import { useTransactionToast } from '../use-transaction-toast'
import { toast } from 'sonner'
import { Ed25519Program, SYSVAR_INSTRUCTIONS_PUBKEY } from '@solana/web3.js'
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID } from '@solana/spl-token'
import bs58 from 'bs58'
import { BN } from '@coral-xyz/anchor'

// This is the persistent USDC mint address for localnet, matching the keypair usdK7BPzzm9PvoUKrTYdshcv7u5AiVaWcfRv3pFyPAE.json
const USDC_MINT_PUBKEY = new PublicKey('usdK7BPzzm9PvoUKrTYdshcv7u5AiVaWcfRv3pFyPAE')

export function useRewardDistributorProgram() {
  const { connection } = useConnection()
  const { cluster } = useCluster()
  const transactionToast = useTransactionToast()
  const provider = useAnchorProvider()
  const programId = useMemo(() => getRewardDistributorProgramId(cluster.network as Cluster), [cluster])
  const program = useMemo(() => getRewardDistributorProgram(provider, programId), [provider, programId])

  const accounts = useQuery({
    queryKey: ['rewardDistributor', 'all', { cluster }],
    queryFn: () => program.account.rewardAccount.all(),
  })

  const getProgramAccount = useQuery({
    queryKey: ['get-program-account', { cluster }],
    queryFn: () => connection.getParsedAccountInfo(programId),
  })

  const initializeRewardAccount = useMutation({
    mutationKey: ['rewardDistributor', 'initialize', { cluster }],
    mutationFn: async ({ devicePubkey }: { devicePubkey: PublicKey }) => {
      const [rewardAccountPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('reward'), devicePubkey.toBuffer()],
        program.programId,
      )
      return program.methods
        .initializeRewardAccount(devicePubkey)
        .accounts({
          rewardAccount: rewardAccountPda,
          payer: provider.wallet.publicKey,
          devicePubkey,
          systemProgram: PublicKey.default,
        })
        .rpc()
    },
    onSuccess: async (signature) => {
      transactionToast(signature)
      await accounts.refetch()
    },
    onError: (err) => {
      toast.error('Failed to initialize account')
      console.error(err)
    },
  })

  return {
    program,
    programId,
    accounts,
    getProgramAccount,
    initializeRewardAccount,
  }
}

export function useRewardDistributorProgramAccount({ account }: { account: PublicKey }) {
  const { cluster } = useCluster()
  const transactionToast = useTransactionToast()
  const provider = useAnchorProvider()
  const { program, accounts } = useRewardDistributorProgram()

  const accountQuery = useQuery({
    queryKey: ['rewardDistributor', 'fetch', { cluster, account }],
    queryFn: () => program.account.rewardAccount.fetch(account),
  })

  const claimRewardsMutation = useMutation({
    mutationKey: ['rewardDistributor', 'claim', { cluster, account }],
    mutationFn: async () => {
      if (!accountQuery.data) {
        throw new Error('Reward account not loaded')
      }
      if (!provider.wallet) {
        throw new Error('Wallet not connected')
      }

      // 1. Get the signature from the oracle
      const response = await fetch('/api/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ devicePublicKey: accountQuery.data.devicePubkey.toBase58() }),
      })
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to get claim signature from oracle')
      }
      const { signature, oraclePublicKey, lifetimeRewards, timestamp } = await response.json()

      // 2. Prepare the transaction
      const [treasuryAuthority] = PublicKey.findProgramAddressSync([Buffer.from('treasury')], program.programId)

      const userTokenAccount = await getAssociatedTokenAddress(USDC_MINT_PUBKEY, provider.wallet.publicKey)
      const treasuryTokenAccount = await getAssociatedTokenAddress(USDC_MINT_PUBKEY, treasuryAuthority, true)

      const lifetimeRewardsBytes = new BN(lifetimeRewards).toArrayLike(Buffer, 'le', 8)
      const timestampBytes = new BN(timestamp).toArrayLike(Buffer, 'le', 8)

      const ed25519Instruction = Ed25519Program.createInstructionWithPublicKey({
        publicKey: new PublicKey(oraclePublicKey).toBytes(),
        message: Buffer.concat([accountQuery.data.devicePubkey.toBuffer(), lifetimeRewardsBytes, timestampBytes]),
        signature: bs58.decode(signature),
      })

      const tx = await program.methods
        .claimRewards(new BN(lifetimeRewards), new BN(timestamp))
        .accounts({
          rewardAccount: account,
          user: provider.wallet.publicKey,
          oracle: new PublicKey(oraclePublicKey),
          mint: USDC_MINT_PUBKEY,
          userTokenAccount,
          treasuryTokenAccount,
          treasuryAuthority,
          tokenProgram: TOKEN_PROGRAM_ID,
          instructions: SYSVAR_INSTRUCTIONS_PUBKEY,
        })
        .preInstructions([ed25519Instruction])
        .rpc()

      return tx
    },
    onSuccess: (tx) => {
      transactionToast(tx)
      accountQuery.refetch()
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to claim rewards')
    },
  })

  return {
    accountQuery,
    claimRewardsMutation,
  }
}
