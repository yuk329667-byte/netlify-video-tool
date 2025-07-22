const express = require('express');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();

// 导入认证中间件
const { authenticateToken } = require('./auth');

// 模拟数据库（与其他路由共享）
const users = new Map();
const orders = new Map();

// 支付方案配置
const paymentPlans = {
    paid_monthly: {
        id: 'paid_monthly',
        name: '付费用户 - 月度订阅',
        price: 29,
        currency: 'CNY',
        duration: 30,
        features: ['高质量处理', '优先处理', '无广告']
    },
    paid_yearly: {
        id: 'paid_yearly',
        name: '付费用户 - 年度订阅',
        price: 299,
        currency: 'CNY',
        duration: 365,
        features: ['高质量处理', '优先处理', '无广告', '年度优惠']
    },
    vip_monthly: {
        id: 'vip_monthly',
        name: 'VIP用户 - 月度订阅',
        price: 99,
        currency: 'CNY',
        duration: 30,
        features: ['所有功能', '批量处理', '无限制使用', '专属客服']
    },
    vip_yearly: {
        id: 'vip_yearly',
        name: 'VIP用户 - 年度订阅',
        price: 999,
        currency: 'CNY',
        duration: 365,
        features: ['所有功能', '批量处理', '无限制使用', '专属客服', '年度优惠']
    },
    credits_100: {
        id: 'credits_100',
        name: '积分包 - 100积分',
        price: 10,
        currency: 'CNY',
        type: 'credits',
        amount: 100
    },
    credits_500: {
        id: 'credits_500',
        name: '积分包 - 500积分',
        price: 45,
        currency: 'CNY',
        type: 'credits',
        amount: 500
    },
    credits_1000: {
        id: 'credits_1000',
        name: '积分包 - 1000积分',
        price: 80,
        currency: 'CNY',
        type: 'credits',
        amount: 1000
    }
};

// 获取支付方案
router.get('/plans', (req, res) => {
    try {
        res.json({
            subscription: [
                paymentPlans.paid_monthly,
                paymentPlans.paid_yearly,
                paymentPlans.vip_monthly,
                paymentPlans.vip_yearly
            ],
            credits: [
                paymentPlans.credits_100,
                paymentPlans.credits_500,
                paymentPlans.credits_1000
            ]
        });
    } catch (error) {
        console.error('获取支付方案错误:', error);
        res.status(500).json({ error: '服务器内部错误' });
    }
});

// 创建支付订单
router.post('/create-order', authenticateToken, (req, res) => {
    try {
        const { planId, paymentMethod = 'alipay' } = req.body;
        
        if (!planId || !paymentPlans[planId]) {
            return res.status(400).json({ error: '无效的支付方案' });
        }
        
        const plan = paymentPlans[planId];
        const orderId = uuidv4();
        
        const order = {
            id: orderId,
            userId: req.user.userId,
            planId: planId,
            planName: plan.name,
            amount: plan.price,
            currency: plan.currency,
            paymentMethod: paymentMethod,
            status: 'pending',
            createdAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString() // 30分钟过期
        };
        
        orders.set(orderId, order);
        
        // 模拟支付链接生成
        const paymentUrl = generatePaymentUrl(order);
        
        res.json({
            message: '订单创建成功',
            orderId: orderId,
            paymentUrl: paymentUrl,
            amount: order.amount,
            currency: order.currency,
            expiresAt: order.expiresAt
        });
        
    } catch (error) {
        console.error('创建订单错误:', error);
        res.status(500).json({ error: '服务器内部错误' });
    }
});

// 生成支付链接（模拟）
function generatePaymentUrl(order) {
    const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
    return `${baseUrl}/api/payment/mock-pay/${order.id}`;
}

