const express = require('express');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3000;

// Config các game
const GAMES = {
    lc79: {
        api: '/lc79_api.php',
        predict: '/predictor.php',
        host: 'phanmemgame.com'
    },
    '68gb': {
        api: '/68gb_api.php',
        predict: '/predictor.php',
        host: 'phanmemgame.com'
    },
    sunwin: {
        api: '/sunwin_api.php',
        predict: '/predictor.php',
        host: 'phanmemgame.com'
    },
    son789: {
        api: '/son789_api.php',
        predict: '/predictor.php',
        host: 'phanmemgame.com'
    }
};

// Header fake
const HEADERS = {
    'Referer': 'https://phanmemgame.com/',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Origin': 'https://phanmemgame.com'
};

// Lưu data
let gameData = {};
let gameHistory = {};

Object.keys(GAMES).forEach(game => {
    gameData[game] = null;
    gameHistory[game] = [];
});

app.use(express.json());

// Hàm fetch API gốc
function fetchGameData(gameId) {
    const game = GAMES[gameId];
    
    const options = {
        hostname: game.host,
        path: game.api + '?t=' + Date.now(),
        method: 'GET',
        headers: HEADERS
    };
    
    const reqFetch = https.request(options, (res) => {
        let data = '';
        
        res.on('data', chunk => data += chunk);
        
        res.on('end', () => {
            try {
                const json = JSON.parse(data);
                
                // Lưu data hiện tại
                gameData[gameId] = json;
                
                // Lưu history nếu có phiên mới
                if (json.Phien) {
                    // Kiểm tra xem phiên này đã có chưa
                    const exists = gameHistory[gameId].some(h => h.Phien === json.Phien);
                    
                    if (!exists) {
                        gameHistory[gameId].push({
                            Phien: json.Phien,
                            Ket_qua: json.Ket_qua,
                            Tong: json.Tong,
                            Xuc_xac_1: json.Xuc_xac_1,
                            Xuc_xac_2: json.Xuc_xac_2,
                            Xuc_xac_3: json.Xuc_xac_3
                        });
                        
                        console.log(`📝 [${gameId}] Thêm history phiên ${json.Phien}`);
                    }
                    
                    // Giữ 50 phiên gần nhất
                    if (gameHistory[gameId].length > 50) {
                        gameHistory[gameId].shift();
                    }
                }
                
                console.log(`✅ [${gameId}] Phiên ${json.Phien}: ${json.Ket_qua} (${json.Tong})`);
                
            } catch (e) {
                console.log(`❌ [${gameId}] Lỗi:`, e.message);
            }
        });
    });
    
    reqFetch.on('error', (e) => {
        console.log(`❌ [${gameId}] Lỗi fetch:`, e.message);
    });
    
    reqFetch.end();
}

// Hàm gọi predictor riêng
function callPredictor(gameId, historyData) {
    return new Promise((resolve, reject) => {
        const game = GAMES[gameId];
        
        // Chuẩn bị history đúng format tụi nó cần
        const formattedHistory = historyData.map(h => ({
            session: h.Phien,
            result: h.Ket_qua,
            totalScore: h.Tong
        }));
        
        const postData = 'history=' + encodeURIComponent(JSON.stringify(formattedHistory));
        
        const options = {
            hostname: game.host,
            path: game.predict,
            method: 'POST',
            headers: {
                ...HEADERS,
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(postData)
            }
        };
        
        const reqPredict = https.request(options, (response) => {
            let data = '';
            
            response.on('data', chunk => data += chunk);
            
            response.on('end', () => {
                try {
                    const result = JSON.parse(data);
                    resolve(result);
                } catch (e) {
                    reject(e);
                }
            });
        });
        
        reqPredict.on('error', reject);
        reqPredict.write(postData);
        reqPredict.end();
    });
}

// API lấy data game kèm dự đoán
Object.keys(GAMES).forEach(gameId => {
    app.get(`/api/${gameId}`, async (req, res) => {
        const currentData = gameData[gameId];
        
        if (!currentData) {
            return res.json({
                message: 'Đang lấy dữ liệu...',
                status: 'loading'
            });
        }
        
        try {
            let du_doan_goc = null;
            
            // Chỉ gọi predictor nếu có ít nhất 3 phiên history
            if (gameHistory[gameId].length >= 3) {
                du_doan_goc = await callPredictor(gameId, gameHistory[gameId]);
                console.log(`🔮 [${gameId}] Dự đoán:`, du_doan_goc);
            } else {
                console.log(`⏳ [${gameId}] Đang thu thập history... (${gameHistory[gameId].length}/3)`);
            }
            
            res.json({
                ...currentData,
                du_doan_goc: du_doan_goc,
                so_luong_history: gameHistory[gameId].length
            });
            
        } catch (e) {
            res.json({
                ...currentData,
                du_doan_goc: { error: 'predict_failed', message: e.message },
                so_luong_history: gameHistory[gameId].length
            });
        }
    });
});

// API riêng để xem history
Object.keys(GAMES).forEach(gameId => {
    app.get(`/api/${gameId}/history`, (req, res) => {
        res.json({
            game: gameId,
            history: gameHistory[gameId],
            so_luong: gameHistory[gameId].length
        });
    });
});

// API gọi predictor riêng
Object.keys(GAMES).forEach(gameId => {
    app.get(`/api/${gameId}/predict`, async (req, res) => {
        if (gameHistory[gameId].length < 3) {
            return res.json({
                message: 'Cần thêm history',
                current: gameHistory[gameId].length,
                need: 3
            });
        }
        
        try {
            const result = await callPredictor(gameId, gameHistory[gameId]);
            res.json(result);
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });
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
    console.log('📊 Các game:');
    Object.keys(GAMES).forEach(game => {
        console.log(`   - ${game}: http://localhost:${PORT}/api/${game}`);
    });
    console.log('\n⏳ Cần ít nhất 3 phiên để dự đoán...');
});
