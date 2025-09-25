"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.createConfluenceSummary = exports.fetchAndSaveConfluencePages = exports.formatConfluencePagesWithFullContent = exports.formatConfluencePagesAsMarkdown = exports.ConfluenceUtil = void 0;
const environment_1 = require("../environment");
const vector_helper_1 = require("./vector.helper");
const keyword_extractor_1 = require("../utils/keyword-extractor");
const content_utils_1 = require("../utils/content-utils");
const fs = __importStar(require("fs-extra"));
const path = __importStar(require("path"));
const confluence_js_1 = require("confluence.js");
/**
 * Confluence utility class for API operations using confluence.js
 */
class ConfluenceUtil {
    constructor() {
        this.spaceKey = environment_1.ENV_VARS.JIRA_PROJECT_KEY;
        this.pageLimit = parseInt(environment_1.ENV_VARS.CONFLUENCE_PAGE_LIMIT);
        this.validateConfiguration();
        this.client = new confluence_js_1.ConfluenceClient({
            host: environment_1.ENV_VARS.CONFLUENCE_URL,
            authentication: {
                basic: {
                    email: environment_1.ENV_VARS.JIRA_EMAIL,
                    apiToken: environment_1.ENV_VARS.JIRA_API_TOKEN,
                },
            },
        });
    }
    /**
     * Validates Confluence configuration (using JIRA credentials)
     * @throws Error if required configuration is missing
     */
    validateConfiguration() {
        const missingVars = (0, environment_1.validateConfluenceEnvironment)();
        if (missingVars.length > 0) {
            throw new Error(`Missing required environment variables for Confluence (using JIRA credentials): ${missingVars.join(', ')}`);
        }
    }
    /**
     * Fetches all pages from Confluence space using confluence.js client (handles pagination)
     * @param expand - Array of fields to expand (default: minimal for filtering)
     * @returns Promise resolving to all Confluence pages
     */
    async fetchAllSpacePages(expand = []) {
        let start = 0;
        const limit = 100; // Fixed limit per batch
        let hasMorePages = true;
        let allPages = [];
        const expandStr = expand.length > 0 ? ` with expand: [${expand.join(', ')}]` : ' (minimal data for filtering)';
        console.log(`Fetching ALL Confluence pages from project space: ${this.spaceKey}${expandStr}`);
        while (hasMorePages) {
            try {
                const requestParams = {
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
            }
            catch (error) {
                if (error instanceof Error) {
                    console.error(`Error: ${error.message}`);
                }
                else if (typeof error === 'object') {
                    console.error(`Error: ${JSON.stringify(error)}`);
                }
                else {
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
    async fetchPagesByIds(pageIds) {
        console.log(`Fetching ${pageIds.length} specific pages with full content...`);
        // Chunk page IDs for batch processing (max 10 concurrent requests)
        const chunks = (0, content_utils_1.chunkArray)(pageIds, 10);
        const allPages = [];
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
                }
                catch (error) {
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
exports.ConfluenceUtil = ConfluenceUtil;
/**
 * Converts Confluence storage format to markdown
 * @param storageContent - Confluence storage format content
 * @returns Markdown formatted content
 */
const convertStorageToMarkdown = (storageContent) => {
    let markdown = storageContent;
    // Convert headers
    markdown = markdown.replace(/<h([1-6])>(.*?)<\/h[1-6]>/g, (match, level, content) => {
        const headerLevel = '#'.repeat(parseInt(level));
        return `${headerLevel} ${(0, content_utils_1.stripHtmlTags)(content)}\n\n`;
    });
    // Convert paragraphs
    markdown = markdown.replace(/<p>(.*?)<\/p>/g, (match, content) => {
        return `${(0, content_utils_1.stripHtmlTags)(content)}\n\n`;
    });
    // Convert lists
    markdown = markdown.replace(/<ul>(.*?)<\/ul>/gs, (match, content) => {
        const items = content.match(/<li>(.*?)<\/li>/g) || [];
        const listItems = items.map((item) => {
            const text = (0, content_utils_1.stripHtmlTags)(item.replace(/<\/?li>/g, ''));
            return `- ${text}`;
        }).join('\n');
        return `${listItems}\n\n`;
    });
    markdown = markdown.replace(/<ol>(.*?)<\/ol>/gs, (match, content) => {
        const items = content.match(/<li>(.*?)<\/li>/g) || [];
        const listItems = items.map((item, index) => {
            const text = (0, content_utils_1.stripHtmlTags)(item.replace(/<\/?li>/g, ''));
            return `${index + 1}. ${text}`;
        }).join('\n');
        return `${listItems}\n\n`;
    });
    // Convert code blocks
    markdown = markdown.replace(/<ac:structured-macro[^>]*ac:name="code"[^>]*>(.*?)<\/ac:structured-macro>/gs, (match, content) => {
        const codeContent = (0, content_utils_1.stripHtmlTags)(content);
        return `\`\`\`\n${codeContent}\n\`\`\`\n\n`;
    });
    // Convert inline code
    markdown = markdown.replace(/<code>(.*?)<\/code>/g, (match, content) => {
        return `\`${(0, content_utils_1.stripHtmlTags)(content)}\``;
    });
    // Convert bold and italic
    markdown = markdown.replace(/<strong>(.*?)<\/strong>/g, '**$1**');
    markdown = markdown.replace(/<em>(.*?)<\/em>/g, '*$1*');
    // Remove remaining HTML tags
    markdown = (0, content_utils_1.stripHtmlTags)(markdown);
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
const matchesKeywords = (page, keywords) => {
    if (!keywords || keywords.length === 0) {
        return { matches: true, matchedKeywords: [] }; // No filtering if no keywords
    }
    // Combine title and body content for searching
    const title = (page.title || '').toLowerCase();
    const content = (page.body?.storage?.value || '').toLowerCase();
    const searchableContent = `${title} ${content}`;
    const matchedKeywords = [];
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
const formatConfluencePagesAsMarkdown = async (pages) => {
    let filteredPages = pages;
    let usedKeywords = [];
    let totalFetched = pages.length;
    // Apply keyword filtering if enabled
    if (environment_1.ENV_VARS.CONFLUENCE_FILTER_ENABLED) {
        console.log(`\n🔍 Applying adaptive keyword filtering on ${pages.length} pre-fetched pages...`);
        try {
            // Use the adaptive keyword extraction which handles the entire flow
            const result = await (0, keyword_extractor_1.extractKeywordsWithAdaptiveCount)(pages);
            filteredPages = result.filteredPages;
            usedKeywords = result.keywords;
            console.log(`📊 Final result: ${filteredPages.length} pages selected from ${totalFetched} total pages`);
            console.log(`🔑 Used keywords: ${usedKeywords.slice(0, 5).join(', ')}${usedKeywords.length > 5 ? '...' : ''}`);
        }
        catch (error) {
            console.warn('⚠️  Keyword filtering failed, using all pages:', error instanceof Error ? error.message : 'Unknown error');
            filteredPages = pages;
        }
    }
    let content = '';
    for (const page of filteredPages) {
        content += `## ${page.title}(${page.id}) \n\n`;
        content += page.body.storage.value.trim() + ' \n\n';
    }
    const cleanContent = (0, content_utils_1.stripHtmlTags)(content);
    const filteringNote = environment_1.ENV_VARS.CONFLUENCE_FILTER_ENABLED
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
${environment_1.ENV_VARS.CONFLUENCE_FILTER_ENABLED ? '*Filtered based on adaptive JIRA keyword extraction*' : ''}
`;
    return markdown;
};
exports.formatConfluencePagesAsMarkdown = formatConfluencePagesAsMarkdown;
/**
 * Formats Confluence pages with full content as markdown (used after filtering)
 * @param pages - Array of Confluence pages with full content
 * @param totalFetched - Total number of pages fetched in phase 1
 * @returns Formatted markdown string
 */
const formatConfluencePagesWithFullContent = async (pages, totalFetched) => {
    console.log(`\n📝 Formatting ${pages.length} pages with full content...`);
    // Use array for efficient memory usage instead of string concatenation
    const contentParts = [];
    for (const page of pages) {
        contentParts.push(`## ${page.title}(${page.id}) \n\n`);
        // Use optimized content extraction
        const pageContent = (0, content_utils_1.extractPageContent)(page);
        contentParts.push(pageContent + ' \n\n');
    }
    const content = (0, content_utils_1.buildContent)(contentParts);
    const cleanContent = (0, content_utils_1.stripHtmlTags)(content);
    const filteringNote = environment_1.ENV_VARS.CONFLUENCE_FILTER_ENABLED
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
${environment_1.ENV_VARS.CONFLUENCE_FILTER_ENABLED ? '*Filtered based on adaptive JIRA keyword extraction*' : ''}
`;
    return markdown;
};
exports.formatConfluencePagesWithFullContent = formatConfluencePagesWithFullContent;
/**
 * Fetches Confluence pages using two-phase approach and creates Project.md file
 * Phase 1: Fetch minimal data for filtering and save page IDs
 * Phase 2: Fetch full content for filtered pages and save to Project.md
 * @param outputPath - Optional output path, defaults to tmp/Project.md
 * @param storeInVector - Whether to store in vector database (default: true)
 * @returns Promise resolving to the created file path
 */
const fetchAndSaveConfluencePages = async (outputPath, storeInVector = true) => {
    try {
        const confluenceUtil = new ConfluenceUtil();
        // Phase 1: Fetch pages with minimal data for filtering
        console.log('\n=== Phase 1: Fetching pages for filtering ===');
        const minimalPages = await confluenceUtil.fetchAllSpacePages(); // No expand = minimal data
        if (minimalPages.length === 0) {
            throw new Error('No pages found in the specified Confluence space');
        }
        // Apply filtering and save page IDs
        let filteredPageIds = [];
        if (environment_1.ENV_VARS.CONFLUENCE_FILTER_ENABLED) {
            console.log('\n🔍 Applying adaptive keyword filtering...');
            const result = await (0, keyword_extractor_1.extractKeywordsWithAdaptiveCount)(minimalPages);
            filteredPageIds = result.filteredPages.map(page => page.id);
            console.log(`📊 Filtered to ${filteredPageIds.length} pages from ${minimalPages.length} total`);
        }
        else {
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
        const markdownContent = await (0, exports.formatConfluencePagesWithFullContent)(fullContentPages, minimalPages.length);
        const defaultPath = path.join(process.cwd(), environment_1.ENV_VARS.TMP_DIR_PATH, environment_1.ENV_VARS.PROJECT_MARKDOWN_FILENAME);
        const filePath = outputPath || defaultPath;
        const dir = path.dirname(filePath);
        await fs.ensureDir(dir);
        await fs.writeFile(filePath, markdownContent, 'utf8');
        console.log(`\n✅ Confluence documentation saved to: ${filePath}`);
        console.log(`📄 Processed ${fullContentPages.length} pages with full content`);
        // Store in vector database if enabled
        if (storeInVector && environment_1.ENV_VARS.VECTOR_STORE_TYPE === 'QDRANT') {
            try {
                console.log('\n📦 Storing Confluence pages in vector database...');
                await (0, vector_helper_1.storeConfluencePagesInVector)(fullContentPages);
                console.log('✅ Confluence pages stored in vector database successfully');
            }
            catch (vectorError) {
                console.warn('⚠️ Failed to store Confluence pages in vector database:', vectorError instanceof Error ? vectorError.message : 'Unknown error');
            }
        }
        return filePath;
    }
    catch (error) {
        console.error('❌ Failed to fetch and save Confluence pages:', error instanceof Error ? error.message : 'Unknown error');
        throw error;
    }
};
exports.fetchAndSaveConfluencePages = fetchAndSaveConfluencePages;
/**
 * Creates a summary of Confluence pages
 * @param outputPath - Optional output path, defaults to tmp/ConfluenceSummary.md
 * @returns Promise resolving to the created summary file path
 */
const createConfluenceSummary = async (outputPath) => {
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
- **Link**: [View Page](${environment_1.ENV_VARS.CONFLUENCE_URL}/pages/viewpage.action?pageId=${page.id})

`;
        });
        summaryContent += `---
*Summary generated from Confluence*`;
        const defaultPath = path.join(process.cwd(), environment_1.ENV_VARS.TMP_DIR_PATH, 'ConfluenceSummary.md');
        const filePath = outputPath || defaultPath;
        const dir = path.dirname(filePath);
        await fs.ensureDir(dir);
        await fs.writeFile(filePath, summaryContent, 'utf8');
        console.log(`Confluence summary saved to: ${filePath}`);
        console.log(`Summarized ${pages.length} pages from Confluence space`);
        return filePath;
    }
    catch (error) {
        console.error('Failed to create Confluence summary:', error instanceof Error ? error.message : 'Unknown error');
        throw error;
    }
};
exports.createConfluenceSummary = createConfluenceSummary;
