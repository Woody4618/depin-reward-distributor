'use client'

import { useMemo, useState, useEffect } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { AppHero } from '../app-hero'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Keypair, PublicKey } from '@solana/web3.js'
import nacl from 'tweetnacl'
import bs58 from 'bs58'
import { toast } from 'sonner'
import { useRewardDistributorProgram, useRewardDistributorProgramAccount } from './reward-distributor-data-access'
import { ExplorerLink } from '../cluster/cluster-ui'
import { ellipsify } from '@/lib/utils'

// Helper function to call the ping API
async function sendPing({ deviceKeypair, data }: { deviceKeypair: Keypair; data: any }) {
  const message = Buffer.from(JSON.stringify(data))
  const signature = nacl.sign.detached(message, deviceKeypair.secretKey)

  const response = await fetch('/api/ping', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      devicePublicKey: deviceKeypair.publicKey.toBase58(),
      signature: bs58.encode(signature),
      data,
    }),
  })

  if (!response.ok) {
    const errorData = await response.json()
    throw new Error(errorData.error || 'Ping failed')
  }

  return response.json()
}

export function RewardDistributorUi() {
  const [deviceKeypair, setDeviceKeypair] = useState<Keypair | null>(null)
  const { accounts, initializeRewardAccount } = useRewardDistributorProgram()
  const [lastPingedDevice, setLastPingedDevice] = useState<string | null>(null)

  const pingMutation = useMutation({
    mutationKey: ['ping-api'],
    mutationFn: (data: any) => {
      if (!deviceKeypair) {
        throw new Error('Device keypair not set')
      }
      return sendPing({ deviceKeypair, data })
    },
    onSuccess: (data) => {
      toast.success(data.message || 'Ping successful!')
      if (deviceKeypair) setLastPingedDevice(deviceKeypair.publicKey.toBase58())
    },
    onError: (err: Error) => {
      toast.error(err.message || 'An error occurred')
    },
  })

  const generateKeypair = () => {
    const newKeypair = Keypair.generate()
    setDeviceKeypair(newKeypair)
    toast.success('New device keypair generated!')
  }

  const initializeAccount = () => {
    const newAccountKeypair = Keypair.generate()
    if (!deviceKeypair) {
      toast.error('Please generate a device keypair first.')
      return
    }
    initializeRewardAccount.mutate({ keypair: newAccountKeypair, devicePubkey: deviceKeypair.publicKey })
  }

  return (
    <div>
      <AppHero
        title="DePIN Rewards Dashboard"
        subtitle="Simulate a device, earn rewards by pinging, and claim them on-chain."
      />
      <div className="space-y-6 max-w-4xl mx-auto">
        {/* Device Simulation & Account Creation */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="p-4 border rounded-md space-y-4">
            <h2 className="text-lg font-bold">1. Device Controls</h2>
            <p className="text-sm text-gray-500">Generate a keypair to simulate a new IoT device.</p>
            <Button onClick={generateKeypair}>Generate New Device</Button>
            {deviceKeypair && (
              <div className="space-y-2">
                <p className="font-semibold">Device Public Key: </p>
                <Input readOnly value={deviceKeypair.publicKey.toBase58()} />
              </div>
            )}
          </div>
          <div className="p-4 border rounded-md space-y-4">
            <h2 className="text-lg font-bold">2. Create Reward Account</h2>
            <p className="text-sm text-gray-500">
              Create the on-chain account to track rewards for the generated device.
            </p>
            <Button onClick={initializeAccount} disabled={!deviceKeypair || initializeRewardAccount.isPending}>
              {initializeRewardAccount.isPending ? 'Creating...' : 'Create Account'}
            </Button>
          </div>
        </div>

        {/* Ping Oracle */}
        <div className="p-4 border rounded-md space-y-4 text-center">
          <h2 className="text-lg font-bold">3. Earn Rewards</h2>
          <p className="text-sm text-gray-500">
            This will send a signed payload from your device to the oracle to earn rewards.
          </p>
          <Button
            onClick={() => pingMutation.mutate({ temperature: 25.5, humidity: 45.2 })}
            disabled={!deviceKeypair || pingMutation.isPending}
            variant="secondary"
          >
            {pingMutation.isPending ? 'Pinging...' : 'Ping Oracle to Earn'}
          </Button>
        </div>

        {/* Reward Accounts List */}
        <div>
          <h2 className="text-2xl font-bold text-center my-4">On-Chain Reward Accounts</h2>
          {accounts.isLoading && <div className="text-center">Loading accounts...</div>}
          {accounts.data?.length === 0 && (
            <div className="text-center text-gray-500">No reward accounts found. Create one above!</div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {accounts.data?.map((account) => (
              <RewardAccountCard
                key={account.publicKey.toBase58()}
                account={account.publicKey}
                pingedDevicePubkey={lastPingedDevice}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function RewardAccountCard({ account, pingedDevicePubkey }: { account: PublicKey; pingedDevicePubkey?: string }) {
  const { accountQuery, claimRewardsMutation } = useRewardDistributorProgramAccount({ account })
  const [oracleLifetimeRewards, setOracleLifetimeRewards] = useState<null | number>(null)
  const [oracleLoading, setOracleLoading] = useState(false)
  const [oracleError, setOracleError] = useState<string | null>(null)
  const [refreshCountdown, setRefreshCountdown] = useState(10)

  // Refetch function for parent to call after a ping
  const refetchOracle = async (devicePubkey: string) => {
    setOracleLoading(true)
    setOracleError(null)
    try {
      const res = await fetch('/api/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ devicePublicKey: devicePubkey }),
      })
      if (!res.ok) {
        const err = await res.json()
        setOracleError(err.error || 'Failed to fetch oracle rewards')
        setOracleLifetimeRewards(null)
      } else {
        const data = await res.json()
        setOracleLifetimeRewards(Number(data.lifetimeRewards))
      }
    } catch (e) {
      setOracleError('Failed to fetch oracle rewards')
      setOracleLifetimeRewards(null)
    } finally {
      setOracleLoading(false)
    }
  }

  useEffect(() => {
    let interval: NodeJS.Timeout
    let countdownInterval: NodeJS.Timeout
    if (accountQuery.data) {
      const devicePubkey = accountQuery.data.devicePubkey.toBase58()
      refetchOracle(devicePubkey)
      setRefreshCountdown(10)
      // Poll every 10 seconds
      interval = setInterval(() => {
        refetchOracle(devicePubkey)
        setRefreshCountdown(10)
      }, 10000)
      // Countdown timer
      countdownInterval = setInterval(() => {
        setRefreshCountdown((prev) => (prev > 0 ? prev - 1 : 0))
      }, 1000)
    }
    return () => {
      if (interval) clearInterval(interval)
      if (countdownInterval) clearInterval(countdownInterval)
    }
  }, [accountQuery.data])

  // Refetch immediately if this device was just pinged
  useEffect(() => {
    if (pingedDevicePubkey && accountQuery.data && pingedDevicePubkey === accountQuery.data.devicePubkey.toBase58()) {
      refetchOracle(pingedDevicePubkey)
      setRefreshCountdown(10)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pingedDevicePubkey])

  let claimable = null
  if (oracleLifetimeRewards !== null && accountQuery.data) {
    claimable = Math.max(0, oracleLifetimeRewards - Number(accountQuery.data.totalClaimed))
  }

  return (
    <div className="p-4 border rounded-md space-y-3">
      <h3 className="text-lg font-semibold">
        <ExplorerLink path={`account/${account}`} label={ellipsify(account.toBase58())} />
      </h3>
      {accountQuery.isLoading && <div>Loading account data...</div>}
      {accountQuery.data && (
        <div className="space-y-2">
          <div>
            <span className="font-semibold">Device: </span>
            <ExplorerLink
              path={`account/${accountQuery.data.devicePubkey}`}
              label={ellipsify(accountQuery.data.devicePubkey.toBase58())}
            />
          </div>
          <div>
            <span className="font-semibold">Total Claimed: </span>
            <span>{accountQuery.data.totalClaimed.toString()}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-semibold">Claimable: </span>
            {oracleLoading ? (
              <span>Loading...</span>
            ) : oracleError ? (
              <span className="text-red-500">{oracleError}</span>
            ) : (
              <span>{claimable !== null ? claimable : 'N/A'}</span>
            )}
            <span className="ml-2 text-xs text-gray-400">Refreshing in {refreshCountdown}s</span>
          </div>
          <div>
            <span className="font-semibold">Lifetime Rewards (oracle): </span>
            {oracleLoading ? (
              <span>Loading...</span>
            ) : oracleError ? (
              <span className="text-red-500">{oracleError}</span>
            ) : (
              <span>{oracleLifetimeRewards !== null ? oracleLifetimeRewards : 'N/A'}</span>
            )}
          </div>
          <Button onClick={() => claimRewardsMutation.mutate()} disabled={claimRewardsMutation.isPending}>
            {claimRewardsMutation.isPending ? 'Claiming...' : 'Claim Rewards'}
          </Button>
        </div>
      )}
    </div>
  )
}
