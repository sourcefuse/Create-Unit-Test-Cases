import { ENV_VARS, validateConfluenceEnvironment } from '../environment';
import { ConfluencePage, ConfluenceApiResponse, ConfluenceApiError } from '../types';
import { storeConfluencePagesInVector } from './vector.helper';
import { extractKeywordsWithAdaptiveCount, loadPageIds } from '../utils/keyword-extractor';
import { stripHtmlTags, buildContent, chunkArray, extractPageContent } from '../utils/content-utils';
import * as fs from 'fs-extra';
import * as path from 'path';
import { ConfluenceClient } from 'confluence.js';

/**
 * Confluence utility class for API operations using confluence.js
 */
export class ConfluenceUtil {
  private readonly client: ConfluenceClient;
  private readonly spaceKey: string;
  private readonly pageLimit: number;

  constructor() {
    this.spaceKey = ENV_VARS.JIRA_PROJECT_KEY;
    this.pageLimit = parseInt(ENV_VARS.CONFLUENCE_PAGE_LIMIT);

    this.validateConfiguration();

    this.client = new ConfluenceClient({
      host: ENV_VARS.CONFLUENCE_URL,
      authentication: {
        basic: {
          email: ENV_VARS.JIRA_EMAIL,
          apiToken: ENV_VARS.JIRA_API_TOKEN,
        },
      },
    });
  }

  /**
   * Validates Confluence configuration (using JIRA credentials)
   * @throws Error if required configuration is missing
   */
  private validateConfiguration(): void {
    const missingVars = validateConfluenceEnvironment();
    if (missingVars.length > 0) {
      throw new Error(`Missing required environment variables for Confluence (using JIRA credentials): ${missingVars.join(', ')}`);
    }
  }


  /**
   * Fetches all pages from Confluence space using confluence.js client (handles pagination)
   * @param expand - Array of fields to expand (default: minimal for filtering)
   * @returns Promise resolving to all Confluence pages
   */
  public async fetchAllSpacePages(expand: string[] = []): Promise<any[]> {
    let start = 0;
    const limit = 100; // Fixed limit per batch
    let hasMorePages = true;
    let allPages: any[] = [];

    const expandStr = expand.length > 0 ? ` with expand: [${expand.join(', ')}]` : ' (minimal data for filtering)';
    console.log(`Fetching ALL Confluence pages from project space: ${this.spaceKey}${expandStr}`);

    while (hasMorePages) {
      try {
        const requestParams: any = {
          spaceKey: this.spaceKey,
          type: 'page',
          start,
          limit,
        };

        if (expand.length > 0) {
          requestParams.expand = expand;
        }

        const pages = await this.client.content.getContent(requestParams);

        start += limit;
        hasMorePages = pages.size >= limit;
        
        // Add all pages without filtering
        allPages = [...allPages, ...pages.results];
        console.log(`Fetched ${pages.results.length} pages, total so far: ${allPages.length}`);

      } catch (error: any) {
        if (error instanceof Error) {
          console.error(`Error: ${error.message}`);
        } else if (typeof error === 'object') {
          console.error(`Error: ${JSON.stringify(error)}`);
        } else {
          console.error(`Error: ${String(error)}`);
        }
        hasMorePages = false;
      }
    }

    console.log(`✅ Successfully fetched total ${allPages.length} pages from space: ${this.spaceKey}`);
    return allPages;
  }

  /**
   * Fetches specific pages by their IDs with full content (parallelized)
   * @param pageIds - Array of page IDs to fetch
   * @returns Promise resolving to pages with full content
   */
  public async fetchPagesByIds(pageIds: string[]): Promise<any[]> {
    console.log(`Fetching ${pageIds.length} specific pages with full content...`);

    // Chunk page IDs for batch processing (max 10 concurrent requests)
    const chunks = chunkArray(pageIds, 10);
    const allPages: any[] = [];

    for (const chunk of chunks) {
      console.log(`Processing batch of ${chunk.length} pages...`);
      
      // Fetch pages in parallel for this chunk
      const chunkPromises = chunk.map(async (pageId) => {
        try {
          const page = await this.client.content.getContentById({
            id: pageId,
            expand: ['body.view', 'body.storage'],
          });
          
          console.log(`✓ Fetched: ${page.title} (${pageId})`);
          return page;
          
        } catch (error: any) {
          console.error(`✗ Failed to fetch page ${pageId}:`, error instanceof Error ? error.message : 'Unknown error');
          return null;
        }
      });

      const chunkResults = await Promise.all(chunkPromises);
      const validPages = chunkResults.filter(page => page !== null);
      allPages.push(...validPages);
    }

    console.log(`✅ Successfully fetched ${allPages.length} pages with full content`);
    return allPages;
  }
}


