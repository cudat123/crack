const express = require('express');
const axios = require('axios');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();
const app = express();

// Cấu hình CORS - chỉ cho phép domain cụ thể nếu cần
const corsOptions = {
  origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Middleware xử lý headers
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// Route proxy chính
app.get('/api/sunwin', async (req, res) => {
  try {
    const apiUrl = 'https://astshop.io.vn/';
    
    // Lấy tất cả query parameters từ request
    const params = { ...req.query };
    
    // Đảm bảo có param 'api' = 'sunwin'
    params.api = 'sunwin';
    
    // Tạo headers với danh tính của astshop.io.vn
    const headers = {
      'Host': 'astshop.io.vn',
      'Origin': 'https://astshop.io.vn',
      'Referer': 'https://astshop.io.vn/',
      'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': req.headers['accept'] || 'application/json, text/plain, */*',
      'Accept-Language': req.headers['accept-language'] || 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
      'Accept-Encoding': req.headers['accept-encoding'] || 'gzip, deflate, br',
      'Connection': 'keep-alive',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-origin',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache'
    };

    // Thêm Authorization header nếu có
    if (req.headers.authorization) {
      headers['Authorization'] = req.headers.authorization;
    }

    // Gọi API
    const response = await axios.get(apiUrl, {
      params: params,
      headers: headers,
      timeout: 30000 // 30 seconds
    });

    // Trả về response từ API
    res.status(response.status).json(response.data);
    
  } catch (error) {
    console.error('Proxy error:', error.message);
    
    if (error.response) {
      // API trả về lỗi
      res.status(error.response.status).json({
        error: true,
        message: error.response.data?.message || 'API Error',
        status: error.response.status,
        data: error.response.data
      });
    } else if (error.request) {
      // Không nhận được response
      res.status(504).json({
        error: true,
        message: 'Gateway Timeout - No response from target API',
        code: 'PROXY_TIMEOUT'
      });
    } else {
      // Lỗi khác
      res.status(500).json({
        error: true,
        message: error.message,
        code: 'PROXY_ERROR'
      });
    }
  }
});

// Route cho POST requests (nếu API hỗ trợ)
app.post('/api/sunwin', async (req, res) => {
  try {
    const apiUrl = 'https://astshop.io.vn/';
    
    const headers = {
      'Host': 'astshop.io.vn',
      'Origin': 'https://astshop.io.vn',
      'Referer': 'https://astshop.io.vn/',
      'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Content-Type': req.headers['content-type'] || 'application/json',
      'Accept': 'application/json, text/plain, */*'
    };

    // Thêm Authorization nếu có
    if (req.headers.authorization) {
      headers['Authorization'] = req.headers.authorization;
    }

    const response = await axios.post(apiUrl, req.body, {
      params: { api: 'sunwin' },
      headers: headers,
      timeout: 30000
    });

    res.status(response.status).json(response.data);
    
  } catch (error) {
    console.error('POST Proxy error:', error.message);
    handleAxiosError(error, res);
  }
});

// Route health check
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    service: 'API Proxy Server',
    version: '1.0.0'
  });
});

// Route test proxy
app.get('/test', async (req, res) => {
  try {
    // Test kết nối đến API
    const testResponse = await axios.get('https://astshop.io.vn/', {
      params: { api: 'sunwin' },
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Origin': 'https://astshop.io.vn',
        'Referer': 'https://astshop.io.vn/'
      },
      timeout: 10000
    });
    
    res.json({
      success: true,
      message: 'Proxy server is working',
      apiStatus: testResponse.status,
      proxyUrl: `${req.protocol}://${req.get('host')}/api/sunwin`
    });
  } catch (error) {
    res.json({
      success: false,
      message: 'Cannot connect to target API',
      error: error.message
    });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: true,
    message: 'Route not found',
    availableRoutes: [
      'GET /api/sunwin',
      'POST /api/sunwin',
      'GET /health',
      'GET /test'
    ]
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({
    error: true,
    message: 'Internal server error',
    details: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Hàm xử lý lỗi axios
function handleAxiosError(error, res) {
  if (error.response) {
    res.status(error.response.status).json({
      error: true,
      message: error.response.data?.message || 'API Error',
      status: error.response.status
    });
  } else if (error.request) {
    res.status(504).json({
      error: true,
      message: 'Gateway Timeout',
      code: 'PROXY_TIMEOUT'
    });
  } else {
    res.status(500).json({
      error: true,
      message: error.message,
      code: 'PROXY_ERROR'
    });
  }
}

// Khởi động server
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

app.listen(PORT, HOST, () => {
  console.log(`🚀 Proxy server running on http://${HOST}:${PORT}`);
  console.log(`📡 API Endpoint: http://${HOST}:${PORT}/api/sunwin`);
  console.log(`🏥 Health check: http://${HOST}:${PORT}/health`);
  console.log(`🔧 Test endpoint: http://${HOST}:${PORT}/test`);
});