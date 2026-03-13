// ================== NODEJS - AUTO COLLECT HISTORY & PREDICT ==================
const https = require('https');
const express = require('express');
const path = require('path');

const app = express();
const PORT = 3000;

// Config
const HOST = 'phanmemgame.com';
const GAMES = {
    lc79: { api: '/lc79_api.php', predict: '/predictor.php', name: 'LC79' },
    '68gb': { api: '/68gb_api.php', predict: '/predictor.php', name: '68 GAME BÀI' },
    sunwin: { api: '/sunwin_api.php', predict: '/predictor.php', name: 'SUNWIN' },
    son789: { api: '/son789_api.php', predict: '/predictor.php', name: 'SON789' }
};

// Header fake
const HEADERS = {
    'Referer': `https://${HOST}/`,
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Origin': `https://${HOST}`
};

// Lưu trạng thái từng game
let gameStates = {};

Object.keys(GAMES).forEach(game => {
    gameStates[game] = {
        history: [],
        currentData: null,
        lastPhien: 0,
        lastPrediction: null,
        collecting: true
    };
});

app.use(express.json());

// Hàm fetch API game
function fetchGameData(gameId) {
    const game = GAMES[gameId];
    const state = gameStates[gameId];
    
    const options = {
        hostname: HOST,
        path: game.api + '?t=' + Date.now(),
        method: 'GET',
        headers: HEADERS
    };

    const req = https.request(options, (res) => {
        let data = '';
        
        res.on('data', chunk => data += chunk);
        
        res.on('end', () => {
            try {
                const json = JSON.parse(data);
                
                if (json.Phien && json.Phien !== state.lastPhien) {
                    const ketqua = json.Ket_qua || (json.Tong >= 11 ? 'Tài' : 'Xỉu');
                    
                    // Lưu current data
                    state.currentData = {
                        Phien: json.Phien,
                        Xuc_xac_1: json.Xuc_xac_1,
                        Xuc_xac_2: json.Xuc_xac_2,
                        Xuc_xac_3: json.Xuc_xac_3,
                        Tong: json.Tong,
                        Ket_qua: ketqua,
                        time: new Date().toLocaleTimeString('vi-VN')
                    };
                    
                    // Thêm vào history
                    const exists = state.history.some(h => h.Phien === json.Phien);
                    if (!exists) {
                        state.history.push({
                            Phien: json.Phien,
                            Ket_qua: ketqua,
                            Tong: json.Tong
                        });
                        
                        if (state.history.length > 20) {
                            state.history.shift();
                        }
                        
                        console.log(`✅ [${game.name}] Phiên ${json.Phien}: ${ketqua} (${json.Tong})`);
                        
                        // Khi đủ 3 phiên thì dự đoán
                        if (state.history.length >= 3 && !state.collecting) {
                            predictGame(gameId);
                        } else if (state.history.length >= 3) {
                            state.collecting = false;
                            predictGame(gameId);
                        }
                    }
                    
                    state.lastPhien = json.Phien;
                }
                
            } catch (e) {
                console.log(`❌ [${game.name}] Lỗi parse:`, e.message);
            }
        });
    });

    req.on('error', (e) => {
        console.log(`❌ [${game.name}] Lỗi fetch:`, e.message);
    });

    req.end();
}

// Hàm dự đoán
function predictGame(gameId) {
    const game = GAMES[gameId];
    const state = gameStates[gameId];
    
    if (state.history.length < 3) return;
    
    const formattedHistory = state.history.map(h => ({
        session: h.Phien,
        result: h.Ket_qua,
        totalScore: h.Tong
    }));
    
    const postData = 'history=' + encodeURIComponent(JSON.stringify(formattedHistory));
    
    const options = {
        hostname: HOST,
        path: game.predict,
        method: 'POST',
        headers: {
            ...HEADERS,
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(postData)
        }
    };

    const req = https.request(options, (res) => {
        let data = '';
        
        res.on('data', chunk => data += chunk);
        
        res.on('end', () => {
            try {
                const json = JSON.parse(data);
                
                // Lưu dự đoán theo format mới
                state.lastPrediction = {
                    phien_hien_tai: state.currentData?.Phien || 0,
                    phien_du_doan: json.session || (state.lastPhien + 1),
                    du_doan: json.prediction || '???',
                    do_tin_cay: json.confidence || 0
                };
                
                console.log(`🔮 [${game.name}] Dự đoán: ${json.prediction} (${json.confidence || 0}%)`);
                
            } catch (e) {
                console.log(`❌ [${game.name}] Lỗi predict:`, e.message);
            }
        });
    });

    req.on('error', (e) => {
        console.log(`❌ [${game.name}] Lỗi predict:`, e.message);
    });

    req.write(postData);
    req.end();
}

