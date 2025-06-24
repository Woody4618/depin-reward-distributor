Copy the files to the Raspberry Pi

```bash
scp -r raspberry pi@raspberrypi.local:~
```

Install Node.js and npm

```bash
sudo apt update
sudo apt install nodejs npm
node -v
npm -v
cd ~/raspberry
npm install express tweetnacl bs58@5 cors
```

Start the webserver to claim the device:

```bash
node server.js
```
