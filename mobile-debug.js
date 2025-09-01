const http = require('http');

const server = http.createServer((req, res) => {
  const clientIP = req.connection.remoteAddress || req.socket.remoteAddress;
  const userAgent = req.headers['user-agent'] || 'Unknown';
  const timestamp = new Date().toISOString();
  
  console.log(`${timestamp} - 移动端访问测试: ${clientIP}`);
  console.log(`Headers:`, JSON.stringify(req.headers, null, 2));
  
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
  });
  
  res.end(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>移动端连接测试</title>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
            * { box-sizing: border-box; }
            body { 
                font-family: -apple-system, BlinkMacSystemFont, sans-serif;
                margin: 0; 
                padding: 15px; 
                background: #f0f8ff;
                font-size: 16px;
                line-height: 1.5;
            }
            .container { 
                max-width: 100%;
                background: white; 
                padding: 20px; 
                border-radius: 10px; 
                box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            }
            .success { 
                color: #28a745; 
                font-size: 24px; 
                text-align: center; 
                margin-bottom: 20px;
                font-weight: bold;
            }
            .info { 
                background: #e9f7ef; 
                padding: 15px; 
                border-radius: 8px; 
                margin: 15px 0;
                border-left: 4px solid #28a745;
            }
            .warning {
                background: #fff3cd;
                border-left: 4px solid #ffc107;
                color: #856404;
            }
            .test-link {
                display: block;
                width: 100%;
                padding: 15px;
                margin: 10px 0;
                background: #007bff;
                color: white;
                text-decoration: none;
                border-radius: 8px;
                text-align: center;
                font-size: 18px;
                font-weight: bold;
            }
            .test-link:hover {
                background: #0056b3;
            }
            .code {
                font-family: monospace;
                background: #f8f9fa;
                padding: 8px;
                border-radius: 4px;
                word-break: break-all;
                font-size: 14px;
            }
            h3 { margin-top: 0; color: #333; }
            ul { margin: 10px 0; padding-left: 20px; }
            li { margin: 5px 0; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="success">✅ 移动端HTTP连接成功！</div>
            
            <div class="info">
                <h3>📱 连接信息</h3>
                <p><strong>时间:</strong> ${new Date().toLocaleString('zh-CN')}</p>
                <p><strong>您的IP:</strong> <span class="code">${clientIP}</span></p>
                <p><strong>设备类型:</strong> ${userAgent.includes('Mobile') ? '📱 移动设备' : '💻 桌面设备'}</p>
                <p><strong>浏览器:</strong> <span class="code">${userAgent}</span></p>
            </div>
            
            <div class="info">
                <h3>🎉 测试结果</h3>
                <p>恭喜！您的移动设备可以通过HTTP正常访问服务器。这证明：</p>
                <ul>
                    <li>✅ 网络连接正常</li>
                    <li>✅ 防火墙配置正确</li>
                    <li>✅ HTTP协议工作正常</li>
                    <li>✅ 移动端浏览器支持正常</li>
                </ul>
            </div>
            
            <div class="info warning">
                <h3>⚠️ HTTPS问题说明</h3>
                <p>如果您之前看到SSL错误，这是因为：</p>
                <ul>
                    <li>浏览器自动将HTTP升级为HTTPS</li>
                    <li>但我们的服务器只支持HTTP</li>
                    <li>解决方案：确保使用HTTP地址访问</li>
                </ul>
            </div>
            
            <div class="info">
                <h3>🔗 访问主服务</h3>
                <p>现在可以访问完整的IIR OCOMM系统：</p>
                <a href="http://192.168.2.187:8000" class="test-link">
                    🚀 打开 IIR OCOMM 系统
                </a>
                <p style="text-align: center; font-size: 14px; color: #666;">
                    点击上方按钮访问主服务
                </p>
            </div>
            
            <div class="info">
                <h3>📋 移动端使用技巧</h3>
                <ul>
                    <li>🔖 将此页面添加到主屏幕以便快速访问</li>
                    <li>🔄 如果页面不加载，尝试刷新浏览器</li>
                    <li>📶 确保WiFi连接稳定</li>
                    <li>🚫 关闭VPN（如果有的话）</li>
                </ul>
            </div>
        </div>
        
        <script>
            console.log('移动端测试页面加载完成');
            console.log('当前URL:', window.location.href);
            console.log('协议:', window.location.protocol);
            console.log('主机:', window.location.host);
            
            // 检测网络状态
            if (navigator.onLine) {
                console.log('✅ 网络连接正常');
            } else {
                console.log('❌ 网络连接异常');
            }
            
            // 自动跳转测试
            setTimeout(() => {
                console.log('准备测试主服务连接...');
            }, 2000);
        </script>
    </body>
    </html>
  `);
});

server.listen(8001, '0.0.0.0', () => {
  console.log('📱 移动端HTTP测试服务器启动');
  console.log('🌐 测试地址: http://192.168.2.187:8001');
  console.log('');
  console.log('请在手机浏览器中访问上述地址');
  console.log('确保使用 HTTP 而不是 HTTPS');
  console.log('按 Ctrl+C 停止测试');
});
