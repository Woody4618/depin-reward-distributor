'use client'

import { PublicKey } from '@solana/web3.js'
import { useMemo } from 'react'
import { useParams } from 'next/navigation'
import { ExplorerLink } from '../cluster/cluster-ui'
import { AccountBalance, AccountButtons, AccountTokens, AccountTransactions } from './account-ui'
import { AppHero } from '../app-hero'
import { ellipsify } from '@/lib/utils'
import { useRewardDistributorProgram } from '../reward-distributor/reward-distributor-data-access'
import { useWallet } from '@solana/wallet-adapter-react'
import Link from 'next/link'
import { useRewardDistributorProgramAccount } from '../reward-distributor/reward-distributor-data-access'
import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { getSavedDeviceKeypairs, importDeviceKeypair, DEVICE_KEYS_STORAGE_KEY } from '@/lib/device-keypair-storage'
import nacl from 'tweetnacl'
import bs58 from 'bs58'

function DeviceCard({
  account,
}: {
  account: {
    publicKey: PublicKey
    account: { devicePubkey: PublicKey; totalClaimed: number; withdrawAuthority: PublicKey }
  }
}) {
  const { accountQuery, claimRewardsMutation } = useRewardDistributorProgramAccount({ account: account.publicKey })
  const [oracleLifetimeRewards, setOracleLifetimeRewards] = useState<null | number>(null)
  const [oracleLoading, setOracleLoading] = useState(false)
  const [oracleError, setOracleError] = useState<string | null>(null)
  const [pingLoading, setPingLoading] = useState(false)
  const [hasKeypair, setHasKeypair] = useState(false)
  const [importValue, setImportValue] = useState('')
  const [importError, setImportError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [deviceData, setDeviceData] = useState<{ temperature: number; humidity: number; receivedAt: string }[] | null>(
    null,
  )
  const [deviceDataLoading, setDeviceDataLoading] = useState(false)
  const [deviceDataError, setDeviceDataError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  // Fetch oracle rewards for this device
  const fetchOracleRewards = async (devicePubkey: string) => {
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
    } catch {
      setOracleError('Failed to fetch oracle rewards')
      setOracleLifetimeRewards(null)
    } finally {
      setOracleLoading(false)
    }
  }

  // Check for device keypair in localStorage
  useEffect(() => {
    if (typeof window === 'undefined' || !account.account.devicePubkey) return
    const saved = getSavedDeviceKeypairs()
    setHasKeypair(!!saved[account.account.devicePubkey.toBase58()])
  }, [account.account.devicePubkey])

  useEffect(() => {
    if (accountQuery.data) {
      fetchOracleRewards(accountQuery.data.devicePubkey.toBase58())
    }
  }, [accountQuery.data])

  let claimable = null
  if (oracleLifetimeRewards !== null && accountQuery.data) {
    claimable = Math.max(0, oracleLifetimeRewards - Number(accountQuery.data.totalClaimed))
  }

  // Fetch device data when expanded
  useEffect(() => {
    if (!expanded) return
    const fetchDeviceData = async () => {
      setDeviceDataLoading(true)
      setDeviceDataError(null)
      try {
        const res = await fetch(`/api/claim?devicePublicKey=${account.account.devicePubkey.toBase58()}`)
        if (!res.ok) {
          const err = await res.json()
          setDeviceDataError(err.error || 'Failed to fetch device data')
          setDeviceData(null)
        } else {
          const data = await res.json()
          setDeviceData(data.data)
        }
      } catch {
        setDeviceDataError('Failed to fetch device data')
        setDeviceData(null)
      } finally {
        setDeviceDataLoading(false)
      }
    }
    fetchDeviceData()
  }, [expanded, account.account.devicePubkey])

  // Helper to refetch device data
  const refetchDeviceData = async () => {
    setDeviceDataLoading(true)
    setDeviceDataError(null)
    try {
      const res = await fetch(`/api/claim?devicePublicKey=${account.account.devicePubkey.toBase58()}`)
      if (!res.ok) {
        const err = await res.json()
        setDeviceDataError(err.error || 'Failed to fetch device data')
        setDeviceData(null)
      } else {
        const data = await res.json()
        setDeviceData(data.data)
      }
    } catch {
      setDeviceDataError('Failed to fetch device data')
      setDeviceData(null)
    } finally {
      setDeviceDataLoading(false)
    }
  }

  // Ping Oracle handler
  const handlePingOracle = async () => {
    if (!accountQuery.data) return
    const saved = getSavedDeviceKeypairs()
    const keyJson = saved[accountQuery.data.devicePubkey.toBase58()]
    if (!keyJson) {
      setOracleError('Device keypair not found in this browser. Please import it below.')
      return
    }
    const deviceKeypair = importDeviceKeypair(keyJson)
    if (!deviceKeypair) {
      setOracleError('Failed to load device keypair.')
      return
    }
    setPingLoading(true)
    try {
      const data = { temperature: 25.5, humidity: 45.2 }
      const message = Buffer.from(JSON.stringify(data))
      const signature = nacl.sign.detached(message, deviceKeypair.secretKey)
      const signatureBase58 = bs58.encode(signature)
      const res = await fetch('/api/ping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          devicePublicKey: accountQuery.data.devicePubkey.toBase58(),
          signature: signatureBase58,
          data,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        console.log('err ping', err)
        setOracleError(err.error || 'Ping failed')
      } else {
        setOracleError(null)
        // Immediately refetch oracle rewards after a successful ping
        await fetchOracleRewards(accountQuery.data.devicePubkey.toBase58())
        // Also refetch device data if expanded
        if (expanded) {
          await refetchDeviceData()
        }
      }
    } catch {
      setOracleError('Ping failed')
    } finally {
      setPingLoading(false)
    }
  }

  const handleImport = () => {
    setImportError(null)
    const kp = importDeviceKeypair(importValue)
    if (kp && kp.publicKey.toBase58() === account.account.devicePubkey.toBase58()) {
      const saved = getSavedDeviceKeypairs()
      saved[kp.publicKey.toBase58()] = importValue
      localStorage.setItem(DEVICE_KEYS_STORAGE_KEY, JSON.stringify(saved))
      setHasKeypair(true)
      setImportValue('')
      setImportError(null)
      setOracleError(null)
    } else {
      setImportError('Invalid keypair or does not match device.')
    }
  }

  // Manual refresh handler
  const handleRefresh = async () => {
    if (!account.account.devicePubkey) return
    setRefreshing(true)
    await fetchOracleRewards(account.account.devicePubkey.toBase58())
    await accountQuery.refetch()
    setRefreshing(false)
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
        {accountQuery.data ? accountQuery.data.totalClaimed.toString() : '...'}
      </div>
      <div>
        <span className="font-semibold">Claimable Rewards: </span>
        {oracleLoading ? (
          <span>Loading...</span>
        ) : oracleError ? (
          <span className="text-red-500">{oracleError}</span>
        ) : (
          <span>{claimable !== null ? claimable : 'N/A'}</span>
        )}
        <Button
          className="ml-2 text-xs px-2 py-1 h-auto"
          variant="outline"
          onClick={handleRefresh}
          disabled={oracleLoading || refreshing || accountQuery.isLoading || accountQuery.isFetching}
        >
          {refreshing || oracleLoading || accountQuery.isLoading || accountQuery.isFetching
            ? 'Refreshing...'
            : 'Refresh'}
        </Button>
      </div>
      {!hasKeypair && (
        <div className="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 p-2 rounded mt-2">
          Device keypair not found in this browser, so its probably on the Raspberry Pi. You can import it to also call
          the ping from here. But its better if the keypair never leaves the Pi.
          <div className="mt-2 flex gap-2">
            <input
              className="border rounded px-2 py-1 text-xs"
              value={importValue}
              onChange={(e) => setImportValue(e.target.value)}
              placeholder="Paste exported keypair JSON here"
            />
            <button className="bg-blue-500 text-white px-2 py-1 rounded text-xs" onClick={handleImport}>
              Import
            </button>
          </div>
          {importError && <div className="text-red-500 text-xs mt-1">{importError}</div>}
        </div>
      )}
      <div className="flex gap-2 mt-2">
        <Button onClick={() => claimRewardsMutation.mutate()} disabled={claimRewardsMutation.isPending}>
          {claimRewardsMutation.isPending ? 'Claiming...' : 'Claim Rewards'}
        </Button>
        <Button onClick={handlePingOracle} disabled={pingLoading || !hasKeypair} variant="secondary">
          {pingLoading ? 'Pinging...' : 'Simulate Device Data sending to oracle'}
        </Button>
      </div>
      <div>
        <button className="text-blue-600 hover:underline text-sm mt-2" onClick={() => setExpanded((v) => !v)}>
          {expanded ? 'Hide Device Data' : 'Show Last 10 Device Data'}
        </button>
        {expanded && (
          <div className="mt-2">
            {deviceDataLoading ? (
              <div>Loading device data...</div>
            ) : deviceDataError ? (
              <div className="text-red-500 text-xs">{deviceDataError}</div>
            ) : deviceData && deviceData.length > 0 ? (
              <table className="w-full text-xs border mt-2">
                <thead>
                  <tr>
                    <th className="border px-2 py-1">Time</th>
                    <th className="border px-2 py-1">Temperature</th>
                    <th className="border px-2 py-1">Humidity</th>
                  </tr>
                </thead>
                <tbody>
                  {deviceData.map((d, i) => (
                    <tr key={i}>
                      <td className="border px-2 py-1">{new Date(d.receivedAt).toLocaleString()}</td>
                      <td className="border px-2 py-1">{d.temperature}</td>
                      <td className="border px-2 py-1">{d.humidity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="text-gray-500 text-xs">No data found for this device.</div>
            )}
          </div>
        )}
      </div>
    </li>
  )
}

export default function AccountDetailFeature() {
  const params = useParams()
  const address = useMemo(() => {
    if (!params.address) {
      return
    }
    try {
      return new PublicKey(params.address as string)
    } catch (e) {
      console.log(`Invalid public key`, e)
    }
  }, [params])
  const { publicKey } = useWallet()
  const { accounts } = useRewardDistributorProgram()

  let myDevices: {
    publicKey: PublicKey
    account: { devicePubkey: PublicKey; totalClaimed: number; withdrawAuthority: PublicKey }
  }[] = []
  if (address && accounts.data) {
    myDevices = accounts.data.filter(
      (acc: { publicKey: PublicKey; account: { withdrawAuthority: PublicKey } }) =>
        acc.account.withdrawAuthority.toBase58() === address.toBase58(),
    )
  }

  if (!address) {
    return <div>Error loading account</div>
  }

  return (
    <div>
      <AppHero
        title={<AccountBalance address={address} />}
        subtitle={
          <div className="my-4">
            <ExplorerLink path={`account/${address}`} label={ellipsify(address.toString())} />
          </div>
        }
      >
        <div className="my-4">
          <AccountButtons address={address} />
        </div>
      </AppHero>
      <div className="space-y-8">
        <AccountTokens address={address} />
        <AccountTransactions address={address} />
        {/* Devices section, only if this is a wallet address */}
        {publicKey && address.toBase58() === publicKey.toBase58() && (
          <div>
            <h2 className="text-2xl font-bold mb-4">My Devices</h2>
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
              {myDevices.map((acc) => (
                <DeviceCard key={acc.publicKey.toBase58()} account={acc} />
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
