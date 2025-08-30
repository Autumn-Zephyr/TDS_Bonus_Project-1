// config.example.js
// Copy this file to config.js and fill in your API keys

const CONFIG = {
    // LLM Provider Configuration
    llm: {
        // OpenAI Configuration
        openai: {
            apiKey: 'sk-...', // Your OpenAI API key
            baseUrl: 'https://api.openai.com/v1'
        },

        // OpenRouter Configuration  
        openrouter: {
            apiKey: 'sk-or-v1-...', // Your OpenRouter API key
            baseUrl: 'https://openrouter.ai/api/v1'
        },

        // AIPipe Configuration
        aipipe: {
            token: 'eyJhbG.....', // Your AIPipe token
            baseUrl: 'https://aipipe.org/openai/v1'
        }
    },

    // Google Search Configuration
    googleSearch: {
        apiKey: 'AIzaS...', // Your Google Search API key
        searchEngineId: '...', // Your Custom Search Engine ID
        baseUrl: 'https://www.googleapis.com/customsearch/v1'
    },

    // Pyodide Configuration for Python execution
    python: {
        enabled: true,
        pyodideUrl: 'https://cdn.jsdelivr.net/pyodide/v0.24.1/full/pyodide.js'
    },

    // Default Settings
    defaults: {
        provider: 'openrouter', // Default LLM provider
        model: 'gpt-3.5-turbo', // Default model
        maxTokens: 2000,
        temperature: 0.7
    },

    // Tool Configuration
    tools: {
        googleSearch: {
            enabled: true,
            maxResults: 5
        },
        aipipeCall: {
            enabled: true,
            timeout: 30000 // 30 seconds
        },
        javascriptExecution: {
            enabled: true,
            timeout: 5000 // 5 seconds
        },
        pythonExecution: {
            enabled: true,
            timeout: 10000, // 10 seconds
            allowedPackages: ['numpy', 'pandas', 'matplotlib', 'seaborn', 'requests']
        },
        codeGeneration: {
            enabled: true,
            supportedLanguages: ['javascript', 'python', 'html', 'css', 'sql', 'bash']
        }
    },

    // UI Configuration
    ui: {
        theme: 'dark', // 'light' or 'dark'
        autoScroll: true,
        showTimestamps: false,
        maxChatHistory: 100
    },

    // API Key URLs for different providers
    apiKeyUrls: {
        openai: 'https://platform.openai.com/api-keys',
        openrouter: 'https://openrouter.ai/keys',
        aipipe: 'https://aipipe.org/dashboard'
    }
};

// Export for use in main application
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CONFIG;
}
