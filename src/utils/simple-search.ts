import * as fs from 'fs-extra';
import * as path from 'path';
import { ENV_VARS } from '../environment';

/**
 * Simple text-based search for finding related content
 * without using vector database (due to memory constraints)
 */

interface SearchResult {
  pageTitle: string;
  pageId: string;
  relevanceScore: number;
  contentSnippet: string;
}

/**
 * Calculate simple relevance score based on keyword matching
 */
function calculateRelevance(content: string, keywords: string[]): number {
  let score = 0;
  const lowerContent = content.toLowerCase();
  
  for (const keyword of keywords) {
    const lowerKeyword = keyword.toLowerCase();
    const matches = lowerContent.split(lowerKeyword).length - 1;
    score += matches * (keyword.length > 5 ? 2 : 1); // Longer keywords are more important
  }
  
  return score;
}

/**
 * Extract keywords from JIRA content
 */
function extractKeywords(jiraContent: string): string[] {
  // Extract meaningful words from JIRA content
  const words = jiraContent
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 3); // Filter out short words
  
  // Remove common words
  const stopWords = new Set(['this', 'that', 'with', 'from', 'have', 'been', 'were', 'will', 'would', 'could', 'should']);
  
  // Get unique keywords
  const keywords = [...new Set(words)]
    .filter(word => !stopWords.has(word.toLowerCase()))
    .slice(0, 20); // Limit to top 20 keywords
  
  return keywords;
}

/**
 * Find related Confluence content using simple text search
 */
export async function findRelatedConfluenceSimple(
  jiraFilePath?: string,
  limit: number = 10
): Promise<SearchResult[]> {
  try {
    // Read JIRA content
    const jiraPath = jiraFilePath || path.join(process.cwd(), ENV_VARS.TMP_DIR_PATH, ENV_VARS.JIRA_MARKDOWN_FILENAME);
    const jiraContent = await fs.readFile(jiraPath, 'utf8');
    
    // Read Confluence content
    const confluencePath = path.join(process.cwd(), ENV_VARS.TMP_DIR_PATH, ENV_VARS.PROJECT_MARKDOWN_FILENAME);
    
    if (!await fs.pathExists(confluencePath)) {
      console.log('Project.md not found. Please run the application first to fetch Confluence pages.');
      return [];
    }
    
    const confluenceContent = await fs.readFile(confluencePath, 'utf8');
    
    // Extract keywords from JIRA
    const keywords = extractKeywords(jiraContent);
    console.log(`Searching with keywords: ${keywords.slice(0, 5).join(', ')}...`);
    
    // Parse Confluence pages
    const pagePattern = /## (.+?)\((\d+)\)\s*\n([\s\S]*?)(?=##\s|$)/g;
    const results: SearchResult[] = [];
    
    let match;
    while ((match = pagePattern.exec(confluenceContent)) !== null) {
      const [fullMatch, title, pageId, content] = match;
      
      if (!title || !pageId || !content) {
        continue;
      }
      
      // Calculate relevance score
      const score = calculateRelevance(title + ' ' + content, keywords);
      
      if (score > 0) {
        // Extract content snippet
        const snippet = content
          .replace(/\s+/g, ' ')
          .trim()
          .substring(0, 200);
        
        results.push({
          pageTitle: title.trim(),
          pageId: pageId,
          relevanceScore: score,
          contentSnippet: snippet + (content.length > 200 ? '...' : '')
        });
      }
    }
    
    // Sort by relevance and limit results
    results.sort((a, b) => b.relevanceScore - a.relevanceScore);
    
    return results.slice(0, limit);
    
  } catch (error) {
    console.error('Error in simple search:', error);
    return [];
  }
}

/**
 * CLI command for simple search
 */
export async function runSimpleSearch(): Promise<void> {
  console.log('\n🔍 Finding related Confluence documents (using simple text search)...\n');
  
  const results = await findRelatedConfluenceSimple();
  
  if (results.length === 0) {
    console.log('❌ No related Confluence documents found');
    return;
  }
  
  console.log(`✅ Found ${results.length} related Confluence documents:\n`);
  
  results.forEach((result, index) => {
    console.log(`${index + 1}. 📄 ${result.pageTitle}`);
    console.log(`   📊 Relevance Score: ${result.relevanceScore}`);
    console.log(`   📄 Page ID: ${result.pageId}`);
    console.log(`   🔗 URL: ${ENV_VARS.CONFLUENCE_URL}/pages/viewpage.action?pageId=${result.pageId}`);
    console.log(`   📝 Content Preview: ${result.contentSnippet}\n`);
  });
  
  console.log(`💡 Tip: Use these Page IDs to reference related documentation in your implementation.`);
}

// CLI entry point
if (require.main === module) {
  runSimpleSearch().catch(console.error);
}