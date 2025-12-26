// 测试脚本：逐个测试Groq模型是否可用
require('dotenv').config();
const Groq = require('groq-sdk');

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY || ''
});

// 要测试的模型列表（可能的API名称）
const modelsToTest = [
    'llama-3.1-8b-instant',  // 已知可用
    'llama-3.3-70b-versatile',  // 已知可用
    // 尝试更多可能的命名格式
    'gpt-oss-120b',
    'gpt-oss-20b',
    'gpt_oss_120b',
    'gpt_oss_20b',
    'gptoss120b',
    'gptoss20b',
    'kimi-k2',
    'kimi_k2',
    'kimi2',
    'kimi-k2-preview',
    'llama-4-scout',
    'llama_4_scout',
    'llama4-scout',
    'llama-4-scout-preview',
    'llama-4-scout-beta',
    'llama-3.3-70b',
    'llama_3_3_70b',
    'llama-3-3-70b',
    'llama-3.3-70b-instant',
    // 尝试查看Groq实际支持的模型
    'llama3-70b-8192',
    'llama3-8b-8192',
    'mixtral-8x7b-32768'
];

async function testModel(modelName) {
    try {
        console.log(`\n测试模型: ${modelName}`);
        const completion = await groq.chat.completions.create({
            messages: [
                {
                    role: 'user',
                    content: '你好'
                }
            ],
            model: modelName,
            max_tokens: 10,
        });
        
        console.log(`✅ ${modelName} - 可用`);
        return { model: modelName, available: true, error: null };
    } catch (error) {
        const errorMsg = error.message || error.toString();
        if (errorMsg.includes('model') || errorMsg.includes('decommissioned') || errorMsg.includes('not found')) {
            console.log(`❌ ${modelName} - 不可用: ${errorMsg.substring(0, 100)}`);
        } else {
            console.log(`⚠️  ${modelName} - 错误: ${errorMsg.substring(0, 100)}`);
        }
        return { model: modelName, available: false, error: errorMsg };
    }
}

async function testAllModels() {
    console.log('开始测试Groq模型...\n');
    const results = [];
    
    for (const model of modelsToTest) {
        const result = await testModel(model);
        results.push(result);
        // 添加小延迟避免API限流
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    console.log('\n\n=== 测试结果汇总 ===');
    const availableModels = results.filter(r => r.available);
    const unavailableModels = results.filter(r => !r.available);
    
    console.log(`\n✅ 可用模型 (${availableModels.length}):`);
    availableModels.forEach(r => console.log(`   - ${r.model}`));
    
    console.log(`\n❌ 不可用模型 (${unavailableModels.length}):`);
    unavailableModels.forEach(r => console.log(`   - ${r.model}`));
    
    return results;
}

// 运行测试
testAllModels().catch(console.error);

