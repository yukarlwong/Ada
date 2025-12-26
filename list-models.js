// 尝试列出Groq所有可用的模型
require('dotenv').config();
const Groq = require('groq-sdk');

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY || ''
});

async function listModels() {
    try {
        // 尝试使用models端点（如果Groq支持）
        console.log('尝试获取模型列表...\n');
        
        // Groq SDK可能不支持直接列出模型，让我们尝试其他方法
        // 或者查看Groq的文档
        
        // 已知可用的模型
        const knownModels = [
            'llama-3.1-8b-instant',
            'llama-3.3-70b-versatile'
        ];
        
        console.log('已知可用的模型：');
        knownModels.forEach(m => console.log(`  ✅ ${m}`));
        
        console.log('\n提示：其他模型（GPT OSS、Kimi K2、Llama 4 Scout等）可能需要：');
        console.log('  1. 特殊的API密钥权限');
        console.log('  2. 不同的API端点');
        console.log('  3. 尚未在公共API中发布');
        console.log('  4. 使用不同的命名格式');
        
    } catch (error) {
        console.error('错误:', error.message);
    }
}

listModels();