// 模拟支付页面
router.get('/mock-pay/:orderId', (req, res) => {
    try {
        const { orderId } = req.params;
        const order = orders.get(orderId);
        
        if (!order) {
            return res.status(404).send('订单不存在');
        }
        
        if (order.status !== 'pending') {
            return res.status(400).send('订单状态无效');
        }
        
        // 返回模拟支付页面
        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>模拟支付页面</title>
                <meta charset="utf-8">
                <style>
                    body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
                    .payment-info { background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0; }
                    .btn { padding: 12px 24px; margin: 10px; border: none; border-radius: 4px; cursor: pointer; }
                    .btn-success { background: #28a745; color: white; }
                    .btn-danger { background: #dc3545; color: white; }
                    .btn-secondary { background: #6c757d; color: white; }
                </style>
            </head>
            <body>
                <h1>模拟支付页面</h1>
                <div class="payment-info">
                    <h3>订单信息</h3>
                    <p><strong>订单号:</strong> ${order.id}</p>
                    <p><strong>商品:</strong> ${order.planName}</p>
                    <p><strong>金额:</strong> ¥${order.amount}</p>
                    <p><strong>支付方式:</strong> ${order.paymentMethod}</p>
                </div>
                
                <h3>选择支付结果（仅用于测试）</h3>
                <button class="btn btn-success" onclick="simulatePayment('success')">支付成功</button>
                <button class="btn btn-danger" onclick="simulatePayment('failed')">支付失败</button>
                <button class="btn btn-secondary" onclick="simulatePayment('cancel')">取消支付</button>
                
                <script>
                    function simulatePayment(result) {
                        fetch('/api/payment/simulate-result', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ orderId: '${order.id}', result: result })
                        }).then(response => response.json())
                        .then(data => {
                            alert(data.message);
                            if (result === 'success') {
                                window.location.href = '/';
                            }
                        });
                    }
                </script>
            </body>
            </html>
        `);
        
    } catch (error) {
        console.error('模拟支付页面错误:', error);
        res.status(500).send('服务器内部错误');
    }
});

// 模拟支付结果
router.post('/simulate-result', (req, res) => {
    try {
        const { orderId, result } = req.body;
        const order = orders.get(orderId);
        
        if (!order) {
            return res.status(404).json({ error: '订单不存在' });
        }
        
        if (order.status !== 'pending') {
            return res.status(400).json({ error: '订单状态无效' });
        }
        
        // 更新订单状态
        order.status = result === 'success' ? 'paid' : result === 'failed' ? 'failed' : 'cancelled';
        order.updatedAt = new Date().toISOString();
        
        if (result === 'success') {
            order.paidAt = new Date().toISOString();
            // 处理支付成功逻辑
            handlePaymentSuccess(order);
        }
        
        orders.set(orderId, order);
        
        const messages = {
            success: '支付成功！您的账户已升级。',
            failed: '支付失败，请重试。',
            cancel: '支付已取消。'
        };
        
        res.json({ message: messages[result] || '未知状态' });
        
    } catch (error) {
        console.error('模拟支付结果错误:', error);
        res.status(500).json({ error: '服务器内部错误' });
    }
});

// 处理支付成功
function handlePaymentSuccess(order) {
    try {
        const user = users.get(order.userId);
        if (!user) return;
        
        const plan = paymentPlans[order.planId];
        if (!plan) return;
        
        if (plan.type === 'credits') {
            // 积分充值
            user.credits = (user.credits || 0) + plan.amount;
        } else {
            // 订阅升级
            const userType = plan.id.includes('vip') ? 'vip' : 'paid';
            user.userType = userType;
            
            // 设置过期时间
            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + plan.duration);
            user.subscriptionExpiresAt = expiresAt.toISOString();
        }
        
        user.updatedAt = new Date().toISOString();
        users.set(order.userId, user);
        
        console.log(`用户 ${order.userId} 支付成功，订单 ${order.id}`);
        
    } catch (error) {
        console.error('处理支付成功错误:', error);
    }
}

// 获取订单状态
router.get('/order/:orderId', authenticateToken, (req, res) => {
    try {
        const { orderId } = req.params;
        const order = orders.get(orderId);
        
        if (!order) {
            return res.status(404).json({ error: '订单不存在' });
        }
        
        if (order.userId !== req.user.userId) {
            return res.status(403).json({ error: '无权访问此订单' });
        }
        
        res.json(order);
        
    } catch (error) {
        console.error('获取订单状态错误:', error);
        res.status(500).json({ error: '服务器内部错误' });
    }
});

// 获取用户订单历史
router.get('/orders', authenticateToken, (req, res) => {
    try {
        const userOrders = [];
        
        for (const order of orders.values()) {
            if (order.userId === req.user.userId) {
                userOrders.push(order);
            }
        }
        
        // 按创建时间倒序排列
        userOrders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        
        res.json(userOrders);
        
    } catch (error) {
        console.error('获取订单历史错误:', error);
        res.status(500).json({ error: '服务器内部错误' });
    }
});

// 取消订单
router.post('/cancel/:orderId', authenticateToken, (req, res) => {
    try {
        const { orderId } = req.params;
        const order = orders.get(orderId);
        
        if (!order) {
            return res.status(404).json({ error: '订单不存在' });
        }
        
        if (order.userId !== req.user.userId) {
            return res.status(403).json({ error: '无权访问此订单' });
        }
        
        if (order.status !== 'pending') {
            return res.status(400).json({ error: '只能取消待支付订单' });
        }
        
        order.status = 'cancelled';
        order.updatedAt = new Date().toISOString();
        orders.set(orderId, order);
        
        res.json({ message: '订单已取消' });
        
    } catch (error) {
        console.error('取消订单错误:', error);
        res.status(500).json({ error: '服务器内部错误' });
    }
});

// 获取支付统计
router.get('/stats', authenticateToken, (req, res) => {
    try {
        const user = users.get(req.user.userId);
        if (!user) {
            return res.status(404).json({ error: '用户不存在' });
        }
        
        let totalSpent = 0;
        let orderCount = 0;
        
        for (const order of orders.values()) {
            if (order.userId === req.user.userId && order.status === 'paid') {
                totalSpent += order.amount;
                orderCount++;
            }
        }
        
        const stats = {
            userType: user.userType,
            subscriptionExpiresAt: user.subscriptionExpiresAt,
            credits: user.credits || 0,
            totalSpent: totalSpent,
            orderCount: orderCount
        };
        
        res.json(stats);
        
    } catch (error) {
        console.error('获取支付统计错误:', error);
        res.status(500).json({ error: '服务器内部错误' });
    }
});

module.exports = router;

