import * as fs from 'fs-extra';
import * as path from 'path';
import { ENV_VARS } from '../environment';

// Cache for JIRA content to avoid multiple file reads
let jiraContentCache: { [filePath: string]: string } = {};

/**
 * Keyword extraction utility for JIRA content
 */

// Common stop words to filter out
const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'been', 'by', 'for', 'from',
  'has', 'have', 'he', 'in', 'is', 'it', 'its', 'of', 'on', 'that', 'the',
  'to', 'was', 'will', 'with', 'this', 'they', 'their', 'these', 'those',
  'what', 'when', 'where', 'who', 'which', 'why', 'how', 'can', 'could',
  'should', 'would', 'may', 'might', 'must', 'shall', 'we', 'you', 'your',
  'our', 'my', 'i', 'me', 'him', 'her', 'them', 'us', 'need', 'needs',
  'or', 'but', 'if', 'then', 'else', 'so', 'no', 'not', 'only', 'just',
  'more', 'most', 'less', 'least', 'very', 'all', 'any', 'some', 'many',
  'much', 'few', 'little', 'own', 'same', 'other', 'another', 'such',
  'there', 'here', 'also', 'too', 'than', 'into', 'upon', 'up', 'down',
  'out', 'off', 'over', 'under', 'about', 'through', 'during', 'before',
  'after', 'above', 'below', 'between', 'within', 'without', 'along'
]);

// Technical and domain-specific terms to prioritize
const PRIORITY_TERMS = new Set([
  'api', 'endpoint', 'virtual', 'background', 'administrator', 'admin',
  'user', 'users', 'manage', 'management', 'add', 'update', 'delete',
  'create', 'crud', 'set', 'default', 'image', 'images', 'upload',
  'backend', 'frontend', 'database', 'authentication', 'authorization',
  'permission', 'permissions', 'role', 'roles', 'service', 'services',
  'implementation', 'implement', 'feature', 'functionality', 'requirement'
]);

interface KeywordInfo {
  word: string;
  frequency: number;
  weight: number;
}

/**
 * Extract keywords from text with frequency and importance weighting
 */
function extractKeywordsFromText(text: string): KeywordInfo[] {
  // Convert to lowercase and extract words
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2); // Filter out very short words

  // Count word frequencies
  const wordFreq = new Map<string, number>();
  for (const word of words) {
    if (!STOP_WORDS.has(word)) {
      wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
    }
  }

  // Calculate weights and create keyword info
  const keywords: KeywordInfo[] = [];
  for (const [word, frequency] of wordFreq.entries()) {
    let weight = frequency;
    
    // Boost weight for priority terms
    if (PRIORITY_TERMS.has(word)) {
      weight *= 3;
    }
    
    // Boost weight for longer words (usually more specific)
    if (word.length > 7) {
      weight *= 1.5;
    }
    
    keywords.push({ word, frequency, weight });
  }

  // Sort by weight (descending)
  keywords.sort((a, b) => b.weight - a.weight);

  return keywords;
}

/**
 * Extract keywords from JIRA markdown file
 */
