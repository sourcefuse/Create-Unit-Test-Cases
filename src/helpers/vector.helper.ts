import { VectorService, TextChunker, EmbeddingService, VectorDocument } from '../services/vector.service';
import { JiraIssue } from '../types';
import { ENV_VARS } from '../environment';
import { stripHtmlTags, extractPageContent } from '../utils/content-utils';
import * as fs from 'fs-extra';
import * as path from 'path';

/**
 * Vector integration helper for JIRA and Confluence data
 */
export class VectorIntegrationHelper {
  private vectorService: VectorService;
  private textChunker: TextChunker;
  private embeddingService: EmbeddingService;

  constructor() {
    this.vectorService = new VectorService();
    this.textChunker = new TextChunker(1000, 200); // 1000 chars with 200 char overlap
    this.embeddingService = new EmbeddingService();
  }

  /**
   * Initialize the vector database
   */
  async initialize(): Promise<boolean> {
    try {
      console.log('Initializing vector database...');
      await this.vectorService.initializeCollection(1536); // OpenAI embedding size
      console.log('Vector database initialized successfully');
      return true;
    } catch (error) {
      console.warn('Vector database initialization failed:', error instanceof Error ? error.message : 'Unknown error');
      console.warn('Continuing without vector storage...');
      return false;
    }
  }

  /**
   * Process and store JIRA issue in vector database
   * @param jiraIssue - JIRA issue object
   */
  async storeJiraIssue(jiraIssue: JiraIssue): Promise<void> {
    try {
      console.log(`Processing JIRA issue: ${jiraIssue.key}`);

      // Create content from JIRA issue
      const content = this.createJiraContent(jiraIssue);

      // Create document chunks
      const documents = this.textChunker.createDocumentChunks(content, {
        source: 'jira',
        title: jiraIssue.fields.summary,
        issueKey: jiraIssue.key,
        type: jiraIssue.fields.issuetype.name,
        url: `${ENV_VARS.JIRA_URL}/browse/${jiraIssue.key}`,
      });

      // Generate embeddings
      const texts = documents.map(doc => doc.content);
      const embeddings = await this.embeddingService.generateEmbeddings(texts);

      // Store in vector database
      await this.vectorService.storeDocuments(documents, embeddings);

      console.log(`Successfully stored JIRA issue ${jiraIssue.key} (${documents.length} chunks)`);
    } catch (error) {
      console.error(`Error storing JIRA issue ${jiraIssue.key}:`, error);
      throw error;
    }
  }

