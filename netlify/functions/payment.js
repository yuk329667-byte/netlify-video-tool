const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');

// 创建Supabase客户端
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

// 验证JWT token
function verifyToken(event) {
    const authHeader = event.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new Error('未提供认证token');
    }
    
    const token = authHeader.substring(7);
    return jwt.verify(token, process.env.JWT_SECRET || 'default-secret');
}

// 生成订单号
function generateOrderNumber() {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 10000);
    return `ORDER${timestamp}${random}`;
}

// Netlify函数格式
exports.handler = async (event, context) => {
    // 设置CORS头
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Content-Type': 'application/json'
    };
    
    // 处理预检请求
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }
    
    // 处理POST请求（创建支付订单）
    if (event.httpMethod === 'POST') {
        try {
            // 验证用户身份
            const decoded = verifyToken(event);
            const userId = decoded.userId;
            
            const { mode, type, amount, payment_method } = JSON.parse(event.body);
            
            if (!mode || !type || !amount || !payment_method) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ error: '缺少必要参数' })
                };
            }
            
            // 生成订单
            const orderNumber = generateOrderNumber();
            
            const { data: order, error: orderError } = await supabase
                .from('orders')
                .insert({
                    user_id: userId,
                    order_number: orderNumber,
                    plan_type: type,
                    plan_mode: mode,
                    amount: parseFloat(amount),
                    payment_method,
                    status: 'pending'
                })
                .select()
                .single();
            
            if (orderError) {
                console.error('创建订单失败:', orderError);
                return {
                    statusCode: 500,
                    headers,
                    body: JSON.stringify({ error: '创建订单失败' })
                };
            }
            
            // 模拟支付处理（实际项目中需要集成真实支付接口）
            // 在实际项目中，这里应该返回支付链接，用户完成支付后通过webhook通知
            // 这里为了演示，我们直接模拟支付成功
            setTimeout(async () => {
                try {
                    // 模拟支付成功，更新订单状态
                    await supabase
                        .from('orders')
                        .update({
                            status: 'paid',
                            paid_at: new Date().toISOString(),
                            payment_id: `PAY${Date.now()}`
                        })
                        .eq('id', order.id);
                    
                    // 更新用户类型
                    let newUserType = 'free';
                    let subscriptionEndDate = null;
                    
                    if (mode === 'subscription') {
                        newUserType = 'paid';
                        const endDate = new Date();
                        if (type.includes('月度')) {
                            endDate.setMonth(endDate.getMonth() + 1);
                        } else if (type.includes('年度')) {
                            endDate.setFullYear(endDate.getFullYear() + 1);
                        }
                        subscriptionEndDate = endDate.toISOString();
                    } else if (mode === 'buyout') {
                        newUserType = 'vip';
                    } else if (mode === 'payperuse' || mode === 'credits') {
                        // 按次付费或积分制不改变用户类型，只增加使用次数
                        newUserType = 'paid';
                    }
                    
                    await supabase
                        .from('users')
                        .update({
                            user_type: newUserType,
                            subscription_end_date: subscriptionEndDate
                        })
                        .eq('id', userId);
                    
                } catch (error) {
                    console.error('支付后处理失败:', error);
                }
            }, 2000); // 2秒后模拟支付成功
            
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    success: true,
                    order_number: orderNumber,
                    payment_url: `/payment/process/${orderNumber}`, // 模拟支付链接
                    qr_code: `/qr/${orderNumber}`, // 模拟二维码
                    message: '订单创建成功，请完成支付'
                })
            };
            
        } catch (error) {
            console.error('支付处理错误:', error);
            if (error.name === 'JsonWebTokenError') {
                return {
                    statusCode: 401,
                    headers,
                    body: JSON.stringify({ error: '无效的认证token' })
                };
            } else {
                return {
                    statusCode: 500,
                    headers,
                    body: JSON.stringify({ error: '支付处理失败，请稍后重试' })
                };
            }
        }
    }
    
    // 处理GET请求（查询订单）
    if (event.httpMethod === 'GET') {
        try {
            const decoded = verifyToken(event);
            const userId = decoded.userId;
            
            const { data: orders, error } = await supabase
                .from('orders')
                .select('*')
                .eq('user_id', userId)
                .order('created_at', { ascending: false });
            
            if (error) {
                return {
                    statusCode: 500,
                    headers,
                    body: JSON.stringify({ error: '查询订单失败' })
                };
            }
            
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify(orders)
            };
            
        } catch (error) {
            console.error('查询订单错误:', error);
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ error: '查询订单失败' })
            };
        }
    }
    
    return {
        statusCode: 405,
        headers,
        body: JSON.stringify({ error: '方法不允许' })
    };
};
