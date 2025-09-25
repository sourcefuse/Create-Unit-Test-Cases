import { ENV_VARS, validateEnvironment } from './environment';
import { fetchAndSaveJiraDetails } from './helpers/jira.helper';
import { fetchAndSaveConfluencePages } from './helpers/confluence.helper';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Main entry point for the application
 */
export const main = async (): Promise<void> => {
  console.log('TypeScript project initialized successfully!');
  const JiraFilePath = path.join(ENV_VARS.TMP_DIR_PATH,ENV_VARS.JIRA_MARKDOWN_FILENAME);
  const ConfluenceFilePath = path.join(ENV_VARS.TMP_DIR_PATH,ENV_VARS.PROJECT_MARKDOWN_FILENAME);

  const missingVars = validateEnvironment();
  if (missingVars.length > 0) {
    console.warn('Missing required environment variables:', missingVars);
    return;
  }

  try {
    console.log('=== Fetching JIRA Details');
    await fetchAndSaveJiraDetails(ENV_VARS.JIRA_TICKET_ID, JiraFilePath); // JIRA data saved to file only

    console.log('\n=== Fetching Confluence Pages with Adaptive Keyword Filtering ===');
    try {
      await fetchAndSaveConfluencePages(ConfluenceFilePath, JiraFilePath ,false); // Store Confluence in vector DB
    } catch (confluenceError) {
      console.warn('Confluence fetch failed:', confluenceError instanceof Error ? confluenceError.message : 'Unknown error');
      console.warn('Continuing without Confluence documentation...');
    }

    // console.log('\n=== Documentation generation completed! ===');
  } catch (error) {
    console.log(error);
    console.error('Application failed:', error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
};

if (require.main === module) {
  main();
}