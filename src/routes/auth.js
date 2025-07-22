const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();

// 模拟数据库
const users = new Map();

// JWT密钥
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-here';

// 注册
router.post('/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;
        
        // 验证输入
        if (!username || !email || !password) {
            return res.status(400).json({ error: '请填写所有必填字段' });
        }
        
        if (password.length < 6) {
            return res.status(400).json({ error: '密码至少需要6个字符' });
        }
        
        // 检查用户是否已存在
        for (const user of users.values()) {
            if (user.email === email) {
                return res.status(400).json({ error: '邮箱已被注册' });
            }
            if (user.username === username) {
                return res.status(400).json({ error: '用户名已被使用' });
            }
        }
        
        // 加密密码
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // 创建用户
        const userId = uuidv4();
        const user = {
            id: userId,
            username,
            email,
            password: hashedPassword,
            userType: 'free',
            createdAt: new Date().toISOString(),
            lastLogin: null
        };
        
        users.set(userId, user);
        
        // 生成JWT token
        const token = jwt.sign(
            { userId: user.id, username: user.username, userType: user.userType },
            JWT_SECRET,
            { expiresIn: '7d' }
        );
        
        // 返回用户信息（不包含密码）
        const { password: _, ...userResponse } = user;
        
        res.status(201).json({
            message: '注册成功',
            user: userResponse,
            token
        });
        
    } catch (error) {
        console.error('注册错误:', error);
        res.status(500).json({ error: '服务器内部错误' });
    }
});

// 登录
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        // 验证输入
        if (!email || !password) {
            return res.status(400).json({ error: '请输入邮箱和密码' });
        }
        
        // 查找用户
        let user = null;
        for (const u of users.values()) {
            if (u.email === email) {
                user = u;
                break;
            }
        }
        
        if (!user) {
            return res.status(401).json({ error: '邮箱或密码错误' });
        }
        
        // 验证密码
        const isValidPassword = await bcrypt.compare(password, user.password);
        if (!isValidPassword) {
            return res.status(401).json({ error: '邮箱或密码错误' });
        }
        
        // 更新最后登录时间
        user.lastLogin = new Date().toISOString();
        users.set(user.id, user);
        
        // 生成JWT token
        const token = jwt.sign(
            { userId: user.id, username: user.username, userType: user.userType },
            JWT_SECRET,
            { expiresIn: '7d' }
        );
        
        // 返回用户信息（不包含密码）
        const { password: _, ...userResponse } = user;
        
        res.json({
            message: '登录成功',
            user: userResponse,
            token
        });
        
    } catch (error) {
        console.error('登录错误:', error);
        res.status(500).json({ error: '服务器内部错误' });
    }
});

// 验证token中间件
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ error: '访问令牌缺失' });
    }
    
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) {
            return res.status(403).json({ error: '访问令牌无效' });
        }
        
        req.user = decoded;
        next();
    });
};

// 验证token
router.get('/verify', authenticateToken, (req, res) => {
    const user = users.get(req.user.userId);
    if (!user) {
        return res.status(404).json({ error: '用户不存在' });
    }
    
    const { password: _, ...userResponse } = user;
    res.json({
        valid: true,
        user: userResponse
    });
});

// 刷新token
router.post('/refresh', authenticateToken, (req, res) => {
    const user = users.get(req.user.userId);
    if (!user) {
        return res.status(404).json({ error: '用户不存在' });
    }
    
    // 生成新的token
    const newToken = jwt.sign(
        { userId: user.id, username: user.username, userType: user.userType },
        JWT_SECRET,
        { expiresIn: '7d' }
    );
    
    res.json({
        message: 'Token刷新成功',
        token: newToken
    });
});

// 登出
router.post('/logout', authenticateToken, (req, res) => {
    // 在实际应用中，这里可能需要将token加入黑名单
    res.json({ message: '登出成功' });
});

// 导出认证中间件供其他路由使用
router.authenticateToken = authenticateToken;

module.exports = router;