// ================== API CHÍNH - FORMAT THEO YÊU CẦU ==================

// API cho từng game - format đúng yêu cầu
app.get('/api/:game', (req, res) => {
    const gameId = req.params.game;
    
    if (!GAMES[gameId]) {
        return res.status(404).json({
            error: 'Game không tồn tại',
            available: Object.keys(GAMES)
        });
    }
    
    const state = gameStates[gameId];
    
    // Nếu chưa có dữ liệu
    if (!state.currentData) {
        return res.json({
            Phien: 0,
            Xuc_xac_1: 0,
            Xuc_xac_2: 0,
            Xuc_xac_3: 0,
            Tong: 0,
            Ket_qua: "Đang thu thập...",
            time: new Date().toLocaleTimeString('vi-VN'),
            phien_hien_tai: 0,
            phien_du_doan: 0,
            du_doan: "Đang thu thập...",
            do_tin_cay: 0
        });
    }
    
    // Format theo yêu cầu: data gốc + 4 trường dự đoán
    const response = {
        // Data gốc từ API
        Phien: state.currentData.Phien,
        Xuc_xac_1: state.currentData.Xuc_xac_1,
        Xuc_xac_2: state.currentData.Xuc_xac_2,
        Xuc_xac_3: state.currentData.Xuc_xac_3,
        Tong: state.currentData.Tong,
        Ket_qua: state.currentData.Ket_qua,
        time: state.currentData.time,
        
        // 4 trường dự đoán
        phien_hien_tai: state.currentData.Phien,
        phien_du_doan: state.lastPrediction?.phien_du_doan || (state.lastPhien + 1),
        du_doan: state.lastPrediction?.du_doan || "Đang tính...",
        do_tin_cay: state.lastPrediction?.do_tin_cay || 0
    };
    
    res.json(response);
});

// API chỉ lấy dự đoán
app.get('/api/:game/prediction', (req, res) => {
    const gameId = req.params.game;
    
    if (!GAMES[gameId]) {
        return res.status(404).json({ error: 'Game không tồn tại' });
    }
    
    const state = gameStates[gameId];
    
    if (!state.lastPrediction) {
        return res.json({
            phien_hien_tai: state.currentData?.Phien || 0,
            phien_du_doan: state.lastPhien + 1,
            du_doan: "Đang tính...",
            do_tin_cay: 0
        });
    }
    
    res.json(state.lastPrediction);
});

// API lấy data gốc
app.get('/api/:game/raw', (req, res) => {
    const gameId = req.params.game;
    
    if (!GAMES[gameId]) {
        return res.status(404).json({ error: 'Game không tồn tại' });
    }
    
    const state = gameStates[gameId];
    
    if (!state.currentData) {
        return res.json({ message: 'Đang thu thập...' });
    }
    
    res.json(state.currentData);
});

// Fetch data mỗi 3 giây
Object.keys(GAMES).forEach(gameId => {
    setInterval(() => fetchGameData(gameId), 3000);
});

// Fetch lần đầu
setTimeout(() => {
    Object.keys(GAMES).forEach(gameId => {
        fetchGameData(gameId);
    });
}, 1000);

app.listen(PORT, () => {
    console.log(`🚀 Server chạy ở http://localhost:${PORT}`);
    console.log('\n📊 Các API:');
    console.log('   - GET /api/lc79    (format chuẩn)');
    console.log('   - GET /api/68gb');
    console.log('   - GET /api/sunwin');
    console.log('   - GET /api/son789');
    console.log('   - GET /api/:game/prediction (chỉ dự đoán)');
    console.log('   - GET /api/:game/raw (data gốc)\n');
});
