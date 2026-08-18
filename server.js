const express = require('express');
const { WebSocketServer, WebSocket } = require('ws');
const http = require('http');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Basic Auth middleware for the management dashboard
const ADMIN_USER = 'ICONNETWORK';
const ADMIN_PASS = 'LORDicon@30';

function checkAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        res.setHeader('WWW-Authenticate', 'Basic realm="RMM Dashboard"');
        return res.status(401).send('Authentication required.');
    }
    const base64Credentials = authHeader.split(' ')[1];
    const credentials = Buffer.from(base64Credentials, 'base64').toString('ascii');
    const [username, password] = credentials.split(':');

    if (username === ADMIN_USER && password === ADMIN_PASS) {
        return next();
    }
    res.setHeader('WWW-Authenticate', 'Basic realm="RMM Dashboard"');
    return res.status(401).send('Invalid authentication credentials.');
}

// Protect the dashboard UI route
app.get('/', checkAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Serve static dashboard files securely behind auth check
app.use('/assets', checkAuth, express.static(path.join(__dirname, 'public')));

// Storage for active connections
const agents = new Map(); // deviceId -> WebSocket instance
const dashboards = new Set(); // Dashboard WebSockets

wss.on('connection', (ws, req) => {
    let clientType = 'unknown';
    let assignedId = null;

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);

            // 1. Agent Registration
            if (data.type === 'register') {
                clientType = 'agent';
                assignedId = data.deviceId;
                agents.set(assignedId, { ws, info: data.info || {} });
                console.log(`[Hub] Agent registered: ${assignedId}`);
                broadcastDeviceList();
            } 
            // 2. Dashboard Connection Identification
            else if (data.type === 'dashboard_init') {
                clientType = 'dashboard';
                dashboards.add(ws);
                console.log('[Hub] Dashboard client connected');
                ws.send(JSON.stringify({ type: 'device_list', devices: getDeviceList() }));
            }
            // 3. Command execution request sent from Dashboard to an Agent
            else if (clientType === 'dashboard' && data.type === 'exec') {
                const targetAgent = agents.get(data.targetId);
                if (targetAgent && targetAgent.ws.readyState === WebSocket.OPEN) {
                    targetAgent.ws.send(JSON.stringify({ type: 'exec', command: data.command }));
                } else {
                    ws.send(JSON.stringify({ type: 'error', message: 'Target device offline or unavailable.' }));
                }
            }
            // 4. Response from Agent sent back to Dashboard
            else if (clientType === 'agent' && data.type === 'response') {
                console.log(`[Hub] Response received from ${assignedId}`);
                for (let dashWs of dashboards) {
                    if (dashWs.readyState === WebSocket.OPEN) {
                        dashWs.send(JSON.stringify({
                            type: 'command_output',
                            deviceId: assignedId,
                            result: data.result
                        }));
                    }
                }
            }
        } catch (err) {
            console.error('[Hub] Error processing message:', err.message);
        }
    });

    ws.on('close', () => {
        if (clientType === 'agent' && assignedId) {
            agents.delete(assignedId);
            console.log(`[Hub] Agent disconnected: ${assignedId}`);
            broadcastDeviceList();
        } else if (clientType === 'dashboard') {
            dashboards.delete(ws);
            console.log('[Hub] Dashboard client disconnected');
        }
    });
});

function getDeviceList() {
    const list = [];
    for (let [id, data] of agents.entries()) {
        list.push({ id, info: data.info });
    }
    return list;
}

function broadcastDeviceList() {
    const payload = JSON.stringify({ type: 'device_list', devices: getDeviceList() });
    for (let dashWs of dashboards) {
        if (dashWs.readyState === WebSocket.OPEN) {
            dashWs.send(payload);
        }
    }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`[Hub] Server running on port ${PORT}`);
});
