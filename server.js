const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const path = require('path');

const app = express();
app.use(express.json());

// API Token Link4M của bạn
const LINK4M_TOKEN = '6abb3a6daf162d46ec29b472'; 

// Lưu trữ dữ liệu trong bộ nhớ tạm
const keysDatabase = {}; 
const pendingSessions = {};

// Phục vụ file giao diện tĩnh từ thư mục 'public'
app.use(express.static(path.join(__dirname, 'public')));

// Trả về file index.html cho trang chủ
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API 1: Tạo Link Rút Gọn qua Link4M dựa theo HWID
app.get('/api/generate-link', async (req, res) => {
    const { hwid } = req.query;
    if (!hwid) {
        return res.status(400).json({ success: false, error: 'Thiếu thông tin HWID' });
    }

    // Tạo session token ngẫu nhiên
    const sessionToken = crypto.randomBytes(16).toString('hex');
    pendingSessions[sessionToken] = { hwid, createdAt: Date.now() };

    // Tự động nhận diện Domain hiện tại trên Render
    const domain = `${req.protocol}://${req.get('host')}`;
    const destinationUrl = `${domain}/api/callback?token=${sessionToken}`;

    try {
        const response = await axios.get(`https://link4m.co/api-shorten`, {
            params: { api: LINK4M_TOKEN, url: destinationUrl }
        });

        if (response.data && response.data.shortenedUrl) {
            return res.json({ success: true, link: response.data.shortenedUrl });
        } else {
            // Dự phòng nếu API Link4M phản hồi định dạng khác
            return res.json({ 
                success: true, 
                link: `https://link4m.co/st?api=${LINK4M_TOKEN}&url=${encodeURIComponent(destinationUrl)}` 
            });
        }
    } catch (err) {
        console.error('Lỗi khi gọi API Link4M:', err.message);
        // Link fallback dự phòng
        return res.json({ 
            success: true, 
            link: `https://link4m.co/st?api=${LINK4M_TOKEN}&url=${encodeURIComponent(destinationUrl)}` 
        });
    }
});

// API 2: Nhận kết quả sau khi người dùng vượt link Link4M thành công
app.get('/api/callback', (req, res) => {
    const { token } = req.query;
    const session = pendingSessions[token];

    if (!session) {
        return res.status(400).send(`
            <div style="font-family:sans-serif; text-align:center; padding:50px; background:#0f172a; color:#f87171; height:100vh;">
                <h2>Phiên làm việc đã hết hạn hoặc không hợp lệ!</h2>
                <p>Vui lòng quay lại giao diện và bấm nút lấy lại Link.</p>
            </div>
        `);
    }

    // Tạo Key 24 giờ cho HWID này
    const generatedKey = 'NHAT-HUB-' + crypto.randomBytes(4).toString('hex').toUpperCase();
    const expiresAt = Date.now() + (24 * 60 * 60 * 1000); // 24 tiếng

    keysDatabase[generatedKey] = {
        key: generatedKey,
        hwid: session.hwid,
        expiresAt: expiresAt
    };

    delete pendingSessions[token];

    res.send(`
        <!DOCTYPE html>
        <html lang="vi">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Lấy Key Thành Công - Nhật HUB</title>
            <style>
                body { background-color: #0f172a; color: #ffffff; font-family: Arial, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
                .card { background-color: #1e293b; padding: 30px; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); text-align: center; max-width: 400px; width: 90%; border: 1px solid #334155; }
                h2 { color: #22c55e; margin-bottom: 10px; }
                .key-box { font-size: 20px; font-weight: bold; padding: 12px; background: #0f172a; color: #38bdf8; border: 2px dashed #38bdf8; border-radius: 8px; margin: 20px 0; word-break: break-all; }
                p { color: #94a3b8; font-size: 14px; line-height: 1.5; }
                .btn { background: #38bdf8; color: #0f172a; border: none; padding: 10px 20px; font-weight: bold; border-radius: 6px; cursor: pointer; margin-top: 10px; }
            </style>
        </head>
        <body>
            <div class="card">
                <h2>🎉 VƯỢT LINK THÀNH CÔNG!</h2>
                <p>HWID của bạn đã được ghi nhận vào hệ thống.</p>
                <div class="key-box" id="keyBox">${generatedKey}</div>
                <button class="btn" onclick="navigator.clipboard.writeText('${generatedKey}'); alert('Đã sao chép Key thành công!');">Sao chép Key</button>
                <p style="margin-top: 15px;">Key có hiệu lực trong <b>24 Giờ</b>. Vui lòng dán Key này vào Script trong Roblox.</p>
            </div>
        </body>
        </html>
    `);
});

// API 3: Xác thực Key cho Script Roblox Luau
app.get('/api/verify', (req, res) => {
    const { key, hwid } = req.query;

    if (!key || !hwid) {
        return res.json({ success: false, message: 'Thiếu thông tin Key hoặc HWID!' });
    }

    const keyData = keysDatabase[key];

    if (!keyData) {
        return res.json({ success: false, message: 'Key không tồn tại hoặc không hợp lệ!' });
    }

    if (keyData.hwid !== hwid) {
        return res.json({ success: false, message: 'Key này được tạo cho thiết bị khác (HWID không khớp)!' });
    }

    const now = Date.now();
    if (now > keyData.expiresAt) {
        delete keysDatabase[key];
        return res.json({ success: false, message: 'Key đã hết hạn sử dụng (24 giờ)!' });
    }

    const remainingMs = keyData.expiresAt - now;
    const remainingSec = Math.floor(remainingMs / 1000);
    const hours = Math.floor(remainingSec / 3600);
    const minutes = Math.floor((remainingSec % 3600) / 60);

    return res.json({
        success: true,
        message: 'Xác thực Key thành công!',
        formattedRemaining: `${hours} giờ ${minutes} phút`
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
