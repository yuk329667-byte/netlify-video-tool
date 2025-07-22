const express = require('express');
const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs-extra');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();

// 导入认证中间件
const { authenticateToken } = require('./auth');

// 设置FFmpeg路径
if (process.env.FFMPEG_PATH) {
    ffmpeg.setFfmpegPath(process.env.FFMPEG_PATH);
} else {
    try {
        const ffmpegStatic = require('ffmpeg-static');
        ffmpeg.setFfmpegPath(ffmpegStatic);
    } catch (error) {
        console.warn('FFmpeg static not found, using system FFmpeg');
    }
}

// 配置文件上传
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, '../../uploads');
        fs.ensureDirSync(uploadDir);
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueName = `${uuidv4()}-${file.originalname}`;
        cb(null, uniqueName);
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 500 * 1024 * 1024 // 500MB
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['video/mp4', 'video/avi', 'video/mov', 'video/wmv', 'video/flv', 'video/mkv'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('不支持的文件类型'), false);
        }
    }
});

// 处理任务存储
const processingTasks = new Map();

// 视频处理
router.post('/process', authenticateToken, upload.single('video'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: '请上传视频文件' });
        }
        
        const { type = 'removeWatermark' } = req.body;
        const taskId = uuidv4();
        const inputPath = req.file.path;
        const outputDir = path.join(__dirname, '../../uploads/processed');
        fs.ensureDirSync(outputDir);
        
        const outputFilename = `processed-${taskId}-${req.file.originalname}`;
        const outputPath = path.join(outputDir, outputFilename);
        
        // 创建处理任务
        const task = {
            id: taskId,
            userId: req.user.userId,
            type: type,
            status: 'processing',
            progress: 0,
            inputFile: req.file.originalname,
            outputFile: outputFilename,
            createdAt: new Date().toISOString(),
            startedAt: new Date().toISOString()
        };
        
        processingTasks.set(taskId, task);
        
        // 立即返回任务ID
        res.json({
            message: '视频处理已开始',
            taskId: taskId,
            status: 'processing'
        });
        
        // 异步处理视频
        processVideoAsync(inputPath, outputPath, type, taskId);
        
    } catch (error) {
        console.error('视频处理错误:', error);
        res.status(500).json({ error: '视频处理失败: ' + error.message });
    }
});

// 异步视频处理函数
async function processVideoAsync(inputPath, outputPath, type, taskId) {
    try {
        const task = processingTasks.get(taskId);
        if (!task) return;
        
        let command = ffmpeg(inputPath);
        
        // 根据处理类型设置不同的FFmpeg参数
        switch (type) {
            case 'removeWatermark':
                // 去水印：使用delogo滤镜（需要指定位置）
                // 这里使用简单的模糊处理作为示例
                command = command
                    .videoFilters('boxblur=5:1')
                    .outputOptions(['-c:a', 'copy']);
                break;
                
            case 'removeSubtitle':
                // 去字幕：移除字幕轨道
                command = command
                    .outputOptions(['-sn', '-c:v', 'copy', '-c:a', 'copy']);
                break;
                
            case 'batchProcess':
                // 批量处理：基本转码
                command = command
                    .outputOptions(['-c:v', 'libx264', '-crf', '23', '-c:a', 'aac']);
                break;
                
            case 'customProcess':
                // 自定义处理：高质量转码
                command = command
                    .outputOptions([
                        '-c:v', 'libx264',
                        '-preset', 'medium',
                        '-crf', '18',
                        '-c:a', 'aac',
                        '-b:a', '192k'
                    ]);
                break;
                
            default:
                // 默认处理
                command = command
                    .outputOptions(['-c:v', 'libx264', '-c:a', 'aac']);
        }
        
        // 执行处理
        command
            .on('start', (commandLine) => {
                console.log('FFmpeg命令:', commandLine);
                task.status = 'processing';
                task.progress = 0;
                processingTasks.set(taskId, task);
            })
            .on('progress', (progress) => {
                task.progress = Math.round(progress.percent || 0);
                processingTasks.set(taskId, task);
                console.log(`任务 ${taskId} 进度: ${task.progress}%`);
            })
            .on('end', () => {
                task.status = 'completed';
                task.progress = 100;
                task.completedAt = new Date().toISOString();
                task.downloadUrl = `/api/video/download/${taskId}`;
                processingTasks.set(taskId, task);
                
                console.log(`任务 ${taskId} 处理完成`);
                
                // 清理输入文件
                fs.unlink(inputPath).catch(console.error);
            })
            .on('error', (error) => {
                console.error(`任务 ${taskId} 处理错误:`, error);
                task.status = 'failed';
                task.error = error.message;
                task.completedAt = new Date().toISOString();
                processingTasks.set(taskId, task);
                
                // 清理文件
                fs.unlink(inputPath).catch(console.error);
                fs.unlink(outputPath).catch(console.error);
            })
            .save(outputPath);
            
    } catch (error) {
        console.error(`任务 ${taskId} 异步处理错误:`, error);
        const task = processingTasks.get(taskId);
        if (task) {
            task.status = 'failed';
            task.error = error.message;
            task.completedAt = new Date().toISOString();
            processingTasks.set(taskId, task);
        }
    }
}

