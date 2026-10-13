const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable JSON parsing and CORS for Roblox & Web Requests
app.use(express.json());
app.use(cors());

// Serve static frontend from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// ==========================================
// CONFIGURATION: LINK4M API TOKEN
// Place your Link4M API Token here or set it in process.env.LINK4M_TOKEN
// ==========================================
const LINK4M_TOKEN = process.env.LINK4M_TOKEN || '6abb3a6daf162d46ec29b472';

// Memory Storage: 
// keysDatabase: key -> { hwid, expiresAt }
// pendingSessions: token -> { hwid, createdAt }
const keysDatabase = new Map();
const pendingSessions = new Map();

/**
 * Periodically purge expired sessions and keys (Every 30 mins)
 */
setInterval(() => {
    const now = Date.now();
    for (const [token, session] of pendingSessions.entries()) {
        if (now - session.createdAt > 30 * 60 * 1000) { // 30 mins timeout
            pendingSessions.delete(token);
        }
    }
    for (const [key, data] of keysDatabase.entries()) {
        if (now > data.expiresAt) {
            keysDatabase.delete(key);
        }
    }
}, 30 * 60 * 1000);

/**
 * API: Server Configuration Status Check
 * GET /api/status
 */
app.get('/api/status', (req, res) => {
    const isConfigured = LINK4M_TOKEN && LINK4M_TOKEN !== 'THAY_API_TOKEN_LINK4M_CUA_BAN_TAI_DAY';
    res.json({
        ok: true,
        link4mConfigured: isConfigured,
        activeKeysCount: keysDatabase.size
    });
});

/**
 * API 1: Generate Link4M Verification URL (POST & GET support)
 * POST /api/getkey or GET /api/generate-link?hwid=HWID
 */
const handleGenerateLink = async (req, res) => {
    const hwid = req.body?.hwid || req.query?.hwid || 'QUANTUM-DEVICE-SESSION';
    const cleanHWID = String(hwid).trim();
    const sessionToken = crypto.randomBytes(16).toString('hex');

    // Store pending session
    pendingSessions.set(sessionToken, {
        hwid: cleanHWID,
        createdAt: Date.now()
    });

    // Auto-detect base domain
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.get('host');
    const callbackUrl = `${protocol}://${host}/api/callback?token=${sessionToken}`;

    try {
        // Shorten URL via Link4M API
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

        return res.json({
            ok: true,
            success: true,
            shortUrl: shortenedLink,
            link: shortenedLink,
            token: sessionToken
        });
    } catch (error) {
        console.error('[Link4M API Request Failed]:', error.message);
        
        // Direct fallback Link4M URL format
        const fallbackLink = `https://link4m.co/st?api=${LINK4M_TOKEN}&url=${encodeURIComponent(callbackUrl)}`;
        return res.json({
            ok: true,
            success: true,
            shortUrl: fallbackLink,
            link: fallbackLink,
            token: sessionToken
        });
    }
};

app.post('/api/getkey', handleGenerateLink);
app.get('/api/generate-link', handleGenerateLink);

/**
 * API 2: Link4M Callback Landing Page after bypass completion
 * GET /api/callback?token=SESSION_TOKEN
 */
