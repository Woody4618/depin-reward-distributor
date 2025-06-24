'use client'
import { useWallet } from '@solana/wallet-adapter-react'
import {
  useRewardDistributorProgram,
  useRewardDistributorProgramAccount,
} from '@/components/reward-distributor/reward-distributor-data-access'
import { ExplorerLink } from '@/components/cluster/cluster-ui'
import { ellipsify } from '@/lib/utils'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import AccountListFeature from '@/components/account/account-list-feature'

function DeviceCard({ account }: { account: any }) {
  const { accountQuery, claimRewardsMutation } = useRewardDistributorProgramAccount({ account: account.publicKey })
  const [oracleLifetimeRewards, setOracleLifetimeRewards] = useState<null | number>(null)
  const [oracleLoading, setOracleLoading] = useState(false)
  const [oracleError, setOracleError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchOracleRewards(devicePubkey: string) {
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
    if (accountQuery.data) {
      fetchOracleRewards(accountQuery.data.devicePubkey.toBase58())
    }
  }, [accountQuery.data])

  let claimable = null
  if (oracleLifetimeRewards !== null && accountQuery.data) {
    claimable = Math.max(0, oracleLifetimeRewards - Number(accountQuery.data.totalClaimed))
  }

  return (
    <li className="p-4 border rounded-md space-y-2">
      <div>
        <span className="font-semibold">Reward Account: </span>
        <ExplorerLink path={`account/${account.publicKey}`} label={ellipsify(account.publicKey.toBase58())} />
      </div>
      <div>
        <span className="font-semibold">Device: </span>
        <ExplorerLink
          path={`account/${account.account.devicePubkey}`}
          label={ellipsify(account.account.devicePubkey.toBase58())}
        />
      </div>
      <div>
        <span className="font-semibold">Total Claimed: </span>
        {account.account.totalClaimed.toString()}
      </div>
      <div>
        <span className="font-semibold">Claimable rewards: </span>
        {oracleLoading ? (
          <span>Loading...</span>
        ) : oracleError ? (
          <span className="text-red-500">{oracleError}</span>
        ) : (
          <span>{claimable !== null ? claimable : 'N/A'}</span>
        )}
      </div>
      <Button onClick={() => claimRewardsMutation.mutate()} disabled={claimRewardsMutation.isPending}>
        {claimRewardsMutation.isPending ? 'Claiming...' : 'Claim Rewards'}
      </Button>
    </li>
  )
}

export default function AccountPage() {
  const { publicKey } = useWallet()
  const { accounts } = useRewardDistributorProgram()

  const myDevices =
    publicKey && accounts.data
      ? accounts.data.filter((acc: any) => acc.account.withdrawAuthority.toBase58() === publicKey.toBase58())
      : []

  return (
    <div className="max-w-3xl mx-auto py-8">
      <AccountListFeature />
      <h1 className="text-2xl font-bold mb-6">My Devices</h1>
      {!publicKey && <div>Please connect your wallet to see your devices.</div>}
      {publicKey && (
        <>
          {accounts.isLoading && <div>Loading devices...</div>}
          {myDevices.length === 0 && !accounts.isLoading && (
            <div className="text-gray-500">
              No devices found for this wallet.
              <br />
              <Link href="/dashboard" className="text-blue-600 hover:underline text-sm">
                Create or Claim a New Device
              </Link>
            </div>
          )}
          <ul className="space-y-4">
            {myDevices.map((acc: any) => (
              <DeviceCard key={acc.publicKey.toBase58()} account={acc} />
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
