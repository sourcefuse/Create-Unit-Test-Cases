import { ENV_VARS } from '../environment';
import axios from 'axios';
import path from 'path';
import fs from 'fs';
/**
 * OpenRouter AI Client for making API calls to OpenRouter
 */

export interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface OpenRouterRequest {
  model?: string;
  messages: OpenRouterMessage[];
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  stream?: boolean;
}

export interface OpenRouterResponse {
  id: string;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface OpenRouterError {
  error: {
    message: string;
    type: string;
    code: string;
  };
}

/**
 * OpenRouter AI client class
 */
export class OpenRouterClient {
  private apiKey: string;
  private model: string;
  private fallbackModels: string[];
  private baseURL: string;

  constructor(apiKey?: string, model?: string) {
    this.apiKey = apiKey || ENV_VARS.OPEN_ROUTER_API_KEY;
    
    if (!this.apiKey) {
      throw new Error('OpenRouter API key is required. Set OPEN_ROUTER_API_KEY in environment variables.');
    }

    this.model = model || ENV_VARS.OPEN_ROUTER_MODEL;
    this.baseURL = ENV_VARS.OPEN_ROUTER_API_URL || 'https://openrouter.ai/api/v1';
    
    // Define fallback models in case primary model is rate-limited
    this.fallbackModels = [
      'meta-llama/llama-3.2-3b-instruct:free',
      'microsoft/phi-3-mini-128k-instruct:free',
      'huggingfaceh4/zephyr-7b-beta:free',
      'openchat/openchat-7b:free',
      'gryphe/mythomist-7b:free'
    ];
  }

  /**
   * Make a POST request similar to OpenRouterAICore pattern
   */
  private async makePostRequest(url: string, body: any): Promise<any> {
    const headers = {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://github.com/sourcefuse/create-unit-test-cases',
      'X-Title': 'Create Unit Test Cases',
    };

    return await axios.post(url, body, { headers });
  }

