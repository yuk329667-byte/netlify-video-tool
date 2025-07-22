# 使用官方Node.js镜像
FROM node:16-slim

# 设置工作目录
WORKDIR /app

# 安装系统依赖
RUN apt-get update && apt-get install -y \
    ffmpeg \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# 复制package文件
COPY package*.json ./

# 设置npm配置
RUN npm config set registry https://registry.npmmirror.com

# 安装依赖
RUN npm ci --only=production

# 复制源代码
COPY . .

# 创建必要的目录
RUN mkdir -p uploads/processed

# 设置环境变量
ENV NODE_ENV=production
ENV PORT=3000

# 暴露端口
EXPOSE 3000

# 设置用户权限
RUN chown -R node:node /app
USER node

# 启动应用
CMD ["npm", "start"]

