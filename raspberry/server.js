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

// Mock: Sign and return a claim message (replace with real signing logic)
app.post('/api/claim', (req, res) => {
  // TODO: Load device keypair and sign a message
  // For now, just return a mock signature
  const message = Buffer.from('mock-message')
  const mockSecret = Buffer.alloc(64, 1) // Replace with real secret key
  const signature = nacl.sign.detached(message, mockSecret)
  res.json({
    message: message.toString('hex'),
    signature: bs58.encode(signature),
    note: 'Replace with real signing and message structure!',
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

const PORT = 3000
app.listen(PORT, () => {
  console.log(`Device webserver running at http://localhost:${PORT}`)
})
