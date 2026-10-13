const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// ==========================================
// CONFIGURATION & PERSISTENT STORAGE
// ==========================================
let LINK4M_TOKEN = process.env.LINK4M_TOKEN || '6abb3a6daf162d46ec29b472';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'nhathub2026';
const DATA_FILE = path.join(__dirname, 'keys.json');

let keysDatabase = new Map();
const serverLogs = [];

function addLog(action, details) {
    const timestamp = new Date().toLocaleTimeString('vi-VN');
    serverLogs.unshift({ timestamp, action, details });
    if (serverLogs.length > 50) serverLogs.pop();
}

function loadKeys() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            const rawData = fs.readFileSync(DATA_FILE, 'utf8');
            const parsed = JSON.parse(rawData);
            keysDatabase = new Map(Object.entries(parsed));
            addLog('SYSTEM', `Đã tải thành công ${keysDatabase.size} key từ bộ nhớ lưu trữ.`);
        }
    } catch (err) {
        addLog('ERROR', `Lỗi tải key: ${err.message}`);
    }
}

function saveKeys() {
    try {
        const obj = Object.fromEntries(keysDatabase);
        fs.writeFileSync(DATA_FILE, JSON.stringify(obj, null, 2), 'utf8');
    } catch (err) {
        addLog('ERROR', `Lỗi lưu key: ${err.message}`);
    }
}

loadKeys();

// Purge expired keys every 10 mins
setInterval(() => {
    const now = Date.now();
    let updated = false;
    for (const [key, data] of keysDatabase.entries()) {
        if (now > data.expiresAt) {
            keysDatabase.delete(key);
            updated = true;
        }
    }
    if (updated) saveKeys();
}, 10 * 60 * 1000);

// ==========================================
// STATELESS CRYPTO SESSION TOKENS (100% Sleep-Proof)
// ==========================================
const SECRET_KEY = ADMIN_PASSWORD + '-nhat-hub-quantum-secret';

function createSessionToken(hwid) {
    const payload = {
        hwid: hwid,
        exp: Date.now() + (15 * 60 * 1000) // 15 phút để hoàn thành link4m
    };
    const payloadStr = JSON.stringify(payload);
    const base64Payload = Buffer.from(payloadStr).toString('base64url');
    const signature = crypto.createHmac('sha256', SECRET_KEY).update(base64Payload).digest('base64url');
    return `${base64Payload}.${signature}`;
}

function verifySessionToken(token) {
    try {
        const parts = token.split('.');
        if (parts.length !== 2) return null;
        const [base64Payload, signature] = parts;

        const expectedSig = crypto.createHmac('sha256', SECRET_KEY).update(base64Payload).digest('base64url');
        if (signature !== expectedSig) return null;

        const payloadStr = Buffer.from(base64Payload, 'base64url').toString('utf8');
        const payload = JSON.parse(payloadStr);

        if (Date.now() > payload.exp) return null; // Hết hạn 15 phút
        return payload;
    } catch (e) {
        return null;
    }
}

// ==========================================
// PUBLIC API ENDPOINTS
// ==========================================

app.get('/api/status', (req, res) => {
    const isConfigured = LINK4M_TOKEN && LINK4M_TOKEN !== 'THAY_API_TOKEN_LINK4M_CUA_BAN_TAI_DAY';
    res.json({
        ok: true,
        link4mConfigured: isConfigured,
        activeKeysCount: keysDatabase.size
    });
});