export async function extractJiraKeywords(
  jiraFilePath?: string,
  keywordCount: number = 5
): Promise<string[]> {
  try {
    // Read JIRA content with caching
    const jiraPath = jiraFilePath || path.join(process.cwd(), ENV_VARS.TMP_DIR_PATH, ENV_VARS.JIRA_MARKDOWN_FILENAME);
    
    let jiraContent: string;
    
    // Check cache first
    if (jiraContentCache[jiraPath]) {
      console.log(`Using cached JIRA content from: ${jiraPath}`);
      jiraContent = jiraContentCache[jiraPath];
    } else {
      console.log(`Reading JIRA content from: ${jiraPath}`);
      
      if (!await fs.pathExists(jiraPath)) {
        throw new Error(`JIRA file not found: ${jiraPath}`);
      }
      
      jiraContent = await fs.readFile(jiraPath, 'utf8');
      jiraContentCache[jiraPath] = jiraContent; // Cache the content
    }
    
    // Extract sections for weighted analysis
    const summaryMatch = jiraContent.match(/## Summary\s+(.*?)(?=##|$)/s);
    const descriptionMatch = jiraContent.match(/## Description\s+(.*?)$/s);
    const detailsMatch = jiraContent.match(/## Details\s+(.*?)(?=##|$)/s);
    
    let weightedText = '';
    
    // Give more weight to summary (appear 3 times)
    if (summaryMatch && summaryMatch[1]) {
      weightedText += (summaryMatch[1] + ' ').repeat(3);
    }
    
    // Give medium weight to description (appear 2 times)
    if (descriptionMatch && descriptionMatch[1]) {
      weightedText += (descriptionMatch[1] + ' ').repeat(2);
    }
    
    // Normal weight for details
    if (detailsMatch && detailsMatch[1]) {
      weightedText += detailsMatch[1] + ' ';
    }
    
    // Add the full content once for completeness
    weightedText += jiraContent;
    
    // Extract keywords
    const keywordInfo = extractKeywordsFromText(weightedText);
    
    // Select top keywords based on provided count
    const topKeywords = keywordInfo.slice(0, keywordCount).map(k => k.word);
    
    console.log(`Extracted ${topKeywords.length} keywords`);
    console.log(`Keywords: ${topKeywords.join(', ')}`);
    
    return topKeywords;
    
  } catch (error) {
    console.error('Error extracting keywords:', error instanceof Error ? error.message : 'Unknown error');
    throw error;
  }
}

/**
 * Save filtered page IDs to pages.txt file
 */
async function savePageIds(filteredPages: any[]): Promise<void> {
  try {
    const pageIds = filteredPages.map(page => page.id);
    const pagesFilePath = path.join(process.cwd(), ENV_VARS.TMP_DIR_PATH, 'pages.txt');
    
    // Ensure directory exists
    await fs.ensureDir(path.dirname(pagesFilePath));
    
    // Create content with page IDs
    let content = ``;
    // Add page IDs with titles as comments
    for (const page of filteredPages) {
      content += `${page.id}\n`;
    }
    
    await fs.writeFile(pagesFilePath, content, 'utf8');
    
    console.log(`📄 Saved ${pageIds.length} page IDs to: ${pagesFilePath}`);
    
  } catch (error) {
    console.error('Failed to save page IDs:', error instanceof Error ? error.message : 'Unknown error');
  }
}

/**
 * Load page IDs from pages.txt file
 */
export async function loadPageIds(): Promise<string[]> {
  try {
    const pagesFilePath = path.join(process.cwd(), ENV_VARS.TMP_DIR_PATH, 'pages.txt');
    
    if (!await fs.pathExists(pagesFilePath)) {
      console.warn('pages.txt file not found');
      return [];
    }
    
    const content = await fs.readFile(pagesFilePath, 'utf8');
    const pageIds = content
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'));
    
    console.log(`📄 Loaded ${pageIds.length} page IDs from: ${pagesFilePath}`);
    return pageIds;
    
  } catch (error) {
    console.error('Failed to load page IDs:', error instanceof Error ? error.message : 'Unknown error');
    return [];
  }
}

/**
 * Extract keywords with adaptive count based on page filtering results
 */
export async function extractKeywordsWithAdaptiveCount(
  pages: any[],
  jiraFilePath?: string
): Promise<{ keywords: string[]; filteredPages: any[] }> {
  console.log(`Starting adaptive keyword extraction with ${pages.length} total pages`);
  
  // Step 1: Start with 5 keywords
  let keywords = await extractJiraKeywords(jiraFilePath, 5);
  console.log(`Extracted 5 keywords: ${keywords.join(', ')}`);
  
  // Step 2: Filter pages with 5 keywords
  let filteredPages = filterPagesByKeywords(pages, keywords);
  console.log(`Found ${filteredPages.length} pages with 5 keywords`);
  
  // Step 3: If filtered pages < 10, fetch 10 keywords and filter again
  if (filteredPages.length < 10) {
    console.log(`Only ${filteredPages.length} pages found with 5 keywords, fetching 10 keywords...`);
    keywords = await extractJiraKeywords(jiraFilePath, 10);
    console.log(`Extracted 10 keywords: ${keywords.join(', ')}`);
    
    // Filter again with 10 keywords
    filteredPages = filterPagesByKeywords(pages, keywords);
    console.log(`Found ${filteredPages.length} pages with 10 keywords`);
  }
  
  // Step 4: Save filtered page IDs to pages.txt
  await savePageIds(filteredPages);
  
  return { keywords, filteredPages };
}

/**
 * Filter pages by keywords
 */
function filterPagesByKeywords(pages: any[], keywords: string[]): any[] {
  return pages.filter(page => {
    const title = (page.title || '').toLowerCase();
    const content = (page.body?.storage?.value || '').toLowerCase();
    const searchableContent = `${title} ${content}`;
    
    return keywords.some(keyword => 
      searchableContent.includes(keyword.toLowerCase())
    );
  });
}


/**
 * CLI command to extract keywords
 */
export async function runKeywordExtraction(): Promise<void> {
  console.log('\n📝 Extracting keywords from JIRA content...\n');
  
  try {
    const keywords = await extractJiraKeywords();
    console.log('\n✅ Keywords extraction completed successfully!');
    console.log(`📊 Total keywords extracted: ${keywords.length}`);
  } catch (error) {
    console.error('❌ Failed to extract keywords:', error instanceof Error ? error.message : 'Unknown error');
  }
}

// CLI entry point
if (require.main === module) {
  runKeywordExtraction().catch(console.error);
}