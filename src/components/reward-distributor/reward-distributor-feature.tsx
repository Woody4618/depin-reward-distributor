'use client'

import { useWallet } from '@solana/wallet-adapter-react'
import { WalletButton } from '../solana/solana-provider'
import { RewardDistributorUi } from './reward-distributor-ui'

export default function RewardDistributorFeature() {
  const { publicKey } = useWallet()

  return publicKey ? (
    <RewardDistributorUi />
  ) : (
    <div className="max-w-4xl mx-auto">
      <div className="hero py-[64px]">
        <div className="hero-content text-center">
          <WalletButton />
        </div>
      </div>
    </div>
  )
}