/**
 * Converts Confluence storage format to markdown
 * @param storageContent - Confluence storage format content
 * @returns Markdown formatted content
 */
const convertStorageToMarkdown = (storageContent: string): string => {
  let markdown = storageContent;
  
  // Convert headers
  markdown = markdown.replace(/<h([1-6])>(.*?)<\/h[1-6]>/g, (match, level, content) => {
    const headerLevel = '#'.repeat(parseInt(level));
    return `${headerLevel} ${stripHtmlTags(content)}\n\n`;
  });
  
  // Convert paragraphs
  markdown = markdown.replace(/<p>(.*?)<\/p>/g, (match, content) => {
    return `${stripHtmlTags(content)}\n\n`;
  });
  
  // Convert lists
  markdown = markdown.replace(/<ul>(.*?)<\/ul>/gs, (match, content) => {
    const items = content.match(/<li>(.*?)<\/li>/g) || [];
    const listItems = items.map((item: string) => {
      const text = stripHtmlTags(item.replace(/<\/?li>/g, ''));
      return `- ${text}`;
    }).join('\n');
    return `${listItems}\n\n`;
  });
  
  markdown = markdown.replace(/<ol>(.*?)<\/ol>/gs, (match, content) => {
    const items = content.match(/<li>(.*?)<\/li>/g) || [];
    const listItems = items.map((item: string, index: number) => {
      const text = stripHtmlTags(item.replace(/<\/?li>/g, ''));
      return `${index + 1}. ${text}`;
    }).join('\n');
    return `${listItems}\n\n`;
  });
  
  // Convert code blocks
  markdown = markdown.replace(/<ac:structured-macro[^>]*ac:name="code"[^>]*>(.*?)<\/ac:structured-macro>/gs, (match, content) => {
    const codeContent = stripHtmlTags(content);
    return `\`\`\`\n${codeContent}\n\`\`\`\n\n`;
  });
  
  // Convert inline code
  markdown = markdown.replace(/<code>(.*?)<\/code>/g, (match, content) => {
    return `\`${stripHtmlTags(content)}\``;
  });
  
  // Convert bold and italic
  markdown = markdown.replace(/<strong>(.*?)<\/strong>/g, '**$1**');
  markdown = markdown.replace(/<em>(.*?)<\/em>/g, '*$1*');
  
  // Remove remaining HTML tags
  markdown = stripHtmlTags(markdown);
  
  // Clean up extra whitespace
  markdown = markdown.replace(/\n{3,}/g, '\n\n').trim();
  
  return markdown;
};

/**
 * Check if a page matches any of the keywords
 * @param page - Confluence page object
 * @param keywords - Array of keywords to match
 * @returns Object with match status and matched keywords
 */
const matchesKeywords = (page: any, keywords: string[]): { matches: boolean; matchedKeywords: string[] } => {
  if (!keywords || keywords.length === 0) {
    return { matches: true, matchedKeywords: [] }; // No filtering if no keywords
  }
  
  // Combine title and body content for searching
  const title = (page.title || '').toLowerCase();
  const content = (page.body?.storage?.value || '').toLowerCase();
  const searchableContent = `${title} ${content}`;
  
  const matchedKeywords: string[] = [];
  
  // Check if any keyword is present in the content
  for (const keyword of keywords) {
    const lowerKeyword = keyword.toLowerCase();
    if (searchableContent.includes(lowerKeyword)) {
      matchedKeywords.push(keyword);
    }
  }
  
  const hasMatches = matchedKeywords.length > 0;
  
  return { matches: hasMatches, matchedKeywords };
};

/**
 * Formats Confluence pages as markdown following the correct sequence
 * @param pages - Array of all Confluence pages (already fetched)
 * @returns Formatted markdown string
 */
