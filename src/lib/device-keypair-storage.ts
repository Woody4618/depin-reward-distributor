import { Keypair } from '@solana/web3.js'

export const DEVICE_KEYS_STORAGE_KEY = 'depin_device_keypairs_v1'

export function getSavedDeviceKeypairs(): Record<string, string> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = localStorage.getItem(DEVICE_KEYS_STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

export function saveDeviceKeypair(pubkey: string, secret: string) {
  const all = getSavedDeviceKeypairs()
  all[pubkey] = secret
  localStorage.setItem(DEVICE_KEYS_STORAGE_KEY, JSON.stringify(all))
}

export function removeDeviceKeypair(pubkey: string) {
  const all = getSavedDeviceKeypairs()
  delete all[pubkey]
  localStorage.setItem(DEVICE_KEYS_STORAGE_KEY, JSON.stringify(all))
}

export function exportDeviceKeypair(keypair: Keypair): string {
  return JSON.stringify(Array.from(keypair.secretKey))
}

export function importDeviceKeypair(raw: string): Keypair | null {
  try {
    const arr = JSON.parse(raw)
    if (Array.isArray(arr) && arr.length === 64) {
      return Keypair.fromSecretKey(new Uint8Array(arr))
    }
  } catch {}
  return null
}
