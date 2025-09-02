# DePIN Reward Distributor

[Video Walktrhough](https://www.youtube.com/watch?v=OyVvdj2qkdg&ab_channel=JonasHahn)

A full-stack Solana dApp for distributed, oracle-verified rewards.
This specific examples is collecting Temperature and Humidity data from a Raspberry Pi and rewards the user for as long as new Data is send from the device. Like this we could get a global average of home heating habits of people around the world. 

The cost of the Setup comes down to 0.00144768 per device on chain reward account.
This cost can either be payed by the Hardware issuer when the device identity keypair is created or the the user of the device. Depending on your needs.
All the sensor is stored of chain in a data base and only the reward data is saved in a Solana Anchor program. For this example project the "database" is a json file in the project root where you can easily see the sensor data.

## Architecture Overview

- **Anchor Program**: Manages reward accounts, authority changes, and reward claims. Claims require an Ed25519 signature from a trusted oracle.
- **Web App**: React/Next.js frontend for users to view and claim rewards, and for admins to manage devices.
- **Raspberry Pi**: Reads sensor data, signs it with a device key, and reports to the oracle API.
- **Oracle**: Signs reward data and exposes an API for the Pi and web app to interact with.

<img width="993" alt="image" src="https://github.com/user-attachments/assets/d4b4751c-8709-4ce4-9459-80803a445206" />

This is how this flow looks like in the web app that you can start using `pnpm dev`: 
Create of claim a physical device: 

<img width="1108" height="868" alt="image" src="https://github.com/user-attachments/assets/d030ea06-b498-4187-9b13-ebe4db9dbb67" />

Display of reward data per device and claim functionality using the oracle: 
<img width="1595" height="889" alt="image" src="https://github.com/user-attachments/assets/23ffdd10-6066-4ada-ac13-d0575951ba8e" />

---

## Reward Claim Flow

1. **User** takes authority over the device keypair, via a local wifi connection or by the issues at setup time.
2. **Device** reports sensor data to the oracle API, signed with its device key.
3. **Oracle** verifies the device's signature, signs the reward message, and exposes it via API.
4. **User** claims rewards via the web app, which submits the oracle-signed message to the Anchor program.
5. **Anchor Program** verifies the Ed25519 signature and processes the claim.

---

## Security conciderations

1. In the best case the device keypair is never leaving the device and even better is saved in a secure hardware chip. If not the user could extract the keypair from the device and send wrong data. So it makes sense to validate the data send from devices in the oracle in any case.
2. In this example app it is possible to create a new device keypair in the webapp and claim any keypair. For production you would want to permission the creation of these keys. You can for example to that by adding an admin key to the program that is the only account that is allowed to create new reward accounts.
3. In this example the device can theoretically send as many sensor pings as it wants and thus get unlimited rewards. As the device is in the users hands, we can not 100% be sure that the device is not sending wrong data. Depending on your project you would probably want to limit the sensor rewards per day, per device or even limit the total amount of rewards per device.
4. For this test project the oracle keypair is saved in the project root. In a production environment you would want to save the oracle keypair in a safe place and not check it into version control.

---

## 6. Cost 

### Reward Distribution Cost Analysis

Assuming a reward distribution to 10,000 users, with an average reward amount per user of 100 tokens, and a transaction fee on Solana of 0.000007 SOL (7,000 lamports), the storage costs for different distribution strategies are as follows:

### Storage Costs Using Merkle Tree Distribution Strategy
- The Merkle tree requires storing the leaf nodes and the internal nodes.
- **Leaf Nodes**: 10,000 * 32 bytes = 320,000 bytes
- **Internal Nodes**: (2^14 - 1) * 32 bytes = 524,256 bytes
- **Total Storage Cost**: (320,000 + 524,256) * 0.00000348 SOL/byte (per epoch) = 2.94 SOL
- **Total Cost (Merkle Tree)**: 0.050005 SOL + 0.00007323 SOL + 2.94 SOL = **2.99 SOL**

### Storage Costs Using ZK Compression Distribution Strategy
- The compressed token account stores the compressed reward data.
- **Compressed Data Size**: Assuming a compression ratio of 50%, the total compressed data size is approximately 500 KB.
- **Total Storage Cost**: 500 * 1024 * 0.00000348 SOL/byte (per epoch) = 1.78 SOL
- **Total Cost (ZK Compression)**: 0.050005 SOL + 0.00000223 SOL + 1.78 SOL = **1.83 SOL**

### Storage Costs Without Compression
- Saving the claimed amount in a normal Solana account state.
- **Data Size**: Saving authority, device pubkey, and claimed amount requires 72 bytes, resulting in 0.001392 SOL in rent cost per account.
- **Note**: This approach does not scale well for large networks but has less complexity, and costs can theoretically be distributed to users.

In this example we only use the non compressed version and save the claimed amount directly in a Solana Account. There are implementations out there for compression. 
Notably: 
[Jito Reward Distributor](https://github.com/jito-foundation/distributor), the [Jupiter Distributor](https://github.com/jup-ag/merkle-distributor-sdk) or even ready made tools like [Helius AirShip](https://www.helius.dev/docs/airship/getting-started#build-from-source). 

### Cost Extrapolation Across Different Numbers of Reward Distributions
The following table extrapolates storage costs for different numbers of reward distributions:

| Number of Distributions | Merkle Tree Storage Cost (SOL) | ZK Compression Storage Cost (SOL) | No Compression (SOL) |
|-------------------------|-------------------------------|----------------------------------|----------------------|
| 1,000                   | 0.06                          | 0.03                             | 1.392                |
| 10,000                  | 0.58                          | 0.29                             | 13.92                |
| 100,000                 | 5.80                          | 2.90                             | 139.2                |
| 1,000,000               | 58.00                         | 29.00                            | 1392                 |
| 5,000,000               | 290.00                        | 145.00                           | 6960                 |

| Number of Distributions | Merkle Tree Storage Cost (SOL) | ZK Compression Storage Cost (SOL) | No Compression (SOL) |
|-------------------------|-------------------------------|----------------------------------|----------------------|
| 1,000                   | 0.06                          | 0.03                             | 1.392                |
| 10,000                  | 0.58                          | 0.29                             | 13.92                |
| 100,000                 | 5.80                          | 2.90                             | 139.2                |
| 1,000,000               | 58.00                         | 29.00                            | 1392                 |
| 5,000,000               | 290.00                        | 145.00                           | 6960                 |

---

## 6. Identifier

- In this example we just use a ed25519 key on the Raspberry Pi, but for a proper device it should be a hardware key. (For example the LetsTrust TPM for Raspberry Pi) 
- To identify the device on chain its also possible to mint an NFT of a cNFT to identify the device. Then the owner of the NFT would be able to claim. Helium does this for example.

## Getting Started

### 1. Clone and Install

```sh
pnpm install
```

### 2. Anchor Program

#### Build and Test

```sh
cd anchor
pnpm anchor build
pnpm anchor test --detach
```

Tip: using --detach here lets the local test validator run in the background which will make it so that you already have a working validator running when you start the web app and the project will work out of the box.

#### Program ID Sync

Once after you build your project you will want to sync the program id to your local anchor config.

```sh
pnpm anchor keys sync
```

---

### 3. Web App

#### Start the Web App

```sh
pnpm dev
```

#### Build the Web App

```sh
pnpm build
```

---

### 4. Raspberry Pi Integration

- The Pi runs a Node.js server (`raspberry/server.js`) that:
  - Reads sensor data via `sensor.py`
  - Loads the device keypair from `raspberry/device-key.json`
  - Signs the data and POSTs to the oracle API every 5 seconds

#### Setup

- Place your device keypair in `raspberry/device-key.json` (array of 64 bytes)
- Ensure Python and Node.js are installed
- Start the server:

```sh
cd raspberry
node server.js
```

---

### 5. Oracle Keypair for Tests

- The Anchor tests require the oracle keypair to match the hardcoded pubkey in the program (`oraXrapkbpe6pCVJ2sm3MRZAdyemtWXyGg4W6mGarjL`).
- Place the secret key as a JSON array in `oraXrapkbpe6pCVJ2sm3MRZAdyemtWXyGg4W6mGarjL.json` at the project root.

IMPORTANT: The oracle keypair should not be used in production. It is only for testing. So for production you would want to generate a new keypair and update the program's hardcoded pubkey and then save it for example in your vercel secret.

---

## References 

This guide is roughly based on how Helium does their reward distribution. Just without the cNFTs. 
If you want to check out the actual in production implementation of Helium here are some links: 

- Distributor oracle: https://github.com/helium/helium-program-library/tree/master/packages/distributor-oracle 
- Lazy distributor: https://github.com/helium/helium-program-library/tree/master/programs/lazy-distributor 
- Claiming rewards: https://docs.helium.com/solana/rewardable-entites/#claiming-rewards-on-rewardable-entities

## Contributing

- PRs and issues welcome!
- Please keep code and docs in sync.

---

## License

MIT
