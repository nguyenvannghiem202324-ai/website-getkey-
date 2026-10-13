const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable JSON parsing and CORS for Roblox HTTP Requests
app.use(express.json());
app.use(cors());

// Serve static frontend from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// ==========================================
// CONFIGURATION: LINK4M API TOKEN
// Thay TOKEN Link4M của bạn ở đây (lấy tại link4m.co)
// ==========================================
const LINK4M_TOKEN = process.env.LINK4M_TOKEN || '6abb3a6daf162d46ec29b472';

// Memory Storage: 
// keysDatabase: key -> { hwid, expiresAt }
// pendingSessions: token -> { hwid, createdAt }
const keysDatabase = new Map();
const pendingSessions = new Map();

/**
 * Clean up expired sessions and keys periodically (Every 30 mins)
 */
setInterval(() => {
    const now = Date.now();
    for (const [token, session] of pendingSessions.entries()) {
        if (now - session.createdAt > 30 * 60 * 1000) { // 30 min session timeout
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
 * API 1: Generate Link4M Verification URL
 * GET /api/generate-link?hwid=YOUR_HWID
 */
app.get('/api/generate-link', async (req, res) => {
    const { hwid } = req.query;

    if (!hwid || typeof hwid !== 'string' || hwid.trim() === '') {
        return res.status(400).json({
            success: false,
            message: 'Thiếu thông tin HWID thiết bị!'
        });
    }

    const cleanHWID = hwid.trim();
    const sessionToken = crypto.randomBytes(16).toString('hex');
    
    // Save pending session
    pendingSessions.set(sessionToken, {
        hwid: cleanHWID,
        createdAt: Date.now()
    });

    // Determine domain automatically
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.get('host');
    const callbackUrl = `${protocol}://${host}/api/callback?token=${sessionToken}`;

    try {
        // Request shortened link from Link4M API
        const response = await axios.get('https://link4m.co/api-shorten', {
            params: {
                api: LINK4M_TOKEN,
                url: callbackUrl
            },
            timeout: 8000
        });

        if (response.data && response.data.shortenedUrl) {
            return res.json({
                success: true,
                link: response.data.shortenedUrl,
                token: sessionToken
            });
        } else {
            // Fallback link construction if API returns raw format
            const fallbackLink = `https://link4m.co/st?api=${LINK4M_TOKEN}&url=${encodeURIComponent(callbackUrl)}`;
            return res.json({
                success: true,
                link: fallbackLink,
                token: sessionToken
            });
        }
    } catch (error) {
        console.error('[Link4M API Error]:', error.message);
        
        // Backup direct link generator
        const directLink = `https://link4m.co/st?api=${LINK4M_TOKEN}&url=${encodeURIComponent(callbackUrl)}`;
        return res.json({
            success: true,
            link: directLink,
            token: sessionToken
        });
    }
});

/**
 * API 2: Link4M Callback Target after bypass completion
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
                <title>Lỗi Xác Thực - Nhật HUB</title>
                <style>
                    body { background: #030308; color: #ff0055; font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; text-align: center; }
                    .card { background: #080914; border: 1px solid #ff0055; padding: 30px; border-radius: 16px; max-width: 400px; width: 90%; }
                    h2 { margin-bottom: 10px; }
                    p { color: #8a8d9b; font-size: 14px; }
                    a { color: #00f0ff; text-decoration: none; font-weight: bold; }
                </style>
            </head>
            <body>
                <div class="card">
                    <h2>❌ Phiên Làm Việc Hết Hạn!</h2>
                    <p>Phiên xác thực Link4M không tồn tại hoặc đã hết hạn. Vui lòng quay lại trang web để bấm lấy link mới.</p>
                    <p><a href="/">Quay về trang chủ Get Key</a></p>
                </div>
            </body>
            </html>
        `);
    }

    const session = pendingSessions.get(token);
    
    // Generate 24-Hour VIP Key
    const randomCode = crypto.randomBytes(3).toString('hex').toUpperCase();
    const generatedKey = `NHAT-HUB-L4M-${randomCode}-24H`;
    const DURATION_MS = 24 * 60 * 60 * 1000; // 24 Hours
    const expiresAt = Date.now() + DURATION_MS;

    // Save key to store bound to HWID
    keysDatabase.set(generatedKey, {
        hwid: session.hwid,
        expiresAt: expiresAt
    });

    // Remove pending session
    pendingSessions.delete(token);

    // Render Success Interface with generated Key
    res.send(`
        <!DOCTYPE html>
        <html lang="vi">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Vượt Link4M Thành Công — NHẬT HUB VIP</title>
            <script src="https://cdn.tailwindcss.com"></script>
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
            <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@500;700&family=Space+Grotesk:wght@600;700&display=swap" rel="stylesheet">
            <script src="https://cdn.jsdelivr.net/npm/canvas-confetti@1.6.0/dist/confetti.browser.min.js"></script>
            <style>
                body { background-color: #030308; color: #f1f5f9; font-family: 'Space Grotesk', sans-serif; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
                .glass { background: rgba(10, 12, 28, 0.85); backdrop-filter: blur(16px); border: 1px solid rgba(16, 185, 129, 0.4); box-shadow: 0 0 30px rgba(16, 185, 129, 0.2); }
            </style>
        </head>
        <body>
            <div class="glass p-8 sm:p-10 rounded-3xl max-w-md w-full text-center space-y-6">
                <div class="w-16 h-16 mx-auto rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center text-3xl border border-emerald-500/30 animate-bounce">
                    <i class="fa-solid fa-check"></i>
                </div>
                
                <div>
                    <h2 class="text-2xl font-bold text-white uppercase tracking-wider">VƯỢT LINK4M THÀNH CÔNG!</h2>
                    <p class="text-xs text-emerald-400 font-mono mt-1">✓ Đã xác minh thiết bị qua Link4M Gateway</p>
                </div>

                <div class="bg-black/60 p-4 rounded-2xl border border-emerald-500/40 space-y-2">
                    <p class="text-[11px] text-gray-400 font-mono">MÃ KEY NHẬT HUB VIP (24 GIỜ):</p>
                    <div class="font-mono text-emerald-400 text-lg font-bold tracking-wider select-all break-all" id="keyVal">${generatedKey}</div>
                </div>

                <button onclick="copyKey()" class="w-full py-4 bg-gradient-to-r from-emerald-500 to-teal-600 text-black font-extrabold rounded-xl text-sm font-mono tracking-wider shadow-lg shadow-emerald-500/30 hover:opacity-90 transition-all">
                    <i class="fa-solid fa-copy mr-2"></i> SAO CHÉP KEY VÀO SCRIPT
                </button>

                <div class="text-[11px] text-gray-400 font-mono text-left bg-black/40 p-4 rounded-xl space-y-1.5 border border-white/5">
                    <div>• <b>HWID Gắn Cố Định:</b> <span class="text-cyan-400">${session.hwid}</span></div>
                    <div>• <b>Thời Gian Hiệu Lực:</b> <span class="text-amber-400">24 Giờ</span></div>
                </div>
            </div>

            <script>
                confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
                function copyKey() {
                    const k = document.getElementById('keyVal').innerText;
                    navigator.clipboard.writeText(k);
                    alert("Đã copy Key thành công! Vui lòng dán vào Roblox Script.");
                }
            </script>
        </body>
        </html>
    `);
});

/**
 * API 3: Verify Key Status from Roblox Luau Script
 * GET /api/verify?key=NHAT-HUB-L4M-XXX-24H&hwid=YOUR_HWID
 */
app.get('/api/verify', (req, res) => {
    const { key, hwid } = req.query;

    if (!key || !hwid) {
        return res.status(400).json({
            success: false,
            message: 'Thiếu thông tin Key hoặc HWID!'
        });
    }

    const cleanKey = key.trim();
    const cleanHWID = hwid.trim();

    const record = keysDatabase.get(cleanKey);

    if (!record) {
        return res.json({
            success: false,
            message: 'Mã Key không tồn tại hoặc chưa được vượt qua Link4M!'
        });
    }

    if (record.hwid !== cleanHWID) {
        return res.json({
            success: false,
            message: 'Key này được cấp cho thiết bị (HWID) khác!'
        });
    }

    if (Date.now() > record.expiresAt) {
        keysDatabase.delete(cleanKey); // Purge expired key
        return res.json({
            success: false,
            message: 'Key đã hết hạn (quá 24 giờ). Vui lòng thực hiện Get Key lại qua Link4M!'
        });
    }

    const remainingSeconds = Math.floor((record.expiresAt - Date.now()) / 1000);
    const hours = Math.floor(remainingSeconds / 3600);
    const minutes = Math.floor((remainingSeconds % 3600) / 60);

    return res.json({
        success: true,
        message: 'Xác thực thành công! Quyền truy cập Nhật HUB VIP được chấp thuận.',
        formattedRemaining: `${hours} giờ ${minutes} phút`,
        expiresAt: record.expiresAt
    });
});

// Fallback route: serve index.html
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`[NHẬT HUB] Server running on port ${PORT}`);
});
