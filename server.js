const express = require('express');
const axios = require('axios');
const crypto = require('crypto');

const app = express();
app.use(express.json());
app.get('/', (req, res) => {
        res.sendFile(__dirname + '/index.html');
        });
        
})

// THAY TOKEN LINK4M CỦA BẠN VÀO ĐÂY
const LINK4M_TOKEN = '6abb3a6daf162d46ec29b472'; 

const keysDatabase = {}; 
const pendingSessions = {};

app.get('/api/generate-link', async (req, res) => {
    const { hwid } = req.query;
    if (!hwid) return res.status(400).json({ error: 'Thiếu HWID' });

    const sessionToken = crypto.randomBytes(16).toString('hex');
    pendingSessions[sessionToken] = { hwid, createdAt: Date.now() };

    const domain = `${req.protocol}://${req.get('host')}`;
    const destinationUrl = `${domain}/api/callback?token=${sessionToken}`;

    try {
        const response = await axios.get(`https://link4m.co/api-shorten`, {
            params: { api: LINK4M_TOKEN, url: destinationUrl }
        });

        if (response.data && response.data.shortenedUrl) {
            return res.json({ success: true, link: response.data.shortenedUrl });
        } else {
            return res.json({ success: true, link: `https://link4m.co/st?api=${LINK4M_TOKEN}&url=${encodeURIComponent(destinationUrl)}` });
        }
    } catch (err) {
        return res.status(500).json({ error: 'Lỗi server tạo link' });
    }
});

app.get('/api/callback', (req, res) => {
    const { token } = req.query;
    const session = pendingSessions[token];

    if (!session) {
        return res.send('<h2 style="color:white;background:#0f172a;height:100vh;text-align:center;padding-top:50px;">Session hết hạn! Hãy thử lại.</h2>');
    }

    const generatedKey = 'NHAT-HUB-' + crypto.randomBytes(4).toString('hex').toUpperCase();
    const expiresAt = Date.now() + (24 * 60 * 60 * 1000); // 24 tiếng

    keysDatabase[generatedKey] = {
        key: generatedKey,
        hwid: session.hwid,
        expiresAt: expiresAt
    };

    delete pendingSessions[token];

    res.send(`
        <div style="font-family:sans-serif; text-align:center; padding:30px; background:#0f172a; color:#fff; height:100vh;">
            <h2 style="color:#22c55e;">Lấy Key Thành Công!</h2>
            <p>HWID: <b>${session.hwid}</b></p>
            <p>Key 24 Giờ của bạn:</p>
            <input value="${generatedKey}" style="font-size:18px; padding:10px; width:80%; text-align:center; background:#1e293b; color:#38bdf8; border:1px solid #38bdf8; border-radius:6px;" readonly />
            <p style="color:#94a3b8; font-size:14px; margin-top:20px;">Hãy sao chép Key này và dán vào Script trong Roblox.</p>
        </div>
    `);
});

app.get('/api/verify', (req, res) => {
    const { key, hwid } = req.query;

    if (!key || !hwid) return res.json({ success: false, message: 'Thiếu thông tin!' });

    const keyData = keysDatabase[key];
    if (!keyData) return res.json({ success: false, message: 'Key không tồn tại!' });
    if (keyData.hwid !== hwid) return res.json({ success: false, message: 'Key dùng cho máy khác!' });

    const now = Date.now();
    if (now > keyData.expiresAt) {
        delete keysDatabase[key];
        return res.json({ success: false, message: 'Key đã hết hạn 24h!' });
    }

    const remainingMs = keyData.expiresAt - now;
    const remainingSec = Math.floor(remainingMs / 1000);
    const hours = Math.floor(remainingSec / 3600);
    const minutes = Math.floor((remainingSec % 3600) / 60);

    return res.json({
        success: true,
        message: 'Xác thực thành công!',
        formattedRemaining: `${hours} giờ ${minutes} phút`
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
