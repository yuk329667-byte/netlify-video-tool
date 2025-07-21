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
    
    // 处理POST请求（处理视频）
    if (event.httpMethod === 'POST') {
        try {
            // 验证用户身份
            const decoded = verifyToken(event);
            const userId = decoded.userId;
            
            // 获取用户信息
            const { data: user, error: userError } = await supabase
                .from('users')
                .select('*')
                .eq('id', userId)
                .single();
            
            if (userError || !user) {
                return {
                    statusCode: 404,
                    headers,
                    body: JSON.stringify({ error: '用户不存在' })
                };
            }
            
            // 检查使用限制
            const today = new Date().toISOString().split('T')[0];
            let dailyUsage = user.daily_usage;
            
            // 重置每日使用次数（如果是新的一天）
            if (user.last_usage_date !== today) {
                dailyUsage = 0;
                await supabase
                    .from('users')
                    .update({
                        daily_usage: 0,
                        last_usage_date: today
                    })
                    .eq('id', userId);
            }
            
            // 检查免费用户限制
            if (user.user_type === 'free' && dailyUsage >= 3) {
                return {
                    statusCode: 403,
                    headers,
                    body: JSON.stringify({ 
                        error: '免费用户每日限制3次处理，请升级会员获得无限次数',
                        code: 'DAILY_LIMIT_EXCEEDED'
                    })
                };
            }
            
            const { action, file_name, file_size } = JSON.parse(event.body);
            
            // 检查文件大小限制
            const maxSizes = {
                'free': 50 * 1024 * 1024,      // 50MB
                'paid': 500 * 1024 * 1024,     // 500MB
                'vip': 2 * 1024 * 1024 * 1024  // 2GB
            };
            
            const maxSize = maxSizes[user.user_type] || maxSizes.free;
            if (file_size && file_size > maxSize) {
                const maxSizeMB = Math.round(maxSize / 1024 / 1024);
                return {
                    statusCode: 413,
                    headers,
                    body: JSON.stringify({ 
                        error: `文件大小超出限制，${user.user_type === 'free' ? '免费用户' : user.user_type === 'paid' ? '付费用户' : 'VIP用户'}最大允许${maxSizeMB}MB`,
                        code: 'FILE_SIZE_EXCEEDED'
                    })
                };
            }
            
            // 检查批量处理权限
            if (action === 'batch' && user.user_type !== 'vip') {
                return {
                    statusCode: 403,
                    headers,
                    body: JSON.stringify({ 
                        error: '批量处理功能仅限VIP用户使用',
                        code: 'VIP_REQUIRED'
                    })
                };
            }
            
            // 增加使用次数
            const newDailyUsage = dailyUsage + 1;
            const newTotalUsage = (user.total_usage || 0) + 1;
            
            await supabase
                .from('users')
                .update({
                    daily_usage: newDailyUsage,
                    total_usage: newTotalUsage,
                    last_usage_date: today
                })
                .eq('id', userId);
            
            // 记录使用日志
            await supabase
                .from('usage_logs')
                .insert({
                    user_id: userId,
                    action: action || 'video_process',
                    file_name: file_name || 'unknown',
                    file_size: file_size || 0,
                    processing_time: Math.floor(Math.random() * 30) + 10, // 模拟处理时间
                    ip_address: event.headers['x-forwarded-for'] || 'unknown',
                    user_agent: event.headers['user-agent'] || 'unknown'
                });
            
            // 返回处理结果
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    success: true,
                    message: '视频处理成功',
                    data: {
                        remaining_usage: user.user_type === 'free' ? Math.max(0, 3 - newDailyUsage) : -1,
                        daily_usage: newDailyUsage,
                        total_usage: newTotalUsage,
                        processing_time: Math.floor(Math.random() * 30) + 10,
                        download_url: '/downloads/processed_video.mp4' // 模拟下载链接
                    }
                })
            };
            
        } catch (error) {
            console.error('视频处理错误:', error);
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
                    body: JSON.stringify({ error: '视频处理失败，请稍后重试' })
                };
            }
        }
    }
    
    return {
        statusCode: 405,
        headers,
        body: JSON.stringify({ error: '方法不允许' })
    };
};
