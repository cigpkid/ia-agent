import { registerAs } from '@nestjs/config';

export default registerAs('llm', () => ({
  provider: process.env.LLM_PROVIDER || 'ollama',

  providers: {
    ollama: {
      baseUrl: process.env.OLLAMA_URL || 'http://localhost:11434/v1',
      apiKey: process.env.OLLAMA_API_KEY || 'ollama',
      textModel: process.env.OLLAMA_MODEL_TEXT || 'llama3.1:8b',
      visionModel: process.env.OLLAMA_MODEL_VISION || 'llava',
      supportsVision: process.env.OLLAMA_MODEL_IS_VISION === 'true',
    },
    vllm: {
      baseUrl: process.env.VLLM_URL || 'http://localhost:8000/v1',
      apiKey: process.env.VLLM_API_KEY || 'vllm-token-default',
      textModel:
        process.env.VLLM_MODEL_TEXT || 'meta-llama/Llama-3-8B-Instruct',
      visionModel:
        process.env.VLLM_MODEL_VISION || 'meta-llama/Llama-3-8B-Instruct',
      supportsVision: process.env.VLLM_MODEL_IS_VISION === 'true',
    },
    openai: {
      baseUrl: process.env.OPENAI_URL || 'https://api.openai.com',
      apiKey: process.env.OPENAI_API_KEY,
      textModel: process.env.OPENAI_MODEL_TEXT || 'gpt-4-turbo',
      visionModel: process.env.OPENAI_MODEL_VISION || 'gpt-4-turbo',
      supportsVision: process.env.OPENAI_MODEL_IS_VISION === 'true',
    },
    anthropic: {
      baseUrl: process.env.ANTHROPIC_URL || 'http://anthropic.com',
      apiKey: process.env.ANTHROPIC_API_KEY || 'anthropic',
      textModel: process.env.ANTHROPIC_MODEL_TEXT || 'claude-3-5-sonnet',
      visionModel: process.env.ANTHROPIC_MODEL_VISION || 'claude-3-5-sonnet',
      supportsVision: process.env.ANTHROPIC_MODEL_IS_VISION === 'true',
    },
  },

  memory: {
    summarizerProvider: process.env.SUMMARIZER_PROVIDER || 'ollama',
    vector: process.env.VECTOR_URL || 'http://localhost:11434/api',
    vectorProvider:
      process.env.VECTOR_PROVIDER_URL || 'http://localhost:11434/api',
    vectorProviderModel: process.env.VECTOR_PROVIDER_MODEL || 'llama3.1:8b',
    maxContextWindow: 10,
  },

  db: {
    avl: {
      name: process.env.DB_NAME || 'avl',
      type: 'mysql',
      host: process.env.DB_HOST || 'mysql-server',
      port: parseInt(process.env.DB_PORT || '3306', 10),
      username: process.env.DB_USER_NAME || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_DATABASE || 'generica',
      synchronize: process.env.DB_SYNCHRONIZE === 'true',
      dateStrings: process.env.DB_DATE_STRING !== 'false',
      retryAttempts: parseInt(process.env.DB_RETRY_ATTEMPTS || '10', 10),
      retryDelay: parseInt(process.env.DB_RETRY_DELAY || '3000', 10),
    },
  },

  defaults: {
    temperature: 0.7,
    maxTokens: 1024,
  },
}));