"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = void 0;
const environment_1 = require("./environment");
const jira_helper_1 = require("./helpers/jira.helper");
const confluence_helper_1 = require("./helpers/confluence.helper");
/**
 * Main entry point for the application
 */
const main = async () => {
    console.log('TypeScript project initialized successfully!');
    const missingVars = (0, environment_1.validateEnvironment)();
    if (missingVars.length > 0) {
        console.warn('Missing required environment variables:', missingVars);
        return;
    }
    try {
        console.log('=== Fetching JIRA Details ===');
        await (0, jira_helper_1.fetchAndSaveJiraDetails)(); // JIRA data saved to file only
        console.log('\n=== Fetching Confluence Pages with Adaptive Keyword Filtering ===');
        try {
            await (0, confluence_helper_1.fetchAndSaveConfluencePages)(undefined, false); // Store Confluence in vector DB
        }
        catch (confluenceError) {
            console.warn('Confluence fetch failed:', confluenceError instanceof Error ? confluenceError.message : 'Unknown error');
            console.warn('Continuing without Confluence documentation...');
        }
        // console.log('\n=== Documentation generation completed! ===');
    }
    catch (error) {
        console.error('Application failed:', error instanceof Error ? error.message : 'Unknown error');
        process.exit(1);
    }
};
exports.main = main;
if (require.main === module) {
    (0, exports.main)();
}