const handleGenerateLink = async (req, res) => {
    const hwid = req.body?.hwid || req.query?.hwid || 'QUANTUM-DEVICE-SESSION';
    const cleanHWID = String(hwid).trim();
    
    // Tạo token mã hóa tĩnh (không cần lưu RAM, chống lỗi sleep server)
    const sessionToken = createSessionToken(cleanHWID);

    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.get('host');
    const callbackUrl = `${protocol}://${host}/api/callback?token=${sessionToken}`;

    try {
        const response = await axios.get('https://link4m.co/api-shorten', {
            params: {
                api: LINK4M_TOKEN,
                url: callbackUrl
            },
            timeout: 8000
        });

        let shortenedLink = callbackUrl;
        if (response.data && response.data.shortenedUrl) {
            shortenedLink = response.data.shortenedUrl;
        } else {
            shortenedLink = `https://link4m.co/st?api=${LINK4M_TOKEN}&url=${encodeURIComponent(callbackUrl)}`;
        }

        addLog('LINK4M', `Tạo link thành công cho HWID: ${cleanHWID}`);
        return res.json({ ok: true, success: true, shortUrl: shortenedLink, link: shortenedLink });
    } catch (error) {
        addLog('ERROR', `Link4M API lỗi: ${error.message}`);
        const fallbackLink = `https://link4m.co/st?api=${LINK4M_TOKEN}&url=${encodeURIComponent(callbackUrl)}`;
        return res.json({ ok: true, success: true, shortUrl: fallbackLink, link: fallbackLink });
    }
};

app.post('/api/getkey', handleGenerateLink);
app.get('/api/generate-link', handleGenerateLink);

app.get('/api/callback', (req, res) => {
    const { token } = req.query;
    if (!token) {
        return res.status(400).send(`<h3>Thiếu mã thông báo xác thực.</h3>`);
    }

    const session = verifySessionToken(token);
    if (!session) {
        return res.status(400).send(`
            <!DOCTYPE html>
            <html lang="vi">
            <head>
                <meta charset="UTF-8">
                <title>Lỗi Xác Thực</title>
                <style>
                    body { background: #030308; color: #ff007f; font-family: monospace; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; text-align: center; }
                    .card { background: #080914; border: 1px solid rgba(255,0,127,0.3); padding: 40px; border-radius: 16px; box-shadow: 0 0 30px rgba(255,0,127,0.2); max-width: 400px; width: 90%; }
                </style>
            </head>
            <body>
                <div class="card">
                    <h2>PHIÊN XÁC THỰC HẾT HẠN</h2>
                    <p style="color:#94a3b8; font-size:12px; margin-top:10px;">Vui lòng quay lại trang chính và lấy lại link Link4M mới (thời hạn vượt link trong vòng 15 phút).</p>
                </div>
            </body>
            </html>
        `);
    }

    const randomCode = crypto.randomBytes(3).toString('hex').toUpperCase();
    const generatedKey = `NHAT-HUB-L4M-${randomCode}-24H`;
    const expiresAt = Date.now() + (24 * 60 * 60 * 1000);

    keysDatabase.set(generatedKey, {
        hwid: session.hwid,
        createdAt: Date.now(),
        expiresAt: expiresAt
    });
    saveKeys();

    addLog('KEY_GEN', `Cấp thành công key ${generatedKey} cho HWID ${session.hwid}`);

    res.send(`
        <!DOCTYPE html>
        <html lang="vi">
        <head>
            <meta charset="UTF-8">
            <title>Kích Hoạt Key Thành Công</title>
            <style>
                body { background: #030308; color: #00f0ff; font-family: monospace; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
                .card { background: #080914; border: 1px solid rgba(0,240,255,0.3); padding: 40px; border-radius: 16px; text-align: center; box-shadow: 0 0 30px rgba(0,240,255,0.2); max-width: 400px; width: 90%; }
                h2 { color: #fff; margin-bottom: 10px; font-size: 18px; }
                .key { background: #030308; border: 1px solid #10b981; color: #10b981; padding: 15px; font-size: 16px; font-weight: bold; border-radius: 8px; margin: 20px 0; word-break: break-all; }
                button { background: #00f0ff; color: #030308; border: none; padding: 12px 20px; font-weight: bold; border-radius: 8px; cursor: pointer; width: 100%; font-family: monospace; }
            </style>
        </head>
        <body>
            <div class="card">
                <h2>XÁC THỰC LINK4M THÀNH CÔNG</h2>
                <p style="color:#94a3b8; font-size:12px;">Key có hiệu lực 24 giờ cho Nhật HUB.</p>
                <div class="key" id="k">${generatedKey}</div>
                <button onclick="navigator.clipboard.writeText('${generatedKey}'); alert('Đã copy key!');">SAO CHÉP KEY</button>
            </div>
        </body>
        </html>
    `);
});

