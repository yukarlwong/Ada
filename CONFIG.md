# Groq API 配置说明

## 快速配置

1. 在项目根目录创建 `.env` 文件
2. 添加以下内容：

```
GROQ_API_KEY=你的Groq_API密钥
PORT=3000
GROQ_MODEL=llama-3.1-8b-instant
```

## 获取Groq API密钥

1. 访问 https://console.groq.com/
2. 注册/登录账号
3. 在API Keys页面创建新的API密钥
4. 复制密钥到 `.env` 文件

## 可用的Groq模型

**当前可用模型（经过实际测试）：**
- `llama-3.1-8b-instant` (默认，推荐，快速响应) ✅
- `llama-3.3-70b-versatile` (强大的70B参数模型，适合复杂任务) ✅

**测试结果：**
- ✅ 已测试并确认可用：`llama-3.1-8b-instant`、`llama-3.3-70b-versatile`
- ❌ 测试不可用的模型：`gpt-oss-120b`、`gpt-oss-20b`、`kimi-k2`、`llama-4-scout` 等

**注意：** 
- 其他模型（GPT OSS、Kimi K2、Llama 4 Scout等）可能需要：
  1. 特殊的API密钥权限
  2. 不同的API端点
  3. 尚未在公共API中发布
  4. 使用不同的命名格式
- 如果将来Groq API支持更多模型，可以在 `server.js` 中的 `AVAILABLE_MODELS` 数组中添加并测试

## 注意事项

- `.env` 文件不会被提交到Git（已在.gitignore中）
- 不要将API密钥分享给他人
- 如果API密钥无效，服务器会显示错误提示

