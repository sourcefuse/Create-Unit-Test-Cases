"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runVectorCLI = exports.VectorCLI = void 0;
const vector_helper_1 = require("../helpers/vector.helper");
/**
 * Vector Database CLI Utilities
 */
class VectorCLI {
    constructor() {
        this.vectorHelper = new vector_helper_1.VectorIntegrationHelper();
    }
    /**
     * Search for content in vector database
     * @param query - Search query
     * @param limit - Maximum results
     * @param source - Filter by source
     */
    async search(query, limit = 10, source) {
        try {
            console.log(`\n🔍 Searching for: "${query}"`);
            console.log(`📊 Limit: ${limit}, Source: ${source || 'all'}\n`);
            const results = await (0, vector_helper_1.searchVectorContent)(query, limit, source);
            if (results.length === 0) {
                console.log('❌ No results found');
                return;
            }
            console.log(`✅ Found ${results.length} results:\n`);
            results.forEach((result, index) => {
                const payload = result.payload;
                const score = result.score?.toFixed(4) || 'N/A';
                console.log(`${index + 1}. [${payload.source.toUpperCase()}] ${payload.title}`);
                console.log(`   📊 Score: ${score}`);
                if (payload.issueKey) {
                    console.log(`   🎫 Issue: ${payload.issueKey}`);
                }
                if (payload.pageId) {
                    console.log(`   📄 Page ID: ${payload.pageId}`);
                }
                if (payload.url) {
                    console.log(`   🔗 URL: ${payload.url}`);
                }
                // Show content preview (first 200 chars)
                const preview = payload.content.length > 200
                    ? payload.content.substring(0, 200) + '...'
                    : payload.content;
                console.log(`   📝 Preview: ${preview}\n`);
            });
        }
        catch (error) {
            console.error('❌ Search failed:', error instanceof Error ? error.message : 'Unknown error');
        }
    }
    /**
     * Get database statistics
     */
    async stats() {
        try {
            console.log('\n📊 Vector Database Statistics:\n');
            await this.vectorHelper.initialize();
            const info = await this.vectorHelper.getDatabaseInfo();
            console.log(`📦 Collection: ${info.collection_name || 'documentation'}`);
            console.log(`📈 Points Count: ${info.points_count || 0}`);
            console.log(`🎯 Vector Size: ${info.config?.params?.vectors?.size || 'N/A'}`);
            console.log(`📏 Distance Metric: ${info.config?.params?.vectors?.distance || 'N/A'}`);
            console.log(`💾 Status: ${info.status || 'Unknown'}`);
            if (info.config?.optimizer_status) {
                console.log(`⚡ Optimizer Status: ${JSON.stringify(info.config.optimizer_status, null, 2)}`);
            }
        }
        catch (error) {
            console.error('❌ Failed to get statistics:', error instanceof Error ? error.message : 'Unknown error');
        }
    }
    /**
     * Clear all documents from vector database
     */
    async clear() {
        try {
            console.log('\n🗑️  Clearing vector database...');
            await this.vectorHelper.initialize();
            await this.vectorHelper.clearAllDocuments();
            console.log('✅ Vector database cleared successfully');
        }
        catch (error) {
            console.error('❌ Failed to clear database:', error instanceof Error ? error.message : 'Unknown error');
        }
    }
    /**
     * Find Confluence documents related to JIRA content
     * @param jiraFilePath - Optional path to JIRA file
     * @param limit - Maximum results
     */
    async findRelated(jiraFilePath, limit = 10) {
        try {
            console.log('\n🔍 Finding Confluence documents related to JIRA content...\n');
            const results = await (0, vector_helper_1.findRelatedConfluenceDocuments)(jiraFilePath, limit);
            if (results.length === 0) {
                console.log('❌ No related Confluence documents found');
                return;
            }
            console.log(`✅ Found ${results.length} related Confluence documents:\n`);
            results.forEach((result, index) => {
                const payload = result.payload;
                const score = result.score?.toFixed(4) || 'N/A';
                console.log(`${index + 1}. 📄 ${payload.title}`);
                console.log(`   📊 Relevance Score: ${score}`);
                console.log(`   🏷️  Source: ${payload.source.toUpperCase()}`);
                if (payload.pageId) {
                    console.log(`   📄 Page ID: ${payload.pageId}`);
                }
                if (payload.url) {
                    console.log(`   🔗 URL: ${payload.url}`);
                }
                if (payload.chunkIndex !== undefined) {
                    console.log(`   📋 Chunk: ${payload.chunkIndex + 1}/${payload.totalChunks}`);
                }
                // Show content preview (first 300 chars for better context)
                const preview = payload.content.length > 300
                    ? payload.content.substring(0, 300) + '...'
                    : payload.content;
                console.log(`   📝 Content Preview: ${preview}\n`);
            });
            console.log(`💡 Tip: Use these Page IDs to reference related documentation in your implementation.`);
        }
        catch (error) {
            console.error('❌ Failed to find related documents:', error instanceof Error ? error.message : 'Unknown error');
        }
    }
}
exports.VectorCLI = VectorCLI;
/**
 * Command line interface for vector operations
 */
const runVectorCLI = async (args) => {
    const cli = new VectorCLI();
    const command = args[0];
    switch (command) {
        case 'search':
            const query = args[1];
            const limit = parseInt(args[2] || '10') || 10;
            const source = args[3];
            if (!query) {
                console.error('❌ Usage: search <query> [limit] [source]');
                return;
            }
            await cli.search(query, limit, source);
            break;
        case 'stats':
            await cli.stats();
            break;
        case 'clear':
            await cli.clear();
            break;
        case 'find-related':
        case 'related':
            const jiraPath = args[1]; // Optional JIRA file path
            const relatedLimit = parseInt(args[2] || '10') || 10;
            await cli.findRelated(jiraPath, relatedLimit);
            break;
        default:
            console.log(`
🔧 Vector Database CLI Commands:

📖 Usage:
  npm run vector search "<query>" [limit] [source]  - Search content
  npm run vector stats                              - Show database statistics  
  npm run vector clear                              - Clear all documents
  npm run vector find-related [jira-file] [limit]  - Find Confluence docs related to JIRA content

📋 Examples:
  npm run vector search "API endpoints" 5
  npm run vector search "authentication" 10 jira
  npm run vector search "user management" 5 confluence
  npm run vector find-related                      - Use default tmp/Jira.md
  npm run vector find-related tmp/custom.md 15     - Use custom JIRA file
  npm run vector stats
  npm run vector clear

🔍 Sources: jira, confluence (leave empty for all)
💡 find-related: Reads JIRA content and finds related Confluence documentation
      `);
            break;
    }
};
exports.runVectorCLI = runVectorCLI;
// CLI entry point
if (require.main === module) {
    const args = process.argv.slice(2);
    (0, exports.runVectorCLI)(args).catch(console.error);
}