  /**
   * Send a chat completion request
   */
  async chat(messages: OpenRouterMessage[], options?: Partial<OpenRouterRequest>): Promise<string> {
    const modelsToTry = [this.model, ...this.fallbackModels];
    const tmpDir = path.join(process.cwd(), 'tmp');
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }
    const messagesFile = path.join(tmpDir, 'Messages.json');
    try {
      fs.writeFileSync(messagesFile, JSON.stringify(messages, null, 2), 'utf-8');
      console.log(`📝 Messages written to: ${messagesFile}`);
    } catch (err) {
      console.warn(`⚠️  Could not write messages to file: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
    for (let i = 0; i < modelsToTry.length; i++) {
      const currentModel = modelsToTry[i];
      
      try {
        const request: OpenRouterRequest = {
          model: currentModel,
          messages,
          temperature: 0.7,
          
          ...options,
        };

        console.log(`Sending request to OpenRouter (model: ${request.model})${i > 0 ? ' [fallback]' : ''}...`);

        const response = await this.makePostRequest(`${this.baseURL}/chat/completions`, request);
        
        if (response.data.choices && response.data.choices.length > 0) {
          const content = response.data.choices[0].message.content;
          
          if (response.data.usage) {
            console.log(`✅ Success with ${currentModel}! Tokens used: ${response.data.usage.total_tokens} (prompt: ${response.data.usage.prompt_tokens}, completion: ${response.data.usage.completion_tokens})`);
          }
          
          return content;
        }

        throw new Error('No response content received from OpenRouter');
        
      } catch (error: any) {
        const isRateLimit = error.response?.data?.error?.code === 429 || 
                           error.response?.data?.error?.message?.includes('rate-limited') ||
                           error.response?.data?.error?.message?.includes('temporarily');
        
        if (isRateLimit && i < modelsToTry.length - 1) {
          console.warn(`⚠️  Model ${currentModel} is rate-limited, trying next fallback...`);
          continue;
        }
        
        // If this is the last model to try, or it's not a rate limit error, throw the error
        console.error('Full OpenRouter error details:', error.response?.data || error.message);
        
        if (error.response?.data?.error) {
          const errorDetails = error.response.data.error;
          console.error('Error details:', errorDetails);
          throw new Error(`OpenRouter API error: ${errorDetails.message || errorDetails.type || 'Provider returned error'}`);
        }
        if (error.response) {
          console.error(`Response status: ${error.response.status}`);
          console.error(`Response data:`, error.response.data);
          throw new Error(`OpenRouter request failed: ${error.response.status} ${error.response.statusText}`);
        }
        throw new Error(`OpenRouter request failed: ${error.message || 'Unknown error'}`);
      }
    }
    
    throw new Error('All OpenRouter models failed or are rate-limited');
  }

  /**
   * Simple completion with a single prompt
   */
  async complete(prompt: string, systemPrompt?: string): Promise<string> {
    const messages: OpenRouterMessage[] = [];
    
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    
    messages.push({ role: 'user', content: prompt });
    
    return this.chat(messages);
  }

  /**
   * Generate embeddings (if supported by the model)
   */
  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    try {
      console.log(`Generating embeddings for ${texts.length} texts...`);
      
      const response = await this.makePostRequest(`${this.baseURL}/embeddings`, {
        model: 'openai/text-embedding-3-small', // Use a specific embedding model
        input: texts,
        encoding_format: 'float',
      });

      if (response.data.data) {
        return response.data.data.map((item: any) => item.embedding);
      }

      throw new Error('No embeddings received from OpenRouter');
      
    } catch (error: any) {
      if (error.response?.data?.error) {
        throw new Error(`OpenRouter embeddings error: ${error.response.data.error.message}`);
      }
      if (error.response) {
        throw new Error(`OpenRouter embeddings request failed: ${error.response.status} ${error.response.statusText}`);
      }
      throw new Error(`OpenRouter embeddings request failed: ${error.message || 'Unknown error'}`);
    }
  }

  /**
   * List available models
   */
  async listModels(): Promise<any[]> {
    try {
      const response = await axios.get(`${this.baseURL}/models`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        }
      });
      return (response.data as any)?.data || [];
    } catch (error) {
      console.error('Failed to list models:', error);
      return [];
    }
  }

  /**
   * Get current model
   */
  getModel(): string {
    return this.model;
  }

  /**
   * Set model for future requests
   */
  setModel(model: string): void {
    this.model = model;
  }
}

/**
 * Utility function to analyze JIRA content with OpenRouter
 */
export async function analyzeJiraWithAI(jiraContent: string): Promise<string> {
  try {
    const client = new OpenRouterClient();
    
    const systemPrompt = `You are an expert software architect analyzing JIRA tickets. 
    Analyze the given JIRA ticket and provide:
    1. Key technical requirements
    2. Suggested implementation approach
    3. Potential challenges
    4. Related components or features that might be affected`;

    const prompt = `Please analyze this JIRA ticket and provide technical insights:\n\n${jiraContent}`;
    
    console.log('Analyzing JIRA content with AI...');
    const analysis = await client.complete(prompt, systemPrompt);
    
    return analysis;
    
  } catch (error) {
    console.error('Failed to analyze JIRA with AI:', error instanceof Error ? error.message : 'Unknown error');
    throw error;
  }
}

/**
 * Extract important keywords from JIRA content using AI as a senior technical architect
 */
export async function extractImportantKeywords(jiraContent: string, count: number = 5): Promise<string[]> {
  try {
    const client = new OpenRouterClient();
    
    const systemPrompt = `You are a senior technical architect with 15+ years of experience in software development, system design, and technical analysis. 
    Analyze the given JIRA ticket and extract the most important technical keywords that would be relevant for:
    1. Finding related documentation
    2. Identifying similar features or components
    3. Understanding technical dependencies
    4. Searching for implementation patterns
    
    Focus on:
    - Technical terms and concepts
    - System components and services
    - Implementation approaches
    - Business domain terms
    - Integration points
    
    Return ONLY ${count} most important keywords, one per line, without numbering or additional text.
    Keywords should be lowercase and technical in nature.`;

    const prompt = `Extract the ${count} most important technical keywords from this JIRA ticket:\n\n${jiraContent}`;
    
    console.log(`Extracting ${count} important keywords using AI (Senior Technical Architect perspective)...`);
    const response = await client.complete(prompt, systemPrompt);
    
    // Parse the response to extract keywords
    const keywords = response
      .split('\n')
      .map(line => line.trim().toLowerCase())
      .filter(line => line && !line.includes(':') && !line.includes('keyword'))
      .slice(0, count); // Ensure we don't exceed the requested count
    
    console.log(`AI extracted keywords: ${keywords.join(', ')}`);
    return keywords;
    
  } catch (error) {
    console.error('Failed to extract keywords with AI:', error instanceof Error ? error.message : 'Unknown error');
    throw error;
  }
}

/**
 * Utility function to generate test cases based on JIRA content
 */
export async function generateTestCases(jiraContent: string): Promise<string> {
  try {
    const client = new OpenRouterClient();
    
    const systemPrompt = `You are an expert QA engineer specializing in test case generation. 
    Based on the JIRA ticket, generate comprehensive test cases that cover:
    1. Positive test scenarios
    2. Negative test scenarios
    3. Edge cases
    4. Security considerations
    Format the output as structured test cases with clear steps and expected results.`;

    const prompt = `Generate detailed test cases for this JIRA ticket:\n\n${jiraContent}`;
    
    console.log('Generating test cases with AI...');
    const testCases = await client.complete(prompt, systemPrompt);
    
    return testCases;
    
  } catch (error) {
    console.error('Failed to generate test cases:', error instanceof Error ? error.message : 'Unknown error');
    throw error;
  }
}

/**
 * Utility function to summarize Confluence documentation
 */
export async function summarizeConfluencePages(confluenceContent: string, maxLength: number = 500): Promise<string> {
  try {
    const client = new OpenRouterClient();
    
    const systemPrompt = `You are a technical documentation expert. 
    Summarize the given Confluence documentation concisely while preserving:
    1. Key technical details
    2. Important decisions or requirements
    3. Architecture or design patterns mentioned
    4. Dependencies and integrations
    Keep the summary under ${maxLength} words.`;

    const prompt = `Please summarize this Confluence documentation:\n\n${confluenceContent.substring(0, 4000)}`; // Limit input to avoid token limits
    
    console.log('Summarizing Confluence content with AI...');
    const summary = await client.complete(prompt, systemPrompt);
    
    return summary;
    
  } catch (error) {
    console.error('Failed to summarize Confluence pages:', error instanceof Error ? error.message : 'Unknown error');
    throw error;
  }
}

/**
 * CLI utility for testing OpenRouter connection
 */
export async function testOpenRouterConnection(): Promise<void> {
  console.log('\n🔌 Testing OpenRouter AI connection...\n');
  
  try {
    const client = new OpenRouterClient();
    
    console.log(`📡 API URL: ${ENV_VARS.OPEN_ROUTER_API_URL}`);
    console.log(`🤖 Model: ${client.getModel()}`);
    console.log(`🔑 API Key: ${ENV_VARS.OPEN_ROUTER_API_KEY ? '***' + ENV_VARS.OPEN_ROUTER_API_KEY.slice(-4) : 'Not set'}`);
    
    // Test with a simple prompt
    console.log('\nSending test request...');
    const response = await client.complete('Hello, please respond with "Connection successful!"');
    
    console.log(`\n✅ Connection successful!`);
    console.log(`📝 Response: ${response}`);
    
    // List available models (optional)
    console.log('\n📋 Fetching available models...');
    const models = await client.listModels();
    console.log(`Found ${models.length} available models`);
    if (models.length > 0) {
      console.log('Sample models:', models.slice(0, 5).map(m => m.id).join(', '));
    }
    
  } catch (error) {
    console.error('❌ Connection test failed:', error instanceof Error ? error.message : 'Unknown error');
    console.error('\n💡 Please check:');
    console.error('1. OPEN_ROUTER_API_KEY is set in .env file');
    console.error('2. The API key is valid');
    console.error('3. You have internet connectivity');
  }
}

/**
 * Utility function to send a folder for analysis to OpenRouter AI
 * @param folderPath - Path to the folder to analyze
 * @param options - Configuration options for analysis
 * @returns Promise resolving to AI analysis result
 */
export async function analyzeFolderWithAI(
  folderPath: string, 
  options: {
    maxFiles?: number;
    fileExtensions?: string[];
    systemPrompt?: string;
    excludePatterns?: string[];
    analysisType?: 'code-review' | 'documentation' | 'test-generation' | 'security-audit' | 'custom';
  } = {}
): Promise<string> {
  const fs = require('fs');
  const path = require('path');

  // Input validation
  if (!folderPath || typeof folderPath !== 'string') {
    throw new Error('folderPath must be a valid string path');
  }

  if (!fs.existsSync(folderPath)) {
    throw new Error(`Folder path does not exist: ${folderPath}`);
  }

  if (!fs.statSync(folderPath).isDirectory()) {
    throw new Error(`Path is not a directory: ${folderPath}`);
  }

  const {
    maxFiles = 50,
    fileExtensions = ['.ts', '.tsx', '.json'],
    systemPrompt,
    excludePatterns = ['node_modules', '.git', 'dist', 'build', 'coverage', '.next', '__pycache__', '*.min.js', '*.map'],
    analysisType = 'code-review'
  } = options;

  try {
    console.log(`📁 Analyzing folder: ${folderPath}`);
    
    // Recursively collect files from folder
    const collectFiles = (dirPath: string, files: string[] = []): string[] => {
      if (files.length >= maxFiles) {
        return files;
      }

      const entries = fs.readdirSync(dirPath);
      
      for (const entry of entries) {
        if (files.length >= maxFiles) break;
        
        const fullPath = path.join(dirPath, entry);
        const relativePath = path.relative(folderPath, fullPath);
        
        // Check exclude patterns
        if (excludePatterns.some(pattern => 
          relativePath.includes(pattern) || 
          entry.includes(pattern) || 
          fullPath.includes(pattern)
        )) {
          continue;
        }

        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
          collectFiles(fullPath, files);
        } else if (stat.isFile()) {
          // Check file extension
          const ext = path.extname(entry).toLowerCase();
          if (fileExtensions.includes(ext)) {
            files.push(fullPath);
          }
        }
      }
      
      return files;
    };

    const files = collectFiles(folderPath);
    console.log(`📄 Found ${files.length} files to analyze`);

    if (files.length === 0) {
      throw new Error(`No files found with extensions: ${fileExtensions.join(', ')}`);
    }

    // Read file contents
    const fileContents: Array<{ path: string; content: string; size: number }> = [];
    let totalSize = 0;
    const maxTotalSize = 100000; // ~100KB total to avoid token limits

    for (const filePath of files) {
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const size = Buffer.byteLength(content, 'utf8');
        
        // Skip very large files or if we exceed total size limit
        // if (size > 10000) { // Skip files larger than 10KB
        //   console.log(`⚠️  Skipping large file: ${path.relative(folderPath, filePath)} (${size} bytes)`);
        //   continue;
        // }
        
        // if (totalSize + size > maxTotalSize) {
        //   console.log(`⚠️  Reached size limit, analyzing ${fileContents.length} files`);
        //   break;
        // }

        fileContents.push({
          path: path.relative(folderPath, filePath),
          content: content.trim(),
          size
        });
        
        totalSize += size;
      } catch (error) {
        console.warn(`⚠️  Could not read file ${filePath}:`, error instanceof Error ? error.message : 'Unknown error');
      }
    }

    if (fileContents.length === 0) {
      throw new Error('No files could be read for analysis');
    }

    console.log(`📊 Analyzing ${fileContents.length} files (${totalSize} bytes total)`);

    // Build analysis context
    const folderStructure = fileContents.map(f => f.path).join('\n');
    let codeContent = fileContents
      .map(f => `\n--- FILE: ${f.path} ---\n${f.content}`)
      .join('\n\n');
    // codeContent = '';
    // Define analysis prompts based on type
    const analysisPrompts = {
      'code-review': `You are a senior software architect conducting a comprehensive code review.
      Analyze the codebase and provide insights on:
      1. Code quality and best practices
      2. Architecture patterns and design decisions
      3. Potential bugs or security vulnerabilities
      4. Performance considerations
      5. Maintainability and readability
      6. Suggestions for improvement`,
      
      'documentation': `You are a technical documentation expert analyzing a codebase.
      Generate comprehensive documentation including:
      1. High-level architecture overview
      2. Key components and their responsibilities
      3. API endpoints and data flows
      4. Setup and configuration instructions
      5. Usage examples and patterns`,
      
      'test-generation': `You are a QA engineer specializing in test automation.
      Analyze the codebase and suggest:
      1. Unit test cases for key functions
      2. Integration test scenarios
      3. Edge cases and error conditions
      4. Test data requirements
      5. Testing strategy recommendations`,
      
      'security-audit': `You are a cybersecurity expert conducting a security audit.
      Analyze the codebase for:
      1. Security vulnerabilities and threats
      2. Authentication and authorization issues
      3. Input validation and sanitization
      4. Data protection and privacy concerns
      5. Security best practices recommendations`,
      
      'custom': `
Act as a senior software architect with 15+ years of experience in software development, system design, and technical analysis.
Below are the steps you need to follow:
1. Analyze the given codebase and provide whether it is react, angular or loopback or any other.
2. check how unit test cases are written for this repo.
3. read Project.md file requirements, documents for ticket, TDD etc.
4. read Jira.md file as requirement and create unit test cases in same structure as current repo follows.
5. write unit test cases for Test Driven Approach for given requirements in Jira.md
6. Similar to the file content i have given below, you need to analyze the codebase and write unit test cases for TDD approach.
7. Double check the unit test cases you have written, make sure you have covered all the edge cases, positive and negative workflows.
8. Return only unit test cases with file path, do not write anything else.
      `
    };

    const defaultSystemPrompt = analysisPrompts[analysisType];
    const finalSystemPrompt = systemPrompt || defaultSystemPrompt;
    const prompt = `
Please analyze this folder structure and codebase:

Project Document: ${fs.readFileSync(path.join(process.cwd(),'tmp', 'Project.md'), 'utf-8')}

Jira Requirement: ${fs.readFileSync(path.join(process.cwd(),'tmp', 'Jira.md'), 'utf-8')}

FOLDER: ${folderPath}

FILE STRUCTURE:
${folderStructure}

CODE CONTENT:
${codeContent}

Please provide a detailed analysis based on the system prompt instructions.`;


    // Send to OpenRouter AI
    const client = new OpenRouterClient();
    console.log('🤖 Sending folder analysis to OpenRouter AI...');
    
    const analysis = await client.complete(prompt, finalSystemPrompt);
    
    console.log('✅ Folder analysis completed successfully');
    return analysis;
    
  } catch (error) {
    console.error('❌ Failed to analyze folder with AI:', error instanceof Error ? error.message : 'Unknown error');
    throw error;
  }
}

/**
 * Example usage function for folder analysis
 * @param folderPath - Path to analyze
 * @param analysisType - Type of analysis to perform
 */
export async function analyzeFolderExample(folderPath: string, analysisType: 'code-review' | 'documentation' | 'test-generation' | 'security-audit' = 'code-review'): Promise<void> {
  const fs = require('fs');
  const path = require('path');
  try {
    console.log(`\n🔍 Starting ${analysisType} analysis for: ${folderPath}\n`);
    
    const result = await analyzeFolderWithAI(folderPath, {
      analysisType,
      maxFiles: 100, // Increased from 20 to 100
      fileExtensions: ['.ts', '.js', '.tsx', '.jsx'],
      excludePatterns: ['node_modules', '.git', 'dist', 'build', 'coverage']
    });
    
    // Ensure tmp directory exists
    const tmpDir = path.join(process.cwd(), 'tmp');
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }
    
    // Write result to file
    const outputPath = path.join(tmpDir, 'Output.md');
    fs.writeFileSync(outputPath, result, 'utf-8');
    
    console.log('\n✅ Analysis completed successfully!');
    console.log(`📁 Output written to: ${outputPath}`);
    console.log(`📄 File size: ${Buffer.byteLength(result, 'utf-8')} bytes`);
    
    
  } catch (error) {
    console.error('❌ Analysis failed:', error instanceof Error ? error.message : 'Unknown error');
  }
}

// CLI entry point
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length > 0) {
    const folderPath = args[0];
    if (!folderPath) {
      console.error('❌ Please provide a folder path as the first argument');
      process.exit(1);
    }
    const analysisType = (args[1] as 'code-review' | 'documentation' | 'test-generation' | 'security-audit') || 'custom';
    analyzeFolderExample(folderPath, analysisType).catch(console.error);
  } else {
    testOpenRouterConnection().catch(console.error);
  }
}