// 获取处理状态
router.get('/status/:taskId', authenticateToken, (req, res) => {
    try {
        const { taskId } = req.params;
        const task = processingTasks.get(taskId);
        
        if (!task) {
            return res.status(404).json({ error: '任务不存在' });
        }
        
        if (task.userId !== req.user.userId) {
            return res.status(403).json({ error: '无权访问此任务' });
        }
        
        res.json(task);
        
    } catch (error) {
        console.error('获取任务状态错误:', error);
        res.status(500).json({ error: '服务器内部错误' });
    }
});

// 下载处理后的视频
router.get('/download/:taskId', authenticateToken, (req, res) => {
    try {
        const { taskId } = req.params;
        const task = processingTasks.get(taskId);
        
        if (!task) {
            return res.status(404).json({ error: '任务不存在' });
        }
        
        if (task.userId !== req.user.userId) {
            return res.status(403).json({ error: '无权访问此任务' });
        }
        
        if (task.status !== 'completed') {
            return res.status(400).json({ error: '任务尚未完成' });
        }
        
        const filePath = path.join(__dirname, '../../uploads/processed', task.outputFile);
        
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: '文件不存在' });
        }
        
        // 设置下载头
        res.setHeader('Content-Disposition', `attachment; filename="${task.outputFile}"`);
        res.setHeader('Content-Type', 'video/mp4');
        
        // 发送文件
        const fileStream = fs.createReadStream(filePath);
        fileStream.pipe(res);
        
        fileStream.on('end', () => {
            // 下载完成后可以选择删除文件（可选）
            // fs.unlink(filePath).catch(console.error);
        });
        
        fileStream.on('error', (error) => {
            console.error('文件下载错误:', error);
            res.status(500).json({ error: '文件下载失败' });
        });
        
    } catch (error) {
        console.error('下载文件错误:', error);
        res.status(500).json({ error: '服务器内部错误' });
    }
});

// 获取用户的处理历史
router.get('/history', authenticateToken, (req, res) => {
    try {
        const userTasks = [];
        
        for (const task of processingTasks.values()) {
            if (task.userId === req.user.userId) {
                userTasks.push(task);
            }
        }
        
        // 按创建时间倒序排列
        userTasks.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        
        res.json(userTasks);
        
    } catch (error) {
        console.error('获取处理历史错误:', error);
        res.status(500).json({ error: '服务器内部错误' });
    }
});

// 取消处理任务
router.delete('/cancel/:taskId', authenticateToken, (req, res) => {
    try {
        const { taskId } = req.params;
        const task = processingTasks.get(taskId);
        
        if (!task) {
            return res.status(404).json({ error: '任务不存在' });
        }
        
        if (task.userId !== req.user.userId) {
            return res.status(403).json({ error: '无权访问此任务' });
        }
        
        if (task.status === 'completed') {
            return res.status(400).json({ error: '任务已完成，无法取消' });
        }
        
        // 更新任务状态
        task.status = 'cancelled';
        task.completedAt = new Date().toISOString();
        processingTasks.set(taskId, task);
        
        res.json({ message: '任务已取消' });
        
    } catch (error) {
        console.error('取消任务错误:', error);
        res.status(500).json({ error: '服务器内部错误' });
    }
});

// 获取支持的视频格式
router.get('/formats', (req, res) => {
    const formats = {
        input: [
            { extension: 'mp4', description: 'MP4视频文件' },
            { extension: 'avi', description: 'AVI视频文件' },
            { extension: 'mov', description: 'QuickTime视频文件' },
            { extension: 'wmv', description: 'Windows Media视频文件' },
            { extension: 'flv', description: 'Flash视频文件' },
            { extension: 'mkv', description: 'Matroska视频文件' }
        ],
        output: [
            { extension: 'mp4', description: 'MP4视频文件（推荐）' },
            { extension: 'avi', description: 'AVI视频文件' },
            { extension: 'mov', description: 'QuickTime视频文件' }
        ]
    };
    
    res.json(formats);
});

module.exports = router;

