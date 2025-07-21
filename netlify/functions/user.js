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
    
    try {
        // 验证用户身份
        const decoded = verifyToken(event);
        const userId = decoded.userId;
        
        // 处理GET请求（获取用户信息）
        if (event.httpMethod === 'GET') {
            // 获取用户信息
            const { data: user, error } = await supabase
                .from('users')
                .select('id, username, email, user_type, daily_usage, total_usage, last_usage_date, subscription_end_date, created_at')
                .eq('id', userId)
                .single();
            
            if (error || !user) {
                return {
                    statusCode: 404,
                    headers,
                    body: JSON.stringify({ error: '用户不存在' })
                };
            }
            
            // 检查并重置每日使用次数
            const today = new Date().toISOString().split('T')[0];
            if (user.last_usage_date !== today) {
                await supabase
                    .from('users')
                    .update({
                        daily_usage: 0,
                        last_usage_date: today
                    })
                    .eq('id', userId);
                
                user.daily_usage = 0;
            }
            
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify(user)
            };
        }
        
        // 处理PUT请求（更新用户信息）
        if (event.httpMethod === 'PUT') {
            const { username, user_type } = JSON.parse(event.body);
            
            const updateData = {};
            if (username) updateData.username = username;
            if (user_type) updateData.user_type = user_type;
            
            const { data: updatedUser, error } = await supabase
                .from('users')
                .update(updateData)
                .eq('id', userId)
                .select()
                .single();
            
            if (error) {
                return {
                    statusCode: 500,
                    headers,
                    body: JSON.stringify({ error: '更新用户信息失败' })
                };
            }
            
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify(updatedUser)
            };
        }
        
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ error: '方法不允许' })
        };
        
    } catch (error) {
        console.error('用户管理错误:', error);
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
                body: JSON.stringify({ error: '服务器内部错误' })
            };
        }
    }
};
