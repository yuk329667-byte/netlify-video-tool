FROM node:16

WORKDIR /app

# 安装FFmpeg（已修复）
RUN apt-get update && apt-get install -y ffmpeg

# 复制package.json和package-lock.json
COPY package*.json ./

# 安装依赖
RUN npm install

# 复制项目文件
COPY . .

# 构建前端
RUN npm run build

# 暴露端口
EXPOSE 3000

# 启动应用
CMD ["npm", "start"]