export const formatConfluencePagesAsMarkdown = async (pages: any[]): Promise<string> => {
  let filteredPages = pages;
  let usedKeywords: string[] = [];
  let totalFetched = pages.length;
  
  // Apply keyword filtering if enabled
  if (ENV_VARS.CONFLUENCE_FILTER_ENABLED) {
    console.log(`\n🔍 Applying adaptive keyword filtering on ${pages.length} pre-fetched pages...`);
    
    try {
      // Use the adaptive keyword extraction which handles the entire flow
      const result = await extractKeywordsWithAdaptiveCount(pages);
      filteredPages = result.filteredPages;
      usedKeywords = result.keywords;
      
      console.log(`📊 Final result: ${filteredPages.length} pages selected from ${totalFetched} total pages`);
      console.log(`🔑 Used keywords: ${usedKeywords.slice(0, 5).join(', ')}${usedKeywords.length > 5 ? '...' : ''}`);
      
    } catch (error) {
      console.warn('⚠️  Keyword filtering failed, using all pages:', error instanceof Error ? error.message : 'Unknown error');
      filteredPages = pages;
    }
  }
  
  let content = '';
  
  for (const page of filteredPages) {
    content += `## ${page.title}(${page.id}) \n\n`;
    content += page.body.storage.value.trim() + ' \n\n';
  }
  
  const cleanContent = stripHtmlTags(content);
  
  const filteringNote = ENV_VARS.CONFLUENCE_FILTER_ENABLED 
    ? `**Filtering**: Enabled (${filteredPages.length} of ${totalFetched} pages matched keywords)\n`
    : `**Filtering**: Disabled (all pages included)\n`;
  
  const markdown = `# Project Documentation

**Total Pages Fetched**: ${totalFetched}
**Pages Included**: ${filteredPages.length}
${filteringNote}**Generated on**: ${new Date().toISOString()}
**Source**: Confluence Space

---

${cleanContent}

---
*Documentation generated from Confluence*
*Pages processed: ${filteredPages.length} of ${totalFetched} total*
${ENV_VARS.CONFLUENCE_FILTER_ENABLED ? '*Filtered based on adaptive JIRA keyword extraction*' : ''}
`;

  return markdown;
};

/**
 * Formats Confluence pages with full content as markdown (used after filtering)
 * @param pages - Array of Confluence pages with full content
 * @param totalFetched - Total number of pages fetched in phase 1
 * @returns Formatted markdown string
 */
export const formatConfluencePagesWithFullContent = async (
  pages: any[], 
  totalFetched: number
): Promise<string> => {
  console.log(`\n📝 Formatting ${pages.length} pages with full content...`);
  
  // Use array for efficient memory usage instead of string concatenation
  const contentParts: string[] = [];
  
  for (const page of pages) {
    contentParts.push(`## ${page.title}(${page.id}) \n\n`);
    
    // Use optimized content extraction
    const pageContent = extractPageContent(page);
    contentParts.push(pageContent + ' \n\n');
  }
  
  const content = buildContent(contentParts);
  const cleanContent = stripHtmlTags(content);
  
  const filteringNote = ENV_VARS.CONFLUENCE_FILTER_ENABLED 
    ? `**Filtering**: Enabled (${pages.length} of ${totalFetched} pages matched keywords)\n`
    : `**Filtering**: Disabled (all pages included)\n`;
  
  const markdown = `# Project Documentation

**Total Pages Fetched**: ${totalFetched}
**Pages Included**: ${pages.length}
${filteringNote}**Generated on**: ${new Date().toISOString()}
**Source**: Confluence Space (Two-phase fetch)

---

${cleanContent}

---
*Documentation generated from Confluence using two-phase approach*
*Phase 1: Filtered ${totalFetched} pages*
*Phase 2: Retrieved full content for ${pages.length} pages*
${ENV_VARS.CONFLUENCE_FILTER_ENABLED ? '*Filtered based on adaptive JIRA keyword extraction*' : ''}
`;

  return markdown;
};

/**
 * Fetches Confluence pages using two-phase approach and creates Project.md file
 * Phase 1: Fetch minimal data for filtering and save page IDs
 * Phase 2: Fetch full content for filtered pages and save to Project.md
 * @param outputPath - Optional output path, defaults to tmp/Project.md
 * @param storeInVector - Whether to store in vector database (default: true)
 * @returns Promise resolving to the created file path
 */
