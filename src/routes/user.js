const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();

// 导入认证中间件
const { authenticateToken } = require('./auth');

// 模拟数据库（与auth.js共享）
const users = new Map();

// 获取用户资料
router.get('/profile', authenticateToken, (req, res) => {
    try {
        const user = users.get(req.user.userId);
        if (!user) {
            return res.status(404).json({ error: '用户不存在' });
        }
        
        const { password: _, ...userResponse } = user;
        res.json(userResponse);
        
    } catch (error) {
        console.error('获取用户资料错误:', error);
        res.status(500).json({ error: '服务器内部错误' });
    }
});

// 更新用户资料
router.put('/profile', authenticateToken, async (req, res) => {
    try {
        const { username, email } = req.body;
        const user = users.get(req.user.userId);
        
        if (!user) {
            return res.status(404).json({ error: '用户不存在' });
        }
        
        // 检查用户名和邮箱是否被其他用户使用
        for (const [id, u] of users.entries()) {
            if (id !== req.user.userId) {
                if (username && u.username === username) {
                    return res.status(400).json({ error: '用户名已被使用' });
                }
                if (email && u.email === email) {
                    return res.status(400).json({ error: '邮箱已被注册' });
                }
            }
        }
        
        // 更新用户信息
        if (username) user.username = username;
        if (email) user.email = email;
        user.updatedAt = new Date().toISOString();
        
        users.set(req.user.userId, user);
        
        const { password: _, ...userResponse } = user;
        res.json({
            message: '资料更新成功',
            user: userResponse
        });
        
    } catch (error) {
        console.error('更新用户资料错误:', error);
        res.status(500).json({ error: '服务器内部错误' });
    }
});

// 修改密码
router.put('/password', authenticateToken, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        
        if (!currentPassword || !newPassword) {
            return res.status(400).json({ error: '请提供当前密码和新密码' });
        }
        
        if (newPassword.length < 6) {
            return res.status(400).json({ error: '新密码至少需要6个字符' });
        }
        
        const user = users.get(req.user.userId);
        if (!user) {
            return res.status(404).json({ error: '用户不存在' });
        }
        
        // 验证当前密码
        const isValidPassword = await bcrypt.compare(currentPassword, user.password);
        if (!isValidPassword) {
            return res.status(400).json({ error: '当前密码错误' });
        }
        
        // 加密新密码
        const hashedNewPassword = await bcrypt.hash(newPassword, 10);
        user.password = hashedNewPassword;
        user.updatedAt = new Date().toISOString();
        
        users.set(req.user.userId, user);
        
        res.json({ message: '密码修改成功' });
        
    } catch (error) {
        console.error('修改密码错误:', error);
        res.status(500).json({ error: '服务器内部错误' });
    }
});

// 获取用户统计信息
router.get('/stats', authenticateToken, (req, res) => {
    try {
        const user = users.get(req.user.userId);
        if (!user) {
            return res.status(404).json({ error: '用户不存在' });
        }
        
        // 模拟统计数据
        const stats = {
            totalProcessed: Math.floor(Math.random() * 100) + 1,
            totalSize: Math.floor(Math.random() * 10000) + 100, // MB
            joinDate: user.createdAt,
            lastLogin: user.lastLogin,
            userType: user.userType,
            remainingQuota: user.userType === 'free' ? 5 : user.userType === 'paid' ? 100 : -1 // -1表示无限制
        };
        
        res.json(stats);
        
    } catch (error) {
        console.error('获取用户统计错误:', error);
        res.status(500).json({ error: '服务器内部错误' });
    }
});

// 升级用户等级
router.post('/upgrade', authenticateToken, (req, res) => {
    try {
        const { targetType } = req.body;
        
        if (!['paid', 'vip'].includes(targetType)) {
            return res.status(400).json({ error: '无效的用户类型' });
        }
        
        const user = users.get(req.user.userId);
        if (!user) {
            return res.status(404).json({ error: '用户不存在' });
        }
        
        // 检查升级逻辑
        if (user.userType === 'vip') {
            return res.status(400).json({ error: '您已经是VIP用户' });
        }
        
        if (user.userType === 'paid' && targetType === 'paid') {
            return res.status(400).json({ error: '您已经是付费用户' });
        }
        
        // 更新用户类型
        user.userType = targetType;
        user.upgradeDate = new Date().toISOString();
        user.updatedAt = new Date().toISOString();
        
        users.set(req.user.userId, user);
        
        const { password: _, ...userResponse } = user;
        res.json({
            message: `成功升级到${targetType === 'paid' ? '付费' : 'VIP'}用户`,
            user: userResponse
        });
        
    } catch (error) {
        console.error('用户升级错误:', error);
        res.status(500).json({ error: '服务器内部错误' });
    }
});

// 获取用户权限
router.get('/permissions', authenticateToken, (req, res) => {
    try {
        const user = users.get(req.user.userId);
        if (!user) {
            return res.status(404).json({ error: '用户不存在' });
        }
        
        const permissions = {
            canRemoveWatermark: true,
            canRemoveSubtitle: true,
            canBatchProcess: user.userType === 'vip',
            canCustomProcess: user.userType !== 'free',
            maxFileSize: user.userType === 'free' ? 100 : user.userType === 'paid' ? 500 : 1000, // MB
            maxFilesPerBatch: user.userType === 'free' ? 1 : user.userType === 'paid' ? 5 : 20,
            dailyQuota: user.userType === 'free' ? 5 : user.userType === 'paid' ? 50 : -1 // -1表示无限制
        };
        
        res.json(permissions);
        
    } catch (error) {
        console.error('获取用户权限错误:', error);
        res.status(500).json({ error: '服务器内部错误' });
    }
});

// 删除账户
router.delete('/account', authenticateToken, async (req, res) => {
    try {
        const { password } = req.body;
        
        if (!password) {
            return res.status(400).json({ error: '请提供密码以确认删除' });
        }
        
        const user = users.get(req.user.userId);
        if (!user) {
            return res.status(404).json({ error: '用户不存在' });
        }
        
        // 验证密码
        const isValidPassword = await bcrypt.compare(password, user.password);
        if (!isValidPassword) {
            return res.status(400).json({ error: '密码错误' });
        }
        
        // 删除用户
        users.delete(req.user.userId);
        
        res.json({ message: '账户已成功删除' });
        
    } catch (error) {
        console.error('删除账户错误:', error);
        res.status(500).json({ error: '服务器内部错误' });
    }
});

module.exports = router;

