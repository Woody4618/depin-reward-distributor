import { AnchorProvider, Program } from '@coral-xyz/anchor'
import { Cluster, PublicKey } from '@solana/web3.js'
import RewardDistributorIDL from '../target/idl/reward_distributor.json'
import type { RewardDistributor } from '../target/types/reward_distributor'

export { RewardDistributorIDL }
export type { RewardDistributor }

export const REWARD_DISTRIBUTOR_PROGRAM_ID = new PublicKey(RewardDistributorIDL.address)

export function getRewardDistributorProgram(provider: AnchorProvider, address?: PublicKey) {
  return new Program(
    {
      ...RewardDistributorIDL,
      address: address ? address.toBase58() : RewardDistributorIDL.address,
    } as RewardDistributor,
    provider,
  )
}

export function getRewardDistributorProgramId(cluster: Cluster) {
  switch (cluster) {
    case 'devnet':
    case 'testnet':
    case 'mainnet-beta':
    default:
      return REWARD_DISTRIBUTOR_PROGRAM_ID
  }
}
