const express = require('express');
const http = require('http');
const { WebSocketServer, WebSocket } = require('ws');
const path = require('path');

const app = express();

// ==================== CONFIGURATION ====================
const ADMIN_USER = 'ICONNETWORK';           // Web Dashboard Username
const ADMIN_PASS = 'LORDicon@30';           // Web Dashboard Password
const AGENT_SECRET = 'my-agent-secret-123'; // Secret token for connecting agents
// =======================================================

// Authentication Middleware for the Web Dashboard
app.use((req, res, next) => {
    const authHeader = req.headers.authorization;

    if (authHeader) {
        const [user, pass] = Buffer.from(authHeader.split(' ')[1], 'base64').toString().split(':');
        if (user === ADMIN_USER && pass === ADMIN_PASS) {
            return next();
        }
    }

    res.set('WWW-Authenticate', 'Basic realm="Device Control Hub"');
    return res.status(401).send('Authentication required to access this control hub.');
});

// Serve static files from the public folder (protected by auth above)
app.use(express.static(path.join(__dirname, 'public')));

// Explicit route to serve the dashboard interface on load
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const devices = new Map();

wss.on('connection', (ws) => {
    let deviceId = null;

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);

            // Optional: If you want to secure agent registrations/messages with the token, 
            // you can check it here (dashboards typically connect via HTTP first, but agents connect directly via WS):
            if (data.type === 'register') {
                if (data.secret && data.secret !== AGENT_SECRET) {
                    ws.send(JSON.stringify({ type: 'error', result: 'Unauthorized: Invalid agent secret.' }));
                    return ws.close();
                }

                deviceId = data.deviceId;
                devices.set(deviceId, { ws, info: data.info });
                broadcastDeviceList();
            }

            if (data.type === 'command') {
                const target = devices.get(data.targetId);
                if (target && target.ws.readyState === WebSocket.OPEN) {
                    target.ws.send(JSON.stringify({ type: 'exec', command: data.command }));
                } else {
                    broadcastToDashboards({
                        type: 'log',
                        deviceId: data.targetId,
                        result: 'Error: Target device is offline or unreachable.'
                    });
                }
            }

            if (data.type === 'response') {
                broadcastToDashboards({
                    type: 'log',
                    deviceId,
                    result: data.result
                });
            }
        } catch (err) {
            console.error('Payload processing error:', err.message);
        }
    });

    ws.on('close', () => {
        if (deviceId) {
            devices.delete(deviceId);
            broadcastDeviceList();
        }
    });
});

function broadcastDeviceList() {
    const list = Array.from(devices.entries()).map(([id, d]) => ({
        id,
        info: d.info
    }));
    broadcastToDashboards({ type: 'device_list', devices: list });
}

function broadcastToDashboards(payload) {
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(payload));
        }
    });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Control Hub active on port ${PORT}`);
});