app.get('/api/verify', (req, res) => {
    const { key, hwid } = req.query;
    if (!key) return res.status(400).json({ success: false, message: 'Thiếu key' });

    const record = keysDatabase.get(String(key).trim());
    if (!record) return res.json({ success: false, message: 'Key không tồn tại trên hệ thống.' });

    if (hwid && record.hwid !== 'QUANTUM-DEVICE-SESSION' && record.hwid !== String(hwid).trim()) {
        return res.json({ success: false, message: 'Key này thuộc về thiết bị (HWID) khác!' });
    }

    if (Date.now() > record.expiresAt) {
        keysDatabase.delete(String(key).trim());
        saveKeys();
        return res.json({ success: false, message: 'Key đã hết hạn 24 giờ.' });
    }

    const remainingSecs = Math.floor((record.expiresAt - Date.now()) / 1000);
    const h = Math.floor(remainingSecs / 3600);
    const m = Math.floor((remainingSecs % 3600) / 60);

    return res.json({
        success: true,
        message: 'Key hợp lệ!',
        formattedRemaining: `${h} giờ ${m} phút`
    });
});

// ==========================================
// ADMIN DASHBOARD API ENDPOINTS
// ==========================================

app.post('/api/admin/login', (req, res) => {
    const { password } = req.body;
    if (password === ADMIN_PASSWORD) {
        addLog('ADMIN', 'Đăng nhập trang quản trị thành công.');
        return res.json({ ok: true, token: 'nhat-hub-admin-token-secure' });
    }
    addLog('WARNING', 'Đăng nhập admin thất bại do sai mật khẩu.');
    res.status(401).json({ ok: false, message: 'Mật khẩu quản trị không đúng!' });
});

app.get('/api/admin/dashboard', (req, res) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.includes('nhat-hub-admin-token-secure')) {
        return res.status(403).json({ ok: false, message: 'Unauthorized access.' });
    }

    const keysList = [];
    for (const [key, data] of keysDatabase.entries()) {
        keysList.push({
            key,
            hwid: data.hwid,
            createdAt: data.createdAt,
            expiresAt: data.expiresAt,
            expired: Date.now() > data.expiresAt
        });
    }

    res.json({
        ok: true,
        stats: {
            totalKeys: keysDatabase.size,
            activeSessions: 0,
            link4mConfigured: LINK4M_TOKEN !== 'THAY_API_TOKEN_LINK4M_CUA_BAN_TAI_DAY'
        },
        keys: keysList,
        logs: serverLogs
    });
});

app.post('/api/admin/keys/delete', (req, res) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.includes('nhat-hub-admin-token-secure')) {
        return res.status(403).json({ ok: false, message: 'Unauthorized.' });
    }

    const { key } = req.body;
    if (keysDatabase.has(key)) {
        keysDatabase.delete(key);
        saveKeys();
        addLog('ADMIN', `Đã xóa key: ${key}`);
        return res.json({ ok: true, message: `Đã xóa key ${key} thành công.` });
    }
    res.status(404).json({ ok: false, message: 'Không tìm thấy key.' });
});

app.post('/api/admin/config', (req, res) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.includes('nhat-hub-admin-token-secure')) {
        return res.status(403).json({ ok: false, message: 'Unauthorized.' });
    }

    const { token } = req.body;
    if (token) {
        LINK4M_TOKEN = token.trim();
        addLog('ADMIN', 'Đã cập nhật Link4M API Token mới.');
        return res.json({ ok: true, message: 'Cập nhật Link4M Token thành công!' });
    }
    res.status(400).json({ ok: false, message: 'Token không hợp lệ.' });
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`[NHẬT HUB] Server & Admin Panel running on port ${PORT}`);
});
