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
exports.findRelatedConfluenceSimple = findRelatedConfluenceSimple;
exports.runSimpleSearch = runSimpleSearch;
const fs = __importStar(require("fs-extra"));
const path = __importStar(require("path"));
const environment_1 = require("../environment");
/**
 * Calculate simple relevance score based on keyword matching
 */
function calculateRelevance(content, keywords) {
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
function extractKeywords(jiraContent) {
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
async function findRelatedConfluenceSimple(jiraFilePath, limit = 10) {
    try {
        // Read JIRA content
        const jiraPath = jiraFilePath || path.join(process.cwd(), environment_1.ENV_VARS.TMP_DIR_PATH, environment_1.ENV_VARS.JIRA_MARKDOWN_FILENAME);
        const jiraContent = await fs.readFile(jiraPath, 'utf8');
        // Read Confluence content
        const confluencePath = path.join(process.cwd(), environment_1.ENV_VARS.TMP_DIR_PATH, environment_1.ENV_VARS.PROJECT_MARKDOWN_FILENAME);
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
        const results = [];
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
    }
    catch (error) {
        console.error('Error in simple search:', error);
        return [];
    }
}
/**
 * CLI command for simple search
 */
async function runSimpleSearch() {
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
        console.log(`   🔗 URL: ${environment_1.ENV_VARS.CONFLUENCE_URL}/pages/viewpage.action?pageId=${result.pageId}`);
        console.log(`   📝 Content Preview: ${result.contentSnippet}\n`);
    });
    console.log(`💡 Tip: Use these Page IDs to reference related documentation in your implementation.`);
}
// CLI entry point
if (require.main === module) {
    runSimpleSearch().catch(console.error);
}
