#!/bin/bash

# 创建自签名SSL证书用于本地开发
echo "创建自签名SSL证书..."

# 创建证书目录
mkdir -p ssl

# 生成私钥
openssl genrsa -out ssl/server.key 2048

# 生成证书签名请求
openssl req -new -key ssl/server.key -out ssl/server.csr -subj "/C=CN/ST=Beijing/L=Beijing/O=IIR OCOMM/OU=Development/CN=192.168.2.187"

# 生成自签名证书
openssl x509 -req -days 365 -in ssl/server.csr -signkey ssl/server.key -out ssl/server.crt

# 设置权限
chmod 600 ssl/server.key
chmod 644 ssl/server.crt

echo "SSL证书创建完成！"
echo "证书文件: ssl/server.crt"
echo "私钥文件: ssl/server.key"
