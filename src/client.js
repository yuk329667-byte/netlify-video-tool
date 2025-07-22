// 客户端入口文件
import './styles/main.css';

// 全局变量
let currentUser = null;
let authToken = localStorage.getItem('authToken');

// DOM加载完成后初始化
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 视频处理工具已加载');
    
    // 初始化应用
    initializeApp();
    
    // 绑定事件监听器
    bindEventListeners();
    
    // 检查用户登录状态
    checkAuthStatus();
});

// 初始化应用
function initializeApp() {
    // 设置页面标题
    document.title = '专业视频处理工具 - 去水印、去字幕、批量处理';
    
    // 初始化UI组件
    initializeUI();
    
    // 设置主题
    setTheme();
}

// 初始化UI组件
function initializeUI() {
    // 初始化文件上传区域
    initializeFileUpload();
    
    // 初始化进度条
    initializeProgressBar();
    
    // 初始化模态框
    initializeModals();
}

// 绑定事件监听器
function bindEventListeners() {
    // 文件上传
    const fileInput = document.getElementById('fileInput');
    if (fileInput) {
        fileInput.addEventListener('change', handleFileSelect);
    }
    
    // 处理按钮
    const processBtn = document.getElementById('processBtn');
    if (processBtn) {
        processBtn.addEventListener('click', handleVideoProcess);
    }
    
    // 登录按钮
    const loginBtn = document.getElementById('loginBtn');
    if (loginBtn) {
        loginBtn.addEventListener('click', showLoginModal);
    }
    
    // 注册按钮
    const registerBtn = document.getElementById('registerBtn');
    if (registerBtn) {
        registerBtn.addEventListener('click', showRegisterModal);
    }
    
    // 退出登录
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }
}

// 文件选择处理
function handleFileSelect(event) {
    const files = event.target.files;
    if (files.length > 0) {
        const file = files[0];
        console.log('选择的文件:', file.name);
        
        // 验证文件类型
        if (!isValidVideoFile(file)) {
            showNotification('请选择有效的视频文件', 'error');
            return;
        }
        
        // 显示文件信息
        displayFileInfo(file);
        
        // 启用处理按钮
        const processBtn = document.getElementById('processBtn');
        if (processBtn) {
            processBtn.disabled = false;
        }
    }
}

// 验证视频文件
function isValidVideoFile(file) {
    const validTypes = ['video/mp4', 'video/avi', 'video/mov', 'video/wmv', 'video/flv'];
    return validTypes.includes(file.type);
}

// 显示文件信息
function displayFileInfo(file) {
    const fileInfo = document.getElementById('fileInfo');
    if (fileInfo) {
        fileInfo.innerHTML = `
            <div class="file-info">
                <h3>文件信息</h3>
                <p><strong>文件名:</strong> ${file.name}</p>
                <p><strong>文件大小:</strong> ${formatFileSize(file.size)}</p>
                <p><strong>文件类型:</strong> ${file.type}</p>
            </div>
        `;
        fileInfo.style.display = 'block';
    }
}