export const fetchAndSaveConfluencePages = async (
  outputPath?: string,
  storeInVector: boolean = true
): Promise<string> => {
  try {
    const confluenceUtil = new ConfluenceUtil();
    
    // Phase 1: Fetch pages with minimal data for filtering
    console.log('\n=== Phase 1: Fetching pages for filtering ===');
    const minimalPages = await confluenceUtil.fetchAllSpacePages(); // No expand = minimal data
    
    if (minimalPages.length === 0) {
      throw new Error('No pages found in the specified Confluence space');
    }
    
    // Apply filtering and save page IDs
    let filteredPageIds: string[] = [];
    if (ENV_VARS.CONFLUENCE_FILTER_ENABLED) {
      console.log('\n🔍 Applying adaptive keyword filtering...');
      const result = await extractKeywordsWithAdaptiveCount(minimalPages);
      filteredPageIds = result.filteredPages.map(page => page.id);
      console.log(`📊 Filtered to ${filteredPageIds.length} pages from ${minimalPages.length} total`);
    } else {
      filteredPageIds = minimalPages.map(page => page.id);
      console.log(`📊 Using all ${filteredPageIds.length} pages (filtering disabled)`);
    }
    
    // Phase 2: Fetch full content for filtered pages
    console.log('\n=== Phase 2: Fetching full content for filtered pages ===');
    const fullContentPages = await confluenceUtil.fetchPagesByIds(filteredPageIds);
    
    if (fullContentPages.length === 0) {
      throw new Error('No pages retrieved with full content');
    }
    
    // Create markdown content with full content pages
    const markdownContent = await formatConfluencePagesWithFullContent(fullContentPages, minimalPages.length);
    
    const defaultPath = path.join(process.cwd(), ENV_VARS.TMP_DIR_PATH, ENV_VARS.PROJECT_MARKDOWN_FILENAME);
    const filePath = outputPath || defaultPath;
    
    const dir = path.dirname(filePath);
    await fs.ensureDir(dir);
    
    await fs.writeFile(filePath, markdownContent, 'utf8');
    
    console.log(`\n✅ Confluence documentation saved to: ${filePath}`);
    console.log(`📄 Processed ${fullContentPages.length} pages with full content`);
    
    // Store in vector database if enabled
    if (storeInVector && ENV_VARS.VECTOR_STORE_TYPE === 'QDRANT') {
      try {
        console.log('\n📦 Storing Confluence pages in vector database...');
        await storeConfluencePagesInVector(fullContentPages);
        console.log('✅ Confluence pages stored in vector database successfully');
      } catch (vectorError) {
        console.warn('⚠️ Failed to store Confluence pages in vector database:', vectorError instanceof Error ? vectorError.message : 'Unknown error');
      }
    }
    
    return filePath;
    
  } catch (error) {
    console.error('❌ Failed to fetch and save Confluence pages:', error instanceof Error ? error.message : 'Unknown error');
    throw error;
  }
};

/**
 * Creates a summary of Confluence pages
 * @param outputPath - Optional output path, defaults to tmp/ConfluenceSummary.md
 * @returns Promise resolving to the created summary file path
 */
export const createConfluenceSummary = async (
  outputPath?: string
): Promise<string> => {
  try {
    const confluenceUtil = new ConfluenceUtil();
    
    console.log('Fetching Confluence pages for summary...');
    const pages = await confluenceUtil.fetchAllSpacePages();
    
    if (pages.length === 0) {
      throw new Error('No pages found in the specified Confluence space');
    }
    
    let summaryContent = `# Confluence Pages Summary

**Total Pages**: ${pages.length}
**Generated on**: ${new Date().toISOString()}

---

`;
    
    pages.forEach((page, index) => {
      summaryContent += `## ${index + 1}. ${page.title}

- **Page ID**: ${page.id}
- **Link**: [View Page](${ENV_VARS.CONFLUENCE_URL}/pages/viewpage.action?pageId=${page.id})

`;
    });
    
    summaryContent += `---
*Summary generated from Confluence*`;
    
    const defaultPath = path.join(process.cwd(), ENV_VARS.TMP_DIR_PATH, 'ConfluenceSummary.md');
    const filePath = outputPath || defaultPath;
    
    const dir = path.dirname(filePath);
    await fs.ensureDir(dir);
    
    await fs.writeFile(filePath, summaryContent, 'utf8');
    
    console.log(`Confluence summary saved to: ${filePath}`);
    console.log(`Summarized ${pages.length} pages from Confluence space`);
    
    return filePath;
    
  } catch (error) {
    console.error('Failed to create Confluence summary:', error instanceof Error ? error.message : 'Unknown error');
    throw error;
  }
};