  /**
   * Process and store Confluence pages in vector database
   * @param pages - Array of Confluence pages
   */
  async storeConfluencePages(pages: any[]): Promise<void> {
    try {
      console.log(`Processing ${pages.length} Confluence pages...`);
      let totalChunks = 0;
      
      // Process in smaller batches to avoid memory issues
      const pagesBatchSize = 50; // Process 50 pages at a time
      let processedPages = 0;

      for (let batchStart = 0; batchStart < pages.length; batchStart += pagesBatchSize) {
        const pagesBatch = pages.slice(batchStart, batchStart + pagesBatchSize);
        console.log(`Processing pages ${batchStart + 1} to ${Math.min(batchStart + pagesBatchSize, pages.length)} of ${pages.length}`);

        for (const page of pagesBatch) {
          try {
            processedPages++;
            if (processedPages % 10 === 0) {
              console.log(`Progress: ${processedPages}/${pages.length} pages processed`);
            }

            // Create content from Confluence page
            const content = this.createConfluenceContent(page);

            if (!content || content.trim().length < 50) {
              continue;
            }

            // Create document chunks
            const documents = this.textChunker.createDocumentChunks(content, {
              source: 'confluence',
              title: page.title,
              pageId: page.id,
              url: `${ENV_VARS.CONFLUENCE_URL}/pages/viewpage.action?pageId=${page.id}`,
            });

            // Generate embeddings in small batches
            const embeddingBatchSize = 5; // Smaller batches for memory efficiency
            for (let i = 0; i < documents.length; i += embeddingBatchSize) {
              const batch = documents.slice(i, i + embeddingBatchSize);
              const texts = batch.map(doc => doc.content);
              const embeddings = await this.embeddingService.generateEmbeddings(texts);

              // Store batch in vector database
              await this.vectorService.storeDocuments(batch, embeddings);
              totalChunks += batch.length;

              // Add delay to prevent API rate limiting and memory issues
              await new Promise(resolve => setTimeout(resolve, 50));
            }

          } catch (pageError) {
            console.error(`Error processing page ${page.id}:`, pageError instanceof Error ? pageError.message : 'Unknown error');
            // Continue with other pages
          }
        }

        // Force garbage collection between batches
        if (global.gc) {
          global.gc();
        }
        
        // Add delay between page batches
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      console.log(`Successfully processed ${processedPages} pages (${totalChunks} total chunks)`);
    } catch (error) {
      console.error('Error storing Confluence pages:', error);
      throw error;
    }
  }

  /**
   * Search for relevant content
   * @param query - Search query
   * @param limit - Maximum results
   * @param source - Filter by source ('jira' | 'confluence')
   */
  async searchContent(
    query: string,
    limit: number = 10,
    source?: 'jira' | 'confluence'
  ): Promise<any[]> {
    try {
      // Generate query embedding
      const queryEmbedding = await this.embeddingService.generateSingleEmbedding(query);

      // Create Qdrant filter with proper structure
      const filter = source ? {
        must: [
          {
            key: 'source',
            match: {
              value: source
            }
          }
        ]
      } : undefined;

      // Search for similar content
      const results = await this.vectorService.searchSimilar(queryEmbedding, limit, filter);

      return results;
    } catch (error) {
      console.error('Error searching content:', error);
      throw error;
    }
  }

  /**
   * Clear all stored documents
   */
  async clearAllDocuments(): Promise<void> {
    await this.vectorService.clearCollection();
    console.log('All documents cleared from vector database');
  }

  /**
   * Get database statistics
   */
  async getDatabaseInfo(): Promise<any> {
    return await this.vectorService.getCollectionInfo();
  }

  /**
   * Create searchable content from JIRA issue
   */
  private createJiraContent(jiraIssue: JiraIssue): string {
    const { fields } = jiraIssue;
    
    let content = `Title: ${fields.summary}\n\n`;
    content += `Issue Key: ${jiraIssue.key}\n`;
    content += `Issue Type: ${fields.issuetype.name}\n`;
    content += `Status: ${fields.status.name}\n`;
    content += `Priority: ${fields.priority.name}\n\n`;

    if (fields.description) {
      if (typeof fields.description === 'string') {
        content += `Description: ${fields.description}\n\n`;
      } else if (typeof fields.description === 'object' && fields.description.content) {
        // Handle ADF format - extract text content
        const descriptionText = this.extractTextFromADF(fields.description.content);
        content += `Description: ${descriptionText}\n\n`;
      }
    }

    return content.trim();
  }

  /**
   * Create searchable content from Confluence page
   */
  private createConfluenceContent(page: any): string {
    let content = `Title: ${page.title}\n\n`;
    
    if (page.body && page.body.storage && page.body.storage.value) {
      // Strip HTML and clean content
      const cleanContent = stripHtmlTags(extractPageContent(page));
      content += cleanContent;
    }

    return content.trim();
  }

  /**
   * Extract text from JIRA ADF format (recursive)
   */
  private extractTextFromADF(content: any[]): string {
    let text = '';
    
    for (const node of content) {
      if (node.type === 'text' && node.text) {
        text += node.text + ' ';
      } else if (node.content) {
        text += this.extractTextFromADF(node.content) + ' ';
      }
    }
    
    return text.trim();
  }

  /**
   * Strip HTML tags and clean text
   */
}

/**
 * Store JIRA issue in vector database
 * @param jiraIssue - JIRA issue object
 */
export const storeJiraIssueInVector = async (jiraIssue: JiraIssue): Promise<void> => {
  const vectorHelper = new VectorIntegrationHelper();
  const initialized = await vectorHelper.initialize();
  if (initialized) {
    await vectorHelper.storeJiraIssue(jiraIssue);
  }
};

/**
 * Store Confluence pages in vector database
 * @param pages - Array of Confluence pages
 */
export const storeConfluencePagesInVector = async (pages: any[]): Promise<void> => {
  const vectorHelper = new VectorIntegrationHelper();
  const initialized = await vectorHelper.initialize();
  if (initialized) {
    await vectorHelper.storeConfluencePages(pages);
  }
};

/**
 * Search content in vector database
 * @param query - Search query
 * @param limit - Maximum results
 * @param source - Filter by source
 */
export const searchVectorContent = async (
  query: string,
  limit: number = 10,
  source?: 'jira' | 'confluence'
): Promise<any[]> => {
  const vectorHelper = new VectorIntegrationHelper();
  return await vectorHelper.searchContent(query, limit, source);
};

/**
 * Find Confluence documents related to JIRA content from Jira.md file
 * @param jiraFilePath - Path to Jira.md file (default: tmp/Jira.md)
 * @param limit - Maximum results (default: 10)
 * @returns Promise resolving to array of related Confluence documents
 */
export const findRelatedConfluenceDocuments = async (
  jiraFilePath?: string,
  limit: number = 10
): Promise<any[]> => {
  try {
    const vectorHelper = new VectorIntegrationHelper();
    
    // Read JIRA content from file
    const defaultPath = path.join(process.cwd(), ENV_VARS.TMP_DIR_PATH, ENV_VARS.JIRA_MARKDOWN_FILENAME);
    const filePath = jiraFilePath || defaultPath;
    
    console.log(`Reading JIRA content from: ${filePath}`);
    
    if (!await fs.pathExists(filePath)) {
      throw new Error(`JIRA file not found: ${filePath}. Please run the application first to generate the JIRA file.`);
    }
    
    const jiraContent = await fs.readFile(filePath, 'utf8');
    
    if (!jiraContent || jiraContent.trim().length === 0) {
      throw new Error('JIRA file is empty or invalid');
    }
    
    // Extract key information from JIRA content for better search
    const searchQuery = extractSearchableContent(jiraContent);
    
    console.log(`Searching for Confluence documents related to JIRA content...`);
    console.log(`Search query extracted: "${searchQuery.substring(0, 100)}..."`);
    
    // Search only Confluence documents
    const results = await vectorHelper.searchContent(searchQuery, limit, 'confluence');
    
    console.log(`Found ${results.length} related Confluence documents`);
    
    return results;
    
  } catch (error) {
    console.error('Error finding related Confluence documents:', error instanceof Error ? error.message : 'Unknown error');
    throw error;
  }
};

/**
 * Extract searchable content from JIRA markdown
 * @param jiraMarkdown - JIRA markdown content
 * @returns Cleaned search query string
 */
const extractSearchableContent = (jiraMarkdown: string): string => {
  // Remove markdown headers and formatting
  let content = jiraMarkdown
    .replace(/^#+ /gm, '') // Remove headers
    .replace(/\*\*(.*?)\*\*/g, '$1') // Remove bold formatting
    .replace(/- \*\*.*?\*\*: /g, '') // Remove list item formatting
    .replace(/\n{2,}/g, ' ') // Replace multiple newlines with space
    .replace(/\n/g, ' ') // Replace single newlines with space
    .trim();
  
  // Extract key sections (Summary and Description are most important for search)
  const summaryMatch = content.match(/Summary\s+(.*?)(?=Details|Description|$)/s);
  const descriptionMatch = content.match(/Description\s+(.*?)$/s);
  
  let searchQuery = '';
  
  if (summaryMatch && summaryMatch[1]) {
    searchQuery += summaryMatch[1].trim() + ' ';
  }
  
  if (descriptionMatch && descriptionMatch[1]) {
    searchQuery += descriptionMatch[1].trim();
  }
  
  // If no specific sections found, use the whole content
  if (!searchQuery.trim()) {
    searchQuery = content;
  }
  
  // Clean and limit the search query
  return searchQuery
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 1000); // Limit to 1000 chars for better search performance
};