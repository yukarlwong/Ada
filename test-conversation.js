// 测试对话历史功能
require('dotenv').config();

const testData = {
    messages: [
        { role: 'user', content: '你好' },
        { role: 'assistant', content: '你好！有什么可以帮助你的吗？' },
        { role: 'user', content: '我刚才说了什么？' }
    ],
    model: 'llama-3.1-8b-instant'
};

async function testConversation() {
    try {
        const response = await fetch('http://localhost:3000/api/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(testData)
        });
        
        const data = await response.json();
        console.log('测试结果:');
        console.log('回复:', data.reply);
        console.log('模型:', data.model);
        
        if (data.reply.includes('你好')) {
            console.log('\n✅ 成功！AI能够读取对话历史并回答上下文问题。');
        } else {
            console.log('\n⚠️ 回复可能没有正确使用对话历史。');
        }
    } catch (error) {
        console.error('测试失败:', error.message);
    }
}

// 等待服务器启动
setTimeout(testConversation, 2000);

