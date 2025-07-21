const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// 创建Supabase客户端
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

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
    
    // 处理POST请求
    if (event.httpMethod === 'POST') {
        try {
            const { action, username, email, password } = JSON.parse(event.body);
            
            // 注册功能
            if (action === 'register') {
                // 检查邮箱是否已存在
                const { data: existingUser } = await supabase
                    .from('users')
                    .select('id')
                    .eq('email', email)
                    .single();
                
                if (existingUser) {
                    return {
                        statusCode: 400,
                        headers,
                        body: JSON.stringify({ error: '该邮箱已被注册' })
                    };
                }
                
                // 加密密码
                const passwordHash = await bcrypt.hash(password, 10);
                
                // 创建用户
                const { data: newUser, error } = await supabase
                    .from('users')
                    .insert({
                        username,
                        email,
                        password_hash: passwordHash,
                        user_type: 'free',
                        daily_usage: 0
                    })
                    .select()
                    .single();
                
                if (error) {
                    console.error('创建用户失败:', error);
                    return {
                        statusCode: 500,
                        headers,
                        body: JSON.stringify({ error: '注册失败，请稍后重试' })
                    };
                }
                
                // 生成JWT token
                const token = jwt.sign(
                    { userId: newUser.id, email: newUser.email },
                    process.env.JWT_SECRET || 'default-secret',
                    { expiresIn: '30d' }
                );
                
                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({
                        token,
                        user: {
                            id: newUser.id,
                            username: newUser.username,
                            email: newUser.email,
                            user_type: newUser.user_type,
                            daily_usage: newUser.daily_usage
                        }
                    })
                };
            }
            
            // 登录功能
            if (action === 'login') {
                // 查找用户
                const { data: user, error } = await supabase
                    .from('users')
                    .select('*')
                    .eq('email', email)
                    .single();
                
                if (error || !user) {
                    return {
                        statusCode: 401,
                        headers,
                        body: JSON.stringify({ error: '邮箱或密码错误' })
                    };
                }
                
                // 验证密码
                const isValidPassword = await bcrypt.compare(password, user.password_hash);
                if (!isValidPassword) {
                    return {
                        statusCode: 401,
                        headers,
                        body: JSON.stringify({ error: '邮箱或密码错误' })
                    };
                }
                
                // 重置每日使用次数（如果是新的一天）
                const today = new Date().toISOString().split('T')[0];
                const lastUsageDate = user.last_usage_date;
                
                if (lastUsageDate !== today) {
                    await supabase
                        .from('users')
                        .update({
                            daily_usage: 0,
                            last_usage_date: today
                        })
                        .eq('id', user.id);
                    
                    user.daily_usage = 0;
                }
                
                // 生成JWT token
                const token = jwt.sign(
                    { userId: user.id, email: user.email },
                    process.env.JWT_SECRET || 'default-secret',
                    { expiresIn: '30d' }
                );
                
                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({
                        token,
                        user: {
                            id: user.id,
                            username: user.username,
                            email: user.email,
                            user_type: user.user_type,
                            daily_usage: user.daily_usage
                        }
                    })
                };
            }
            
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: '无效的操作' })
            };
            
        } catch (error) {
            console.error('认证错误:', error);
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ error: '服务器内部错误' })
            };
        }
    }
    
    return {
        statusCode: 405,
        headers,
        body: JSON.stringify({ error: '方法不允许' })
    };
};
