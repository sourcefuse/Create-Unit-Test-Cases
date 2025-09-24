import * as dotenv from 'dotenv';

dotenv.config();

/**
 * Environment variables configuration
 * Centralizes all environment variable access with proper typing
 */
export const ENV_VARS = {
  // External API Configuration
  OPEN_ROUTER_API_KEY: process.env.OPEN_ROUTER_API_KEY || '',
  OPEN_ROUTER_API_URL: process.env.OPEN_ROUTER_API_URL || 'https://openrouter.ai/api/v1',
  OPEN_ROUTER_MODEL: process.env.OPEN_ROUTER_MODEL || 'deepseek/deepseek-chat-v3-0324:free',

  // Vector Store Configuration
  VECTOR_STORE_TYPE: process.env.VECTOR_STORE_TYPE || 'QDRANT',
  VECTOR_STORE_URL: process.env.VECTOR_STORE_URL || 'http://127.0.0.1:6333',

  // JIRA Configuration
  JIRA_EMAIL: process.env.JIRA_EMAIL || '',
  JIRA_API_TOKEN: process.env.JIRA_API_TOKEN || '',
  JIRA_URL: process.env.JIRA_URL || '',
  JIRA_PROJECT_KEY: process.env.JIRA_PROJECT_KEY || '',
  JIRA_MAX_RESULT: process.env.JIRA_MAX_RESULT || '10',
  JIRA_FETCH_FIELDS: process.env.JIRA_FETCH_FIELDS || 'key,summary,description,issuetype,priority,status',
  
  // File Path Configuration
  TMP_DIR_PATH: process.env.TMP_DIR_PATH || './tmp',
  JIRA_MARKDOWN_FILENAME: process.env.JIRA_MARKDOWN_FILENAME || 'Jira.md',
  PROJECT_MARKDOWN_FILENAME: process.env.PROJECT_MARKDOWN_FILENAME || 'Project.md',

  // Confluence Configuration (using JIRA credentials as they're connected)
  CONFLUENCE_URL: process.env.CONFLUENCE_URL || process.env.JIRA_URL || '',
  CONFLUENCE_PAGE_LIMIT: process.env.CONFLUENCE_PAGE_LIMIT || '50',
  CONFLUENCE_FILTER_ENABLED: process.env.CONFLUENCE_FILTER_ENABLED === 'true',
  
  // AI Error Handling
  STOP_ON_AI_ERROR: process.env.STOP_ON_AI_ERROR === 'true',
} as const;

/**
 * Validates that required environment variables are set
 * @returns Array of missing required environment variables
 */
export const validateEnvironment = (): string[] => {
  const required: (keyof typeof ENV_VARS)[] = [
    'OPEN_ROUTER_API_KEY',
    'JIRA_EMAIL', 
    'JIRA_API_TOKEN',
    'JIRA_URL',
    'JIRA_PROJECT_KEY',
  ];

  return required.filter(key => !ENV_VARS[key]);
};

/**
 * Validates Confluence-specific environment variables (using JIRA credentials)
 * @returns Array of missing Confluence environment variables
 */
export const validateConfluenceEnvironment = (): string[] => {
  const required: (keyof typeof ENV_VARS)[] = [
    'CONFLUENCE_URL',
    'JIRA_EMAIL',
    'JIRA_API_TOKEN',
    'JIRA_PROJECT_KEY',
  ];

  return required.filter(key => !ENV_VARS[key]);
};