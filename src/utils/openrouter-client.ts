import { ENV_VARS } from '../environment';
import axios from 'axios';

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
    
    for (let i = 0; i < modelsToTry.length; i++) {
      const currentModel = modelsToTry[i];
      
      try {
        const request: OpenRouterRequest = {
          model: currentModel,
          messages,
          temperature: 0.7,
          max_tokens: 2048,
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

// CLI entry point
if (require.main === module) {
  testOpenRouterConnection().catch(console.error);
}