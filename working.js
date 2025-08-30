/**
 * LLM Agent POC - Main JavaScript functionality
 * Browser-based multi-tool reasoning agent
 */

class LLMAgent {
    constructor() {
        this.messages = [];
        this.isProcessing = false;
        this.pyodide = null;
        this.pyodideLoaded = false;
        this.initializeUI();
        this.setupEventListeners();
        this.updateAPIKeyLink();
    }

    initializeUI() {
        // Enable input when API key is provided
        document.getElementById('apiKey').addEventListener('input', () => {
            const hasKey = document.getElementById('apiKey').value.trim();
            document.getElementById('userInput').disabled = !hasKey;
            document.getElementById('sendBtn').disabled = !hasKey;
        });
    }

    setupEventListeners() {
        document.getElementById('sendBtn').addEventListener('click', () => this.sendMessage());
        document.getElementById('userInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendMessage();
        });
        document.getElementById('clearBtn').addEventListener('click', () => this.clearChat());
        
        // Update API key link when provider changes
        document.getElementById('provider').addEventListener('change', () => {
            this.updateAPIKeyLink();
        });
    }

    updateAPIKeyLink() {
        const provider = document.getElementById('provider').value;
        const apiKeyLink = document.getElementById('apiKeyLink');
        
        const urls = {
            openai: 'https://platform.openai.com/api-keys',
            openrouter: 'https://openrouter.ai/keys',
            aipipe: 'https://aipipe.org/dashboard'
        };
        
        apiKeyLink.href = urls[provider] || '#';
        apiKeyLink.textContent = `Get ${provider.toUpperCase()} API key here`;
    }

    showAlert(message, type = 'danger') {
        const alertDiv = document.createElement('div');
        alertDiv.className = `alert alert-${type} alert-dismissible fade show`;
        alertDiv.innerHTML = `
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        `;
        document.getElementById('alertContainer').appendChild(alertDiv);
        setTimeout(() => alertDiv.remove(), 5000);
    }

    addMessage(content, type = 'agent', isHtml = false) {
        const chatContainer = document.getElementById('chatContainer');
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${type}-message`;

        const badgeClass = type === 'user' ? 'bg-primary' :
            type === 'tool' ? 'bg-warning text-dark' : 'bg-success';

        messageDiv.innerHTML = `
            <div class="d-flex ${type === 'user' ? 'justify-content-end' : 'justify-content-start'}">
                <div class="max-w-75">
                    <span class="badge ${badgeClass} mb-2">${type.toUpperCase()}</span>
                    <div class="card">
                        <div class="card-body">
                            ${isHtml ? content : this.escapeHtml(content)}
                        </div>
                    </div>
                </div>
            </div>
        `;

        chatContainer.appendChild(messageDiv);
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML.replace(/\n/g, '<br>');
    }

    async sendMessage() {
        const userInput = document.getElementById('userInput');
        const message = userInput.value.trim();

        if (!message || this.isProcessing) return;

        this.addMessage(message, 'user');
        this.messages.push({ role: 'user', content: message });
        userInput.value = '';

        await this.processAgentLoop();
    }

    async processAgentLoop() {
        this.isProcessing = true;
        document.getElementById('sendBtn').disabled = true;
        document.getElementById('userInput').disabled = true;

        try {
            while (true) {
                const { output, toolCalls } = await this.callLLM();

                if (output) {
                    this.addMessage(output, 'agent');
                }

                if (toolCalls && toolCalls.length > 0) {
                    // Handle tool calls
                    for (const toolCall of toolCalls) {
                        const result = await this.handleToolCall(toolCall);
                        this.messages.push({
                            role: 'tool',
                            tool_call_id: toolCall.id,
                            content: JSON.stringify(result)
                        });
                    }
                } else {
                    // No more tool calls, break the loop
                    break;
                }
            }
        } catch (error) {
            this.showAlert(`Error: ${error.message}`);
        } finally {
            this.isProcessing = false;
            document.getElementById('sendBtn').disabled = false;
            document.getElementById('userInput').disabled = false;
        }
    }

    async callLLM() {
        const provider = document.getElementById('provider').value;
        const model = document.getElementById('model').value;
        const apiKey = document.getElementById('apiKey').value;

        const tools = [
            {
                type: "function",
                function: {
                    name: "google_search",
                    description: "Search Google for information",
                    parameters: {
                        type: "object",
                        properties: {
                            query: {
                                type: "string",
                                description: "The search query"
                            }
                        },
                        required: ["query"]
                    }
                }
            },
            {
                type: "function",
                function: {
                    name: "aipipe_call",
                    description: "Make an API call through AIPipe proxy",
                    parameters: {
                        type: "object",
                        properties: {
                            endpoint: {
                                type: "string",
                                description: "The API endpoint"
                            },
                            data: {
                                type: "object",
                                description: "The request data"
                            }
                        },
                        required: ["endpoint", "data"]
                    }
                }
            },
            {
                type: "function",
                function: {
                    name: "execute_javascript",
                    description: "Execute JavaScript code in the browser",
                    parameters: {
                        type: "object",
                        properties: {
                            code: {
                                type: "string",
                                description: "The JavaScript code to execute"
                            }
                        },
                        required: ["code"]
                    }
                }
            },
            {
                type: "function",
                function: {
                    name: "execute_python",
                    description: "Execute Python code using Pyodide in the browser",
                    parameters: {
                        type: "object",
                        properties: {
                            code: {
                                type: "string",
                                description: "The Python code to execute"
                            }
                        },
                        required: ["code"]
                    }
                }
            },
            {
                type: "function",
                function: {
                    name: "generate_code",
                    description: "Generate code in specified programming language",
                    parameters: {
                        type: "object",
                        properties: {
                            language: {
                                type: "string",
                                description: "Programming language (javascript, python, html, css, sql, bash)"
                            },
                            description: {
                                type: "string",
                                description: "Description of what the code should do"
                            },
                            requirements: {
                                type: "array",
                                items: { type: "string" },
                                description: "Specific requirements or features"
                            }
                        },
                        required: ["language", "description"]
                    }
                }
            }
        ];

        let url, headers;

        switch (provider) {
            case 'openai':
                url = 'https://api.openai.com/v1/chat/completions';
                headers = {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                };
                break;
            case 'openrouter':
                url = 'https://openrouter.ai/api/v1/chat/completions';
                headers = {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                    'HTTP-Referer': window.location.origin,
                    'X-Title': 'LLM Agent POC'
                };
                break;
            case 'aipipe':
                url = 'https://aipipe.org/openrouter/v1/chat/completions';
                headers = {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                };
                break;
        }

        const response = await fetch(url, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({
                model: model,
                messages: this.messages,
                tools: tools,
                tool_choice: "auto"
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${await response.text()}`);
        }

        const data = await response.json();
        const message = data.choices[0].message;

        if (message.content) {
            this.messages.push({ role: 'assistant', content: message.content });
        }

        return {
            output: message.content,
            toolCalls: message.tool_calls
        };
    }

    async handleToolCall(toolCall) {
        const { name, arguments: args } = toolCall.function;
        const params = JSON.parse(args);

        this.addMessage(`Calling tool: ${name}`, 'tool');

        switch (name) {
            case 'google_search':
                return await this.googleSearch(params.query);
            case 'aipipe_call':
                return await this.aipipeCall(params.endpoint, params.data);
            case 'execute_javascript':
                return await this.executeJavaScript(params.code);
            case 'execute_python':
                return await this.executePython(params.code);
            case 'generate_code':
                return await this.generateCode(params.language, params.description, params.requirements);
            default:
                throw new Error(`Unknown tool: ${name}`);
        }
    }

    async googleSearch(query) {
        const apiKey = document.getElementById('googleApiKey').value;
        const searchEngineId = document.getElementById('searchEngineId').value;

        if (!apiKey || !searchEngineId) {
            throw new Error('Google Search API key and Search Engine ID are required');
        }

        try {
            const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${searchEngineId}&q=${encodeURIComponent(query)}`;
            const response = await fetch(url);

            if (!response.ok) {
                throw new Error(`Google Search API error: ${response.status}`);
            }

            const data = await response.json();
            const results = data.items?.slice(0, 5).map(item => ({
                title: item.title,
                link: item.link,
                snippet: item.snippet
            })) || [];

            this.addMessage(`Found ${results.length} search results for "${query}"`, 'tool');

            return { query, results };
        } catch (error) {
            this.showAlert(`Google Search error: ${error.message}`);
            return { error: error.message };
        }
    }

    async aipipeCall(endpoint, data) {
        try {
            const response = await fetch(`https://aipipe.org${endpoint}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${document.getElementById('apiKey').value}`
                },
                body: JSON.stringify(data)
            });

            if (!response.ok) {
                throw new Error(`AIPipe API error: ${response.status}`);
            }

            const result = await response.json();
            this.addMessage(`AIPipe call completed to ${endpoint}`, 'tool');

            return result;
        } catch (error) {
            this.showAlert(`AIPipe error: ${error.message}`);
            return { error: error.message };
        }
    }

    async executeJavaScript(code) {
        try {
            // Create a safe execution context
            const sandbox = {
                console: {
                    log: (...args) => {
                        const output = args.map(arg =>
                            typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
                        ).join(' ');
                        this.addMessage(`Console: ${output}`, 'tool');
                    }
                },
                // Add safe globals
                Math: Math,
                JSON: JSON,
                Date: Date,
                Array: Array,
                Object: Object,
                String: String,
                Number: Number
            };

            // Execute in sandbox context
            const func = new Function('sandbox', `
                with(sandbox) {
                    return (function() {
                        ${code}
                    })();
                }
            `);

            const result = func(sandbox);

            // Display result
            const codeArea = document.getElementById('codeExecutionArea');
            const codeResult = document.getElementById('codeResult');
            codeArea.style.display = 'block';
            codeResult.innerHTML = `
                <strong>Code:</strong><pre><code>${this.escapeHtml(code)}</code></pre>
                <strong>Result:</strong><pre><code>${this.escapeHtml(JSON.stringify(result, null, 2))}</code></pre>
            `;

            this.addMessage(`JavaScript executed successfully`, 'tool');

            return {
                code: code,
                result: result,
                success: true
            };
        } catch (error) {
            this.showAlert(`JavaScript execution error: ${error.message}`);
            return {
                code: code,
                error: error.message,
                success: false
            };
        }
    }

    async loadPyodide() {
        if (this.pyodideLoaded) return;
        
        try {
            this.addMessage('Loading Python environment...', 'tool');
            
            // Load Pyodide
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/pyodide/v0.24.1/full/pyodide.js';
            document.head.appendChild(script);
            
            await new Promise((resolve, reject) => {
                script.onload = resolve;
                script.onerror = reject;
            });
            
            this.pyodide = await loadPyodide();
            this.pyodideLoaded = true;
            
            this.addMessage('Python environment loaded successfully', 'tool');
        } catch (error) {
            this.showAlert(`Failed to load Python environment: ${error.message}`);
            throw error;
        }
    }

    async executePython(code) {
        try {
            await this.loadPyodide();
            
            // Capture stdout
            this.pyodide.runPython(`
                import sys
                from io import StringIO
                sys.stdout = StringIO()
                sys.stderr = StringIO()
            `);
            
            // Execute the code
            const result = this.pyodide.runPython(code);
            
            // Get stdout and stderr
            const stdout = this.pyodide.runPython('sys.stdout.getvalue()');
            const stderr = this.pyodide.runPython('sys.stderr.getvalue()');
            
            // Display result
            const pythonArea = document.getElementById('pythonExecutionArea');
            const pythonResult = document.getElementById('pythonResult');
            pythonArea.style.display = 'block';
            
            pythonResult.innerHTML = `
                <strong>Code:</strong><pre><code>${this.escapeHtml(code)}</code></pre>
                ${stdout ? `<strong>Output:</strong><pre><code>${this.escapeHtml(stdout)}</code></pre>` : ''}
                ${stderr ? `<strong>Errors:</strong><pre><code class="text-danger">${this.escapeHtml(stderr)}</code></pre>` : ''}
                ${result !== undefined ? `<strong>Result:</strong><pre><code>${this.escapeHtml(String(result))}</code></pre>` : ''}
            `;

            this.addMessage(`Python executed successfully`, 'tool');

            return {
                code: code,
                result: result,
                stdout: stdout,
                stderr: stderr,
                success: true
            };
        } catch (error) {
            this.showAlert(`Python execution error: ${error.message}`);
            return {
                code: code,
                error: error.message,
                success: false
            };
        }
    }

    async generateCode(language, description, requirements = []) {
        try {
            const codeTemplates = {
                javascript: {
                    template: `// ${description}\n// Generated JavaScript code\n\n`,
                    example: `function example() {\n    // Your code here\n    console.log('Hello, World!');\n}\n\nexample();`
                },
                python: {
                    template: `# ${description}\n# Generated Python code\n\n`,
                    example: `def example():\n    # Your code here\n    print('Hello, World!')\n\nif __name__ == '__main__':\n    example()`
                },
                html: {
                    template: `<!-- ${description} -->\n<!DOCTYPE html>\n<html lang="en">\n<head>\n    <meta charset="UTF-8">\n    <meta name="viewport" content="width=device-width, initial-scale=1.0">\n    <title>Generated HTML</title>\n</head>\n<body>\n`,
                    example: `    <h1>Hello, World!</h1>\n    <p>This is generated HTML.</p>\n</body>\n</html>`
                },
                css: {
                    template: `/* ${description} */\n/* Generated CSS code */\n\n`,
                    example: `body {\n    font-family: Arial, sans-serif;\n    margin: 0;\n    padding: 20px;\n}\n\nh1 {\n    color: #333;\n    text-align: center;\n}`
                },
                sql: {
                    template: `-- ${description}\n-- Generated SQL code\n\n`,
                    example: `SELECT * FROM users\nWHERE active = 1\nORDER BY created_at DESC;`
                },
                bash: {
                    template: `#!/bin/bash\n# ${description}\n# Generated Bash script\n\n`,
                    example: `echo "Hello, World!"\necho "This is a generated bash script"`
                }
            };

            const template = codeTemplates[language];
            if (!template) {
                throw new Error(`Unsupported language: ${language}`);
            }

            let generatedCode = template.template;
            
            // Add requirements as comments
            if (requirements && requirements.length > 0) {
                generatedCode += `// Requirements:\n`;
                requirements.forEach(req => {
                    generatedCode += `// - ${req}\n`;
                });
                generatedCode += '\n';
            }
            
            generatedCode += template.example;

            // Display generated code
            const codeArea = document.getElementById('generatedCodeArea');
            const codeResult = document.getElementById('generatedCodeResult');
            codeArea.style.display = 'block';
            
            codeResult.innerHTML = `
                <strong>Language:</strong> ${language.toUpperCase()}<br>
                <strong>Description:</strong> ${description}<br>
                ${requirements.length > 0 ? `<strong>Requirements:</strong> ${requirements.join(', ')}<br>` : ''}
                <strong>Generated Code:</strong>
                <pre><code>${this.escapeHtml(generatedCode)}</code></pre>
                <button class="btn btn-sm btn-primary mt-2" onclick="navigator.clipboard.writeText(\`${generatedCode.replace(/`/g, '\\`')}\`)">Copy Code</button>
            `;

            this.addMessage(`Code generated successfully in ${language}`, 'tool');

            return {
                language: language,
                description: description,
                requirements: requirements,
                code: generatedCode,
                success: true
            };
        } catch (error) {
            this.showAlert(`Code generation error: ${error.message}`);
            return {
                language: language,
                description: description,
                error: error.message,
                success: false
            };
        }
    }

    clearChat() {
        this.messages = [];
        document.getElementById('chatContainer').innerHTML = '';
        document.getElementById('codeExecutionArea').style.display = 'none';
        document.getElementById('pythonExecutionArea').style.display = 'none';
        document.getElementById('generatedCodeArea').style.display = 'none';
    }
}

// Initialize the agent when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new LLMAgent();
});