// 格式化文件大小
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// 视频处理处理
async function handleVideoProcess() {
    const fileInput = document.getElementById('fileInput');
    if (!fileInput || !fileInput.files.length) {
        showNotification('请先选择视频文件', 'error');
        return;
    }
    
    const file = fileInput.files[0];
    const processType = document.querySelector('input[name="processType"]:checked')?.value || 'removeWatermark';
    
    try {
        showProgressBar();
        updateProgress(0, '开始处理...');
        
        const formData = new FormData();
        formData.append('video', file);
        formData.append('type', processType);
        
        const response = await fetch('/api/video/process', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`
            },
            body: formData
        });
        
        if (!response.ok) {
            throw new Error('处理失败');
        }
        
        const result = await response.json();
        updateProgress(100, '处理完成!');
        
        // 显示下载链接
        showDownloadLink(result.downloadUrl);
        
    } catch (error) {
        console.error('处理错误:', error);
        showNotification('视频处理失败: ' + error.message, 'error');
        hideProgressBar();
    }
}

// 显示进度条
function showProgressBar() {
    const progressContainer = document.getElementById('progressContainer');
    if (progressContainer) {
        progressContainer.style.display = 'block';
    }
}

// 隐藏进度条
function hideProgressBar() {
    const progressContainer = document.getElementById('progressContainer');
    if (progressContainer) {
        progressContainer.style.display = 'none';
    }
}

// 更新进度
function updateProgress(percent, message) {
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');
    
    if (progressBar) {
        progressBar.style.width = percent + '%';
    }
    
    if (progressText) {
        progressText.textContent = message;
    }
}

// 显示下载链接
function showDownloadLink(url) {
    const downloadContainer = document.getElementById('downloadContainer');
    if (downloadContainer) {
        downloadContainer.innerHTML = `
            <div class="download-section">
                <h3>处理完成!</h3>
                <a href="${url}" download class="download-btn">下载处理后的视频</a>
            </div>
        `;
        downloadContainer.style.display = 'block';
    }
}

// 显示通知
function showNotification(message, type = 'info') {
    // 创建通知元素
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    
    // 添加到页面
    document.body.appendChild(notification);
    
    // 显示动画
    setTimeout(() => {
        notification.classList.add('show');
    }, 100);
    
    // 自动隐藏
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
            document.body.removeChild(notification);
        }, 300);
    }, 3000);
}

// 检查认证状态
async function checkAuthStatus() {
    if (!authToken) {
        showGuestUI();
        return;
    }
    
    try {
        const response = await fetch('/api/user/profile', {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        if (response.ok) {
            const user = await response.json();
            currentUser = user;
            showUserUI(user);
        } else {
            localStorage.removeItem('authToken');
            authToken = null;
            showGuestUI();
        }
    } catch (error) {
        console.error('认证检查失败:', error);
        showGuestUI();
    }
}

// 显示访客界面
function showGuestUI() {
    const userInfo = document.getElementById('userInfo');
    if (userInfo) {
        userInfo.innerHTML = `
            <div class="guest-info">
                <p>游客模式 - 功能受限</p>
                <button id="loginBtn" class="btn btn-primary">登录</button>
                <button id="registerBtn" class="btn btn-secondary">注册</button>
            </div>
        `;
    }
}

// 显示用户界面
function showUserUI(user) {
    const userInfo = document.getElementById('userInfo');
    if (userInfo) {
        userInfo.innerHTML = `
            <div class="user-info">
                <p>欢迎, ${user.username}!</p>
                <p>账户类型: ${getUserTypeText(user.userType)}</p>
                <button id="logoutBtn" class="btn btn-secondary">退出登录</button>
            </div>
        `;
    }
}

// 获取用户类型文本
function getUserTypeText(type) {
    const types = {
        'free': '免费用户',
        'paid': '付费用户',
        'vip': 'VIP用户'
    };
    return types[type] || '未知';
}

// 显示登录模态框
function showLoginModal() {
    // 这里应该显示登录模态框
    console.log('显示登录模态框');
}

// 显示注册模态框
function showRegisterModal() {
    // 这里应该显示注册模态框
    console.log('显示注册模态框');
}

// 处理退出登录
function handleLogout() {
    localStorage.removeItem('authToken');
    authToken = null;
    currentUser = null;
    showGuestUI();
    showNotification('已退出登录', 'success');
}

// 初始化文件上传
function initializeFileUpload() {
    // 文件上传相关初始化
}

// 初始化进度条
function initializeProgressBar() {
    // 进度条相关初始化
}

// 初始化模态框
function initializeModals() {
    // 模态框相关初始化
}

// 设置主题
function setTheme() {
    // 主题设置
    document.body.classList.add('theme-default');
}

// 导出函数供其他模块使用
window.VideoTool = {
    showNotification,
    updateProgress,
    checkAuthStatus
};

