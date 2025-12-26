require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const Groq = require('groq-sdk');

const app = express();
const PORT = process.env.PORT || 3000;

// 初始化Groq客户端
const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY || ''
});

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// 可用的Groq模型列表
// 经过实际测试，以下模型可用
// 其他模型（GPT OSS、Kimi K2、Llama 4 Scout等）可能需要特殊权限或尚未在公共API中发布
const AVAILABLE_MODELS = [
    {
        id: 'llama-3.1-8b-instant',
        name: 'Llama 3.1 8B Instant',
        description: '快速响应，适合日常对话',
        recommended: true,
        category: 'Text to Text'
    },
    {
        id: 'llama-3.3-70b-versatile',
        name: 'Llama 3.3 70B Versatile',
        description: '强大的70B参数模型，适合复杂任务',
        recommended: false,
        category: 'Text to Text'
    }
    // 以下模型在测试中不可用，可能需要特殊权限或不同的API端点
    // 如果将来可用，可以取消注释并测试
    /*
    {
        id: 'gpt-oss-120b',
        name: 'GPT OSS 120B',
        description: '强大的开源GPT模型，120B参数',
        recommended: false,
        category: 'Text to Text'
    },
    {
        id: 'gpt-oss-20b',
        name: 'GPT OSS 20B',
        description: '开源GPT模型，20B参数',
        recommended: false,
        category: 'Text to Text'
    },
    {
        id: 'kimi-k2',
        name: 'Kimi K2',
        description: 'Kimi K2模型，支持多语言',
        recommended: false,
        category: 'Text to Text'
    },
    {
        id: 'llama-4-scout',
        name: 'Llama 4 Scout',
        description: 'Llama 4 Scout模型',
        recommended: false,
        category: 'Text to Text'
    }
    */
];

// Groq AI回复函数 - 支持对话历史
async function getAIResponse(messages, model = null) {
    // 检查是否配置了API密钥
    if (!process.env.GROQ_API_KEY || process.env.GROQ_API_KEY === 'your_groq_api_key_here') {
        return '⚠️ 错误：未配置Groq API密钥。请在.env文件中设置GROQ_API_KEY。';
    }

    try {
        // 使用传入的模型，或使用环境变量中的默认模型
        const selectedModel = model || process.env.GROQ_MODEL || 'llama-3.1-8b-instant';
        
        // 验证模型是否在可用列表中
        const modelInfo = AVAILABLE_MODELS.find(m => m.id === selectedModel);
        if (!modelInfo) {
            return '⚠️ 错误：无效的模型名称。请选择可用的模型。';
        }
        
        // 构建消息数组，添加系统提示
        const systemMessage = {
            role: 'system',
            content: '你是一个友好、专业的AI助手。请用中文回答用户的问题，回答要简洁明了、有帮助。'
        };
        
        // 清理消息：移除Groq API不支持的字段（如timestamp），只保留role和content
        const cleanedMessages = messages.map(msg => ({
            role: msg.role,
            content: msg.content
        }));
        
        // 将系统消息放在最前面，然后是清理后的对话历史
        const allMessages = [systemMessage, ...cleanedMessages];
        
        // 调用Groq API，传入完整对话历史
        const completion = await groq.chat.completions.create({
            messages: allMessages,
            model: selectedModel,
            temperature: 0.7,
            max_tokens: 1024,
        });

        return completion.choices[0]?.message?.content || '抱歉，无法获取AI回复。';
    } catch (error) {
        console.error('Groq API错误:', error);
        
        // 提供更友好的错误信息
        if (error.status === 401) {
            return '⚠️ 错误：Groq API密钥无效，请检查.env文件中的GROQ_API_KEY。';
        } else if (error.status === 429) {
            return '⚠️ 错误：API请求频率过高，请稍后再试。';
        } else if (error.status === 400 && (error.message?.includes('model') || error.message?.includes('decommissioned'))) {
            return `⚠️ 错误：模型 "${selectedModel}" 不可用或已停用。请尝试使用 "llama-3.1-8b-instant" 或其他可用模型。`;
        } else {
            return `⚠️ 错误：${error.message || '无法连接到Groq API服务'}`;
        }
    }
}

// API路由：获取可用模型列表
app.get('/api/models', (req, res) => {
    res.json({
        models: AVAILABLE_MODELS,
        defaultModel: process.env.GROQ_MODEL || 'llama-3.1-8b-instant'
    });
});

// API路由：处理聊天请求
app.post('/api/chat', async (req, res) => {
    try {
        const { message, messages, model } = req.body;
        
        // 支持两种格式：单条消息（向后兼容）或完整对话历史
        let conversationMessages = [];
        
        if (messages && Array.isArray(messages)) {
            // 新格式：接收完整对话历史
            conversationMessages = messages;
        } else if (message && typeof message === 'string') {
            // 旧格式：单条消息（向后兼容）
            conversationMessages = [
                {
                    role: 'user',
                    content: message
                }
            ];
        } else {
            return res.status(400).json({ 
                error: '请提供有效的消息内容或对话历史' 
            });
        }
        
        // 验证消息格式
        if (conversationMessages.length === 0) {
            return res.status(400).json({ 
                error: '对话历史不能为空' 
            });
        }
        
        // 验证消息格式
        for (const msg of conversationMessages) {
            if (!msg.role || !msg.content) {
                return res.status(400).json({ 
                    error: '消息格式错误，每条消息必须包含role和content字段' 
                });
            }
            if (!['user', 'assistant', 'system'].includes(msg.role)) {
                return res.status(400).json({ 
                    error: '消息role必须是user、assistant或system' 
                });
            }
        }

        // 获取AI回复，传入完整对话历史和模型参数
        const reply = await getAIResponse(conversationMessages, model);
        
        res.json({ 
            reply: reply,
            model: model || process.env.GROQ_MODEL || 'llama-3.1-8b-instant',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error processing chat:', error);
        res.status(500).json({ 
            error: '处理请求时发生错误' 
        });
    }
});

// 健康检查端点
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok',
        timestamp: new Date().toISOString()
    });
});

// 根路由 - 确保index.html能被访问
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 启动服务器 - 监听所有网络接口
app.listen(PORT, '0.0.0.0', () => {
    console.log(`=================================`);
    console.log(`服务器已启动！`);
    console.log(`本地访问: http://localhost:${PORT}`);
    console.log(`网络访问: http://0.0.0.0:${PORT}`);
    console.log(`API端点: http://localhost:${PORT}/api/chat`);
    
    // 检查API密钥配置
    if (!process.env.GROQ_API_KEY || process.env.GROQ_API_KEY === 'your_groq_api_key_here') {
        console.log(`⚠️  警告: 未检测到Groq API密钥配置`);
        console.log(`   请创建.env文件并设置GROQ_API_KEY`);
        console.log(`   参考.env.example文件`);
    } else {
        console.log(`✅ Groq API已配置`);
        console.log(`   使用模型: ${process.env.GROQ_MODEL || 'llama-3.1-8b-instant'}`);
    }
    console.log(`=================================`);
});


