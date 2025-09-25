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
  
  const missingVars = validateEnvironment();
  if (missingVars.length > 0) {
    console.warn('Missing required environment variables:', missingVars);
    return;
  }
  
  try {
    console.log('=== Fetching JIRA Details');
    await fetchAndSaveJiraDetails(); // JIRA data saved to file only
    
    console.log('\n=== Fetching Confluence Pages with Adaptive Keyword Filtering ===');
    try {
      await fetchAndSaveConfluencePages(undefined, false); // Store Confluence in vector DB
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
  console.log(process.env);
  const filePath = process.env.TMP_DIR_PATH+"/"+"test.md";
  console.log(filePath);
  fs.writeFileSync(filePath, 'This is a sample file created by the script.');
  console.log('File created at:', path.resolve(filePath));
  const fileContent = fs.readFileSync(filePath, 'utf-8');
  console.log('File content:', fileContent);
  // main();
}