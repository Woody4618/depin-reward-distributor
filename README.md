# DePIN Reward Distributor

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

## Contributing

- PRs and issues welcome!
- Please keep code and docs in sync.

---

## License

MIT
