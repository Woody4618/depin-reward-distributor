const express = require('express')
const fs = require('fs')
const path = require('path')
const nacl = require('tweetnacl')
const bs58 = require('bs58')
const { exec } = require('child_process')
const cors = require('cors')

const app = express()
app.use(cors())
app.use(express.json())

// Serve a simple UI
app.get('/', (req, res) => {
  res.send(`
    <html>
      <head><title>Device UI</title></head>
      <body>
        <h1>Device Dashboard</h1>
        <div id="sensor">Loading...</div>
        <button onclick="claim()">Claim Rewards</button>
        <div id="claim-result"></div>
        <script>
          async function fetchSensor() {
            try {
              const res = await fetch('/api/sensor');
              const data = await res.json();
              if (data.temperature !== undefined && data.humidity !== undefined) {
                document.getElementById('sensor').innerText = 'Temperature: ' + data.temperature + '°C, Humidity: ' + data.humidity + '%';
              } else if (data.error) {
                document.getElementById('sensor').innerText = 'Error: ' + data.error;
              } else {
                document.getElementById('sensor').innerText = 'No data';
              }
            } catch (e) {
              document.getElementById('sensor').innerText = 'Error fetching sensor data';
            }
          }
          fetchSensor();
          setInterval(fetchSensor, 5000);
          async function claim() {
            const res = await fetch('/api/claim', { method: 'POST' });
            const data = await res.json();
            document.getElementById('claim-result').innerText = JSON.stringify(data, null, 2);
          }
        </script>
      </body>
    </html>
  `)
})

// Replace the /api/sensor endpoint with one that calls the Python script
app.get('/api/sensor', (req, res) => {
  exec('python3 sensor.py', { cwd: __dirname }, (error, stdout, stderr) => {
    if (error) {
      return res.status(500).json({ error: 'Failed to read sensor', details: stderr || error.message })
    }
    // Parse output: look for 'Temperature: (xx.xC) (xx.xF) Humidity: xx.x%'
    const match = stdout.match(/Temperature: \(([-\d.]+)C\) \(([-\d.]+)F\) Humidity: ([-\d.]+)%/)
    if (match) {
      const temperature = parseFloat(match[1])
      const humidity = parseFloat(match[3])
      return res.json({ temperature, humidity })
    } else {
      return res.status(500).json({ error: 'Could not parse sensor output', raw: stdout })
    }
  })
})

const deviceKeyPath = path.join(__dirname, 'device-key.json')

app.post('/api/sign-claim', (req, res) => {
  const { userPublicKey } = req.body
  if (!userPublicKey) {
    return res.status(400).json({ error: 'Missing userPublicKey' })
  }
  let secretKey
  try {
    secretKey = Uint8Array.from(JSON.parse(fs.readFileSync(deviceKeyPath, 'utf8')))
  } catch (e) {
    return res.status(500).json({ error: 'Failed to load device keypair' })
  }
  const keypair = nacl.sign.keyPair.fromSecretKey(secretKey)
  // Message: devicePubkey + userPubkey (both as base58 strings, concatenated)
  const message = Buffer.from(keypair.publicKey.toString() + userPublicKey)
  const signature = nacl.sign.detached(message, keypair.secretKey)
  res.json({
    devicePublicKey: bs58.encode(keypair.publicKey),
    signature: bs58.encode(signature),
    message: message.toString('base64'),
    note: 'Message is devicePubkey+userPubkey as base58 strings, concatenated.',
  })
})

// --- Automatic sensor reporting to oracle every 5 seconds ---
const oracleUrl = 'https://d169-2a02-3100-89fe-1b00-f5da-ce49-673-7491.ngrok-free.app/api/ping'

function reportSensorToOracle() {
  exec('python3 sensor.py', { cwd: __dirname }, (error, stdout, stderr) => {
    if (error) {
      console.error('[AUTO] Failed to read sensor:', stderr || error.message)
      return
    }
    const match = stdout.match(/Temperature: \(([-\d.]+)C\) \(([-\d.]+)F\) Humidity: ([-\d.]+)%/)
    if (!match) {
      console.error('[AUTO] Could not parse sensor output:', stdout)
      return
    }
    const temperature = parseFloat(match[1])
    const humidity = parseFloat(match[3])
    const data = { temperature, humidity }
    let secretKey
    try {
      secretKey = Uint8Array.from(JSON.parse(fs.readFileSync(deviceKeyPath, 'utf8')))
    } catch {
      console.error('[AUTO] Failed to load device keypair')
      return
    }
    const keypair = nacl.sign.keyPair.fromSecretKey(secretKey)
    const message = Buffer.from(JSON.stringify(data))
    const signature = nacl.sign.detached(message, keypair.secretKey)
    const signatureBase58 = bs58.encode(signature)
    fetch(oracleUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        devicePublicKey: bs58.encode(keypair.publicKey),
        signature: signatureBase58,
        data,
      }),
    })
      .then((oracleRes) => oracleRes.json())
      .then((oracleData) => {
        console.log('[AUTO] Oracle response:', oracleData)
      })
      .catch((err) => {
        console.error('[AUTO] Failed to call oracle:', err.message)
      })
  })
}
setInterval(reportSensorToOracle, 5000)

const PORT = 3000
app.listen(PORT, () => {
  console.log(`Device webserver running at http://localhost:${PORT}`)
})
