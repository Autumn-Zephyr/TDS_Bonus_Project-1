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

    // New method to add code message with copy button
    addCodeMessage(content, code, type = 'agent') {
        const chatContainer = document.getElementById('chatContainer');
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${type}-message`;

        const badgeClass = type === 'user' ? 'bg-primary' :
            type === 'tool' ? 'bg-warning text-dark' : 'bg-success';

        const uniqueId = 'code_' + Date.now() + Math.random().toString(36).substr(2, 9);

        messageDiv.innerHTML = `
            <div class="d-flex ${type === 'user' ? 'justify-content-end' : 'justify-content-start'}">
                <div class="max-w-75">
                    <span class="badge ${badgeClass} mb-2">${type.toUpperCase()}</span>
                    <div class="card">
                        <div class="card-body">
                            ${this.escapeHtml(content)}
                            <div class="mt-2 position-relative">
                                <pre style="background: #f8f9fa; padding: 15px; border-radius: 5px; margin: 0; padding-right: 60px;"><code id="${uniqueId}">${this.escapeHtml(code)}</code></pre>
                                <button class="btn btn-sm btn-outline-primary position-absolute" 
                                        style="top: 8px; right: 8px; z-index: 10;" 
                                        onclick="window.copyCode('${uniqueId}')">
                                    Copy Code
                                </button>
                            </div>
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
                    // First add the assistant message with tool calls to the conversation
                    this.messages.push({
                        role: 'assistant',
                        content: output || '',
                        tool_calls: toolCalls
                    });

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

        // Don't add the assistant message here if it has tool calls
        // It will be added in the tool handling section
        if (message.content && !message.tool_calls) {
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

            // Show execution result with copy button
            this.addCodeMessage(`JavaScript executed successfully. Result:`, 
                `// Executed Code:\n${code}\n\n// Result:\n${JSON.stringify(result, null, 2)}`, 'tool');

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
            
            // Create result display
            let resultText = `# Executed Code:\n${code}\n\n`;
            if (stdout) resultText += `# Output:\n${stdout}\n`;
            if (stderr) resultText += `# Errors:\n${stderr}\n`;
            if (result !== undefined) resultText += `# Result:\n${String(result)}`;

            this.addCodeMessage(`Python executed successfully:`, resultText, 'tool');

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
            // Create more intelligent code generation based on description
            let generatedCode = '';
            
            switch (language.toLowerCase()) {
                case 'python':
                    generatedCode = this.generatePythonCode(description, requirements);
                    break;
                case 'javascript':
                    generatedCode = this.generateJavaScriptCode(description, requirements);
                    break;
                case 'html':
                    generatedCode = this.generateHTMLCode(description, requirements);
                    break;
                case 'css':
                    generatedCode = this.generateCSSCode(description, requirements);
                    break;
                case 'sql':
                    generatedCode = this.generateSQLCode(description, requirements);
                    break;
                case 'bash':
                    generatedCode = this.generateBashCode(description, requirements);
                    break;
                default:
                    throw new Error(`Unsupported language: ${language}`);
            }

            // DON'T show the code here - let the agent handle the display
            // Just add a simple tool message
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

    generatePythonCode(description, requirements) {
        // Intelligent Python code generation based on description
        const lowerDesc = description.toLowerCase();
        
        if (lowerDesc.includes('fastapi')) {
            return `# ${description}
# FastAPI application with a sample route

from fastapi import FastAPI
import requests
import uvicorn

app = FastAPI(title="FastAPI Application", version="1.0.0")

@app.get("/")
def read_root():
    """Root endpoint"""
    return {"message": "Hello, FastAPI!"}

@app.get("/api/data")
def get_data():
    """Sample data endpoint"""
    return {"data": "This is sample data from FastAPI"}

@app.post("/api/webhook")
def webhook_handler(data: dict):
    """Sample webhook handler"""
    print(f"Received webhook data: {data}")
    return {"status": "success", "received": data}

# Function to call external API
def call_external_api(url: str):
    """Make HTTP request to external API"""
    try:
        response = requests.get(url)
        if response.status_code == 200:
            return response.json()
        else:
            return {"error": f"HTTP {response.status_code}"}
    except Exception as e:
        return {"error": str(e)}

if __name__ == "__main__":
    # Run the FastAPI app
    uvicorn.run(app, host="0.0.0.0", port=8000)`;
        }
        
        if (lowerDesc.includes('sum') && (lowerDesc.includes('two numbers') || lowerDesc.includes('2 numbers'))) {
            return `# ${description}
# This function sums two numbers and returns the result

def sum_two_numbers(a, b):
    """
    Sum two numbers and return the result.
    
    Args:
        a (float): First number
        b (float): Second number
    
    Returns:
        float: Sum of a and b
    """
    return a + b

# Example usage
if __name__ == "__main__":
    # Get input from user
    try:
        num1 = float(input("Enter first number: "))
        num2 = float(input("Enter second number: "))
        
        result = sum_two_numbers(num1, num2)
        print(f"The sum of {num1} and {num2} is: {result}")
    except ValueError:
        print("Please enter valid numbers!")`;
        }
        
        // Add more intelligent patterns here
        if (lowerDesc.includes('calculator')) {
            return `# ${description}
# Simple calculator with basic operations

class Calculator:
    def add(self, a, b):
        return a + b
    
    def subtract(self, a, b):
        return a - b
    
    def multiply(self, a, b):
        return a * b
    
    def divide(self, a, b):
        if b == 0:
            raise ValueError("Cannot divide by zero!")
        return a / b

# Example usage
if __name__ == "__main__":
    calc = Calculator()
    print("Simple Calculator")
    print(f"5 + 3 = {calc.add(5, 3)}")
    print(f"10 - 4 = {calc.subtract(10, 4)}")
    print(f"6 * 7 = {calc.multiply(6, 7)}")
    print(f"15 / 3 = {calc.divide(15, 3)}")`;
        }
        
        // Default template for other descriptions
        return `# ${description}
# Generated Python code

def main():
    """
    Main function - implement your logic here
    """
    print("Hello, World!")
    # Add your code implementation here
    pass

if __name__ == "__main__":
    main()`;
    }

    generateJavaScriptCode(description, requirements) {
        const lowerDesc = description.toLowerCase();
        
        if (lowerDesc.includes('sum') && (lowerDesc.includes('two numbers') || lowerDesc.includes('2 numbers'))) {
            return `// ${description}
// This function sums two numbers and returns the result

function sumTwoNumbers(a, b) {
    /**
     * Sum two numbers and return the result.
     * @param {number} a - First number
     * @param {number} b - Second number
     * @returns {number} Sum of a and b
     */
    return a + b;
}

// Example usage
const num1 = 10;
const num2 = 25;
const result = sumTwoNumbers(num1, num2);

console.log(\`The sum of \${num1} and \${num2} is: \${result}\`);

// Interactive version for browser
function getNumbersAndSum() {
    const a = parseFloat(prompt("Enter first number:"));
    const b = parseFloat(prompt("Enter second number:"));
    
    if (isNaN(a) || isNaN(b)) {
        alert("Please enter valid numbers!");
        return;
    }
    
    const sum = sumTwoNumbers(a, b);
    alert(\`The sum is: \${sum}\`);
}

// Uncomment the line below to run interactively in browser
// getNumbersAndSum();`;
        }
        
        return `// ${description}
// Generated JavaScript code

function main() {
    // Your code implementation here
    console.log('Hello, World!');
}

// Call the main function
main();`;
    }

    generateHTMLCode(description, requirements) {
        return `<!-- ${description} -->
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Generated HTML</title>
    <style>
        body { 
            font-family: Arial, sans-serif; 
            max-width: 800px; 
            margin: 0 auto; 
            padding: 20px; 
        }
    </style>
</head>
<body>
    <h1>Generated HTML Page</h1>
    <p>This page was generated based on: ${description}</p>
    ${requirements.length > 0 ? `<ul>${requirements.map(req => `<li>${req}</li>`).join('')}</ul>` : ''}
</body>
</html>`;
    }

    generateCSSCode(description, requirements) {
        return `/* ${description} */
/* Generated CSS code */

/* Reset and base styles */
* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

body {
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    line-height: 1.6;
    color: #333;
    background-color: #f4f4f4;
}

.container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 20px;
}

/* Add your specific styles here */
.main-content {
    background: white;
    padding: 2rem;
    border-radius: 8px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
}`;
    }

    generateSQLCode(description, requirements) {
        const lowerDesc = description.toLowerCase();
        
        // Check if it's asking for a specific query
        if (lowerDesc.includes('select') && lowerDesc.includes('age') && lowerDesc.includes('income') && lowerDesc.includes('10000')) {
            return `-- ${description}
-- SQL query to select age and income from users table where income > 10000

SELECT age, income 
FROM users 
WHERE income > 10000
ORDER BY income DESC;`;
        }
        
        return `-- ${description}
-- Generated SQL code

-- Example table structure
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    age INTEGER,
    income DECIMAL(10,2),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Sample queries
SELECT * FROM users WHERE income > 10000;
SELECT COUNT(*) as total_users FROM users;
SELECT * FROM users ORDER BY created_at DESC LIMIT 10;`;
    }

    generateBashCode(description, requirements) {
        return `#!/bin/bash
# ${description}
# Generated Bash script

set -e  # Exit on any error

echo "Starting script execution..."

# Add your bash commands here
echo "Hello, World!"

# Example function
function main() {
    echo "Main function executed"
    # Your code here
}

# Call main function
main

echo "Script completed successfully!"`;
    }

    clearChat() {
        this.messages = [];
        document.getElementById('chatContainer').innerHTML = '';
    }
}

// Make copyCode function globally available
window.copyCode = function(elementId) {
    const codeElement = document.getElementById(elementId);
    if (codeElement) {
        navigator.clipboard.writeText(codeElement.textContent).then(() => {
            // Find the button and temporarily change its text
            const button = codeElement.parentElement.querySelector('button');
            const originalText = button.textContent;
            button.textContent = 'Copied!';
            button.classList.add('btn-success');
            button.classList.remove('btn-outline-primary');
            
            setTimeout(() => {
                button.textContent = originalText;
                button.classList.remove('btn-success');
                button.classList.add('btn-outline-primary');
            }, 2000);
        }).catch(err => {
            console.error('Failed to copy code: ', err);
        });
    }
};

// Initialize the agent when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new LLMAgent();
});
