const express = require('express');
const https = require('https');

const app = express();
const PORT = 3000;

// Config các game
const GAMES = {
    lc79: {
        api: '/lc79_api.php',
        predict: '/predictor.php',
        host: 'phanmemgame.com',
        name: 'LC79'
    },
    '68gb': {
        api: '/68gb_api.php',
        predict: '/predictor.php',
        host: 'phanmemgame.com',
        name: '68 GAME BÀI'
    },
    sunwin: {
        api: '/sunwin_api.php',
        predict: '/predictor.php',
        host: 'phanmemgame.com',
        name: 'SUNWIN'
    },
    son789: {
        api: '/son789_api.php',
        predict: '/predictor.php',
        host: 'phanmemgame.com',
        name: 'SON789'
    }
};

// Header fake
const HEADERS = {
    'Referer': 'https://phanmemgame.com/',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Origin': 'https://phanmemgame.com'
};

// Lưu data từng game
let gameStates = {};

Object.keys(GAMES).forEach(game => {
    gameStates[game] = {
        currentData: null,
        phien_hien_tai: null,
        du_doan: null,
        do_tin_cay: null,
        history: []
    };
});

// Middleware
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
    
    const req = https.request(options, (res) => {
        let data = '';
        
        res.on('data', chunk => data += chunk);
        
        res.on('end', () => {
            try {
                const json = JSON.parse(data);
                
                // Lưu current data
                gameStates[gameId].currentData = json;
                
                // Lưu history
                if (json.Phien) {
                    gameStates[gameId].history.push({
                        Phien: json.Phien,
                        Ket_qua: json.Ket_qua,
                        Tong: json.Tong
                    });
                    
                    if (gameStates[gameId].history.length > 30) {
                        gameStates[gameId].history.shift();
                    }
                    
                    // Gọi dự đoán
                    setTimeout(() => predictGame(gameId), 15000);
                }
                
                console.log(`✅ [${gameId}] Phiên ${json.Phien}: ${json.Tong} - ${json.Ket_qua}`);
                
            } catch (e) {
                console.log(`❌ [${gameId}] Lỗi:`, e.message);
            }
        });
    });
    
    req.on('error', (e) => {
        console.log(`❌ [${gameId}] Lỗi fetch:`, e.message);
    });
    
    req.end();
}

// Hàm dự đoán
function predictGame(gameId) {
    const game = GAMES[gameId];
    const state = gameStates[gameId];
    
    if (!state.currentData || state.history.length < 3) return;
    
    const postData = 'history=' + encodeURIComponent(JSON.stringify(state.history));
    
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
    
    const req = https.request(options, (res) => {
        let data = '';
        
        res.on('data', chunk => data += chunk);
        
        res.on('end', () => {
            try {
                const result = JSON.parse(data);
                
                // Cập nhật các trường riêng lẻ
                state.phien_hien_tai = state.currentData.Phien + 1;
                state.du_doan = result.prediction || '???';
                state.do_tin_cay = result.confidence || 0;
                
                console.log(`🔮 [${gameId}] Dự đoán: ${result.prediction} (${result.confidence}%)`);
                
            } catch (e) {
                console.log(`❌ [${gameId}] Lỗi predict:`, e.message);
            }
        });
    });
    
    req.on('error', (e) => {
        console.log(`❌ [${gameId}] Lỗi predict:`, e.message);
    });
    
    req.write(postData);
    req.end();
}

// API trả về JSON theo đúng format mới
Object.keys(GAMES).forEach(gameId => {
    app.get(`/api/${gameId}`, (req, res) => {
        const state = gameStates[gameId];
        
        if (!state.currentData) {
            return res.json({
                message: 'Đang lấy dữ liệu...',
                status: 'loading'
            });
        }
        
        // Tạo response theo đúng format yêu cầu
        const responseData = {
            Phien: state.currentData.Phien,
            Xuc_xac_1: state.currentData.Xuc_xac_1,
            Xuc_xac_2: state.currentData.Xuc_xac_2,
            Xuc_xac_3: state.currentData.Xuc_xac_3,
            Tong: state.currentData.Tong,
            Ket_qua: state.currentData.Ket_qua,
            id: state.currentData.id || "Cskhtool11",
            updatedAt: state.currentData.updatedAt || new Date().toISOString(),
            phien_hien_tai: state.phien_hien_tai || state.currentData.Phien + 1,
            du_doan: state.du_doan || "Đang tính...",
            do_tin_cay: state.do_tin_cay || 0
        };
        
        res.json(responseData);
    });
});

// API riêng lấy dự đoán
Object.keys(GAMES).forEach(gameId => {
    app.get(`/api/${gameId}/du-doan`, (req, res) => {
        const state = gameStates[gameId];
        
        res.json({
            phien_hien_tai: state.phien_hien_tai,
            du_doan: state.du_doan,
            do_tin_cay: state.do_tin_cay,
            thoi_gian: new Date().toLocaleTimeString('vi-VN')
        });
    });
});

// Chạy fetch cho tất cả game
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
        console.log(`   - ${GAMES[game].name}: http://localhost:${PORT}/api/${game}`);
    });
});