app.get('/api/callback', (req, res) => {
    const { token } = req.query;

    if (!token || !pendingSessions.has(token)) {
        return res.status(400).send(`
            <!DOCTYPE html>
            <html lang="vi">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>QUANTUM — Phiên Hết Hạn</title>
                <style>
                    body { background: #020813; color: #ff5378; font-family: Inter, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; text-align: center; }
                    .card { background: #04182b; border: 1px solid #ff5378; padding: 30px; border-radius: 12px; max-width: 400px; width: 90%; box-shadow: 0 0 25px rgba(255,83,120,0.2); }
                    h2 { margin-bottom: 10px; font-size: 20px; }
                    p { color: #83cde8; font-size: 13px; line-height: 1.6; }
                    a { color: #00dfff; text-decoration: none; font-weight: bold; }
                </style>
            </head>
            <body>
                <div class="card">
                    <h2>❌ PHIÊN XÁC THỰC HẾT HẠN</h2>
                    <p>Phiên làm việc Link4M không tồn tại hoặc đã quá thời gian chờ. Vui lòng quay lại để tạo link mới.</p>
                    <p><a href="/">⌁ QUAY LẠI TRANG CHỦ</a></p>
                </div>
            </body>
            </html>
        `);
    }

    const session = pendingSessions.get(token);
    
    // Generate 24-Hour Key
    const randomCode = crypto.randomBytes(3).toString('hex').toUpperCase();
    const generatedKey = `NHAT-HUB-L4M-${randomCode}-24H`;
    const DURATION_MS = 24 * 60 * 60 * 1000; // 24 Hours
    const expiresAt = Date.now() + DURATION_MS;

    // Save key linked to session HWID
    keysDatabase.set(generatedKey, {
        hwid: session.hwid,
        expiresAt: expiresAt
    });

    // Remove pending session token
    pendingSessions.delete(token);

    // Render Success Interface matching Quantum aesthetic
    res.send(`
        <!DOCTYPE html>
        <html lang="vi">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>QUANTUM — Kích Hoạt Key Thành Công</title>
            <script src="https://cdn.jsdelivr.net/npm/canvas-confetti@1.6.0/dist/confetti.browser.min.js"></script>
            <style>
                body { background: radial-gradient(ellipse at 50% 45%,#06213a,#020813 58%,#01050c); color: #c9f5ff; font-family: Inter, sans-serif; min-height: 100vh; display: flex; align-items: center; justify-content: center; margin: 0; padding: 20px; box-sizing: border-box; }
                .panel { background: linear-gradient(135deg, #04182b, #010a14); border: 1px solid #28ff9b; box-shadow: 0 0 35px rgba(40,255,155,0.25); padding: 32px; border-radius: 16px; max-width: 440px; width: 100%; text-align: center; }
                .icon { font-size: 42px; color: #28ff9b; text-shadow: 0 0 20px #28ff9b; margin-bottom: 12px; }
                h2 { font-size: 20px; letter-spacing: .12em; color: #fff; margin: 0 0 8px 0; }
                p { color: #83bdd5; font-size: 13px; margin-bottom: 20px; }
                .key-box { background: #010c18; border: 1px solid #00dfff; padding: 16px; border-radius: 8px; font-family: monospace; font-size: 18px; color: #28ff9b; font-weight: bold; letter-spacing: 1px; word-break: break-all; margin-bottom: 20px; }
                .btn { width: 100%; padding: 14px; background: linear-gradient(110deg,#034365,#00658b); border: 1px solid #00dfff; color: #fff; font-weight: bold; font-size: 13px; letter-spacing: 1px; cursor: pointer; border-radius: 8px; box-shadow: 0 0 15px rgba(0,223,255,0.3); }
                .btn:hover { filter: brightness(1.2); }
                .info { margin-top: 20px; text-align: left; font-size: 11px; color: #638da4; line-height: 1.8; border-top: 1px solid #0d4761; padding-top: 12px; }
            </style>
        </head>
        <body>
            <div class="panel">
                <div class="icon">⛨</div>
                <h2>XÁC THỰC LINK4M THÀNH CÔNG</h2>
                <p>Quyền truy cập VIP 24 Giờ của Nhật HUB đã được cấp phép.</p>

                <div class="key-box" id="keyVal">${generatedKey}</div>

                <button class="btn" onclick="copyKey()">SAO CHÉP KEY VÀO ROBLOX</button>

                <div class="info">
                    <div>• <b>HWID Đăng Ký:</b> <span style="color:#00dfff">${session.hwid}</span></div>
                    <div>• <b>Thời Gian Sử Dụng:</b> <span style="color:#28ff9b">24 Giờ</span></div>
                    <div>• <b>Nguồn Xác Thực:</b> <span style="color:#83bdd5">Link4M Gateway</span></div>
                </div>
            </div>

            <script>
                confetti({ particleCount: 90, spread: 70, origin: { y: 0.6 } });
                function copyKey() {
                    const k = document.getElementById('keyVal').innerText;
                    navigator.clipboard.writeText(k);
                    alert("Đã copy mã Key! Vui lòng dán vào Roblox Script.");
                }
            </script>
        </body>
        </html>
    `);
});

/**
 * API 3: Verify Key Status from Roblox Luau Script
 * GET /api/verify?key=KEY_VALUE&hwid=HWID_VALUE
 */
app.get('/api/verify', (req, res) => {
    const { key, hwid } = req.query;

    if (!key) {
        return res.status(400).json({
            success: false,
            message: 'Thiếu thông tin Key xác thực!'
        });
    }

    const cleanKey = String(key).trim();
    const cleanHWID = hwid ? String(hwid).trim() : null;

    const record = keysDatabase.get(cleanKey);

    if (!record) {
        return res.json({
            success: false,
            message: 'Mã Key không tồn tại hoặc chưa qua bước vượt Link4M!'
        });
    }

    // HWID Binding Check
    if (cleanHWID && record.hwid !== 'QUANTUM-DEVICE-SESSION' && record.hwid !== cleanHWID) {
        return res.json({
            success: false,
            message: 'Key này được đăng ký cho thiết bị (HWID) khác!'
        });
    }

    // Expiration Check
    if (Date.now() > record.expiresAt) {
        keysDatabase.delete(cleanKey);
        return res.json({
            success: false,
            message: 'Key đã hết hạn sử dụng 24 Giờ. Vui lòng Get Key lại!'
        });
    }

    const remainingSeconds = Math.floor((record.expiresAt - Date.now()) / 1000);
    const hours = Math.floor(remainingSeconds / 3600);
    const minutes = Math.floor((remainingSeconds % 3600) / 60);

    return res.json({
        success: true,
        message: 'Xác thực thành công! Quyền truy cập Nhật HUB VIP hợp lệ.',
        formattedRemaining: `${hours} giờ ${minutes} phút`,
        expiresAt: record.expiresAt
    });
});

// Fallback Route for SPA
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`[QUANTUM GATEWAY] Server operational on port ${PORT}`);
});
