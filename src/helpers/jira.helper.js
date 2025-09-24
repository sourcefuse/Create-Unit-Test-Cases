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
exports.createJiraSummary = exports.fetchMultipleJiraDetails = exports.fetchAndSaveJiraDetails = exports.extractKeywordsFromJiraFile = exports.extractKeywordsFromJiraContent = exports.formatJiraAsMarkdown = void 0;
const environment_1 = require("../environment");
const jira_util_1 = require("../utils/jira.util");
const openrouter_client_1 = require("../utils/openrouter-client");
const fs = __importStar(require("fs-extra"));
const path = __importStar(require("path"));
/**
 * Parses JIRA ADF (Atlassian Document Format) content to plain text
 * @param content - ADF content array
 * @returns Plain text string
 */
const parseADFContent = (content) => {
    let text = '';
    for (const node of content) {
        if (node.type === 'text' && node.text) {
            text += node.text;
        }
        else if (node.type === 'paragraph' && node.content) {
            text += parseADFContent(node.content) + '\n\n';
        }
        else if (node.type === 'bulletList' && node.content) {
            for (const listItem of node.content) {
                if (listItem.type === 'listItem' && listItem.content) {
                    text += '- ' + parseADFContent(listItem.content) + '\n';
                }
            }
            text += '\n';
        }
        else if (node.type === 'orderedList' && node.content) {
            for (let i = 0; i < node.content.length; i++) {
                const listItem = node.content[i];
                if (listItem && listItem.type === 'listItem' && listItem.content) {
                    text += `${i + 1}. ` + parseADFContent(listItem.content) + '\n';
                }
            }
            text += '\n';
        }
        else if (node.type === 'heading' && node.content) {
            const level = node.attrs?.level || 1;
            text += '#'.repeat(level) + ' ' + parseADFContent(node.content) + '\n\n';
        }
        else if (node.type === 'codeBlock' && node.content) {
            text += '```\n' + parseADFContent(node.content) + '\n```\n\n';
        }
        else if (node.content) {
            text += parseADFContent(node.content);
        }
    }
    return text.trim();
};
/**
 * Extracts description text from JIRA description field
 * @param description - JIRA description (string or ADF object)
 * @returns Plain text description
 */
const extractDescriptionText = (description) => {
    if (!description) {
        return 'No description provided';
    }
    if (typeof description === 'string') {
        return description;
    }
    if (typeof description === 'object' && description.content) {
        return parseADFContent(description.content);
    }
    return 'Description format not supported';
};
/**
 * Formats JIRA issue data as markdown
 * @param jiraIssue - JIRA issue object
 * @returns Formatted markdown string
 */
const formatJiraAsMarkdown = (jiraIssue) => {
    const { key, fields } = jiraIssue;
    const { summary, description, issuetype, priority, status } = fields;
    const descriptionText = extractDescriptionText(description);
    return `# JIRA Issue: ${key}

## Summary
${summary}

## Details
- **Issue Type**: ${issuetype.name}
- **Priority**: ${priority.name}
- **Status**: ${status.name}
- **Status Category**: ${status.statusCategory.name}

## Description
${descriptionText}

`;
};
exports.formatJiraAsMarkdown = formatJiraAsMarkdown;
/**
 * Extracts keywords from JIRA markdown content using AI
 * @param markdownContent - JIRA markdown content
 * @param jiraKey - JIRA issue key (for logging)
 * @param keywordCount - Number of keywords to extract (default: 10)
 * @returns Promise resolving to extracted keywords array
 */
const extractKeywordsFromJiraContent = async (markdownContent, jiraKey, keywordCount = 10) => {
    try {
        console.log('\n=== AI Keyword Extraction ===');
        console.log('Sending JIRA content to OpenRouter AI for keyword extraction...');
        const aiKeywords = await (0, openrouter_client_1.extractImportantKeywords)(markdownContent, keywordCount);
        if (aiKeywords && aiKeywords.length > 0) {
            console.log('✅ AI keyword extraction completed successfully');
            console.log(`Keywords: ${aiKeywords.join(', ')}`);
            return aiKeywords;
        }
        else {
            console.warn('⚠️  No keywords extracted by AI');
            return [];
        }
    }
    catch (aiError) {
        console.error('❌ AI keyword extraction failed:', aiError instanceof Error ? aiError.message : 'Unknown error');
        if (environment_1.ENV_VARS.STOP_ON_AI_ERROR) {
            console.error('🛑 Stopping execution due to AI error (STOP_ON_AI_ERROR=true)');
            throw new Error(`AI keyword extraction failed: ${aiError instanceof Error ? aiError.message : 'Unknown error'}`);
        }
        else {
            console.warn('⚠️  Continuing without AI-generated keywords (STOP_ON_AI_ERROR=false)...');
            return [];
        }
    }
};
exports.extractKeywordsFromJiraContent = extractKeywordsFromJiraContent;
/**
 * Extracts keywords from existing Jira.md file using AI
 * @param jiraFilePath - Optional path to Jira.md file, defaults to tmp/Jira.md
 * @param keywordCount - Number of keywords to extract (default: 10)
 * @returns Promise resolving to extracted keywords array
 */
const extractKeywordsFromJiraFile = async (jiraFilePath, keywordCount = 10) => {
    try {
        const defaultPath = path.join(process.cwd(), environment_1.ENV_VARS.TMP_DIR_PATH, environment_1.ENV_VARS.JIRA_MARKDOWN_FILENAME);
        const filePath = jiraFilePath || defaultPath;
        // Check if file exists
        if (!await fs.pathExists(filePath)) {
            throw new Error(`JIRA markdown file not found: ${filePath}`);
        }
        // Read the markdown content
        const markdownContent = await fs.readFile(filePath, 'utf8');
        // Extract JIRA key from content or filename
        const jiraKeyMatch = markdownContent.match(/# JIRA Issue: (\S+)/);
        const jiraKey = jiraKeyMatch ? jiraKeyMatch[1] : 'UNKNOWN';
        console.log(`Reading JIRA content from: ${filePath}`);
        console.log(`Extracted JIRA key: ${jiraKey}`);
        return await (0, exports.extractKeywordsFromJiraContent)(markdownContent, jiraKey || 'UNKNOWN', keywordCount);
    }
    catch (error) {
        console.error('Failed to extract keywords from JIRA file:', error instanceof Error ? error.message : 'Unknown error');
        throw error;
    }
};
exports.extractKeywordsFromJiraFile = extractKeywordsFromJiraFile;
/**
 * Fetches JIRA details and creates markdown file
 * @param jiraId - Optional JIRA ID, defaults to ENV_VARS.JIRA_TICKET_ID
 * @param outputPath - Optional output path, defaults to tmp/Jira.md
 * @param storeInVector - Whether to store in vector database (default: false)
 * @returns Promise resolving to the created file path
 */
const fetchAndSaveJiraDetails = async (jiraId, outputPath, storeInVector = false) => {
    try {
        const jiraUtil = new jira_util_1.JiraUtil();
        const ticketId = jiraId;
        if (!ticketId) {
            throw new Error('JIRA ticket ID is required. Provide jiraId parameter.');
        }
        const jiraIssue = await jiraUtil.fetchJiraDetails(ticketId);
        const markdownContent = (0, exports.formatJiraAsMarkdown)(jiraIssue);
        const defaultPath = path.join(process.cwd(), environment_1.ENV_VARS.TMP_DIR_PATH, environment_1.ENV_VARS.JIRA_MARKDOWN_FILENAME);
        const filePath = outputPath || defaultPath;
        const dir = path.dirname(filePath);
        await fs.ensureDir(dir);
        await fs.writeFile(filePath, markdownContent, 'utf8');
        console.log(`JIRA details saved to: ${filePath}`);
        console.log(`Issue: ${jiraIssue.key} - ${jiraIssue.fields.summary}`);
        // JIRA vector storage disabled - only Confluence data is stored in vector DB
        return filePath;
    }
    catch (error) {
        console.error('Failed to fetch and save JIRA details:', error instanceof Error ? error.message : 'Unknown error');
        throw error;
    }
};
exports.fetchAndSaveJiraDetails = fetchAndSaveJiraDetails;
/**
 * Fetches multiple JIRA issues and creates individual markdown files
 * @param jiraIds - Array of JIRA IDs
 * @param outputDir - Optional output directory, defaults to tmp/
 * @returns Promise resolving to array of created file paths
 */
const fetchMultipleJiraDetails = async (jiraIds, outputDir) => {
    const createdFiles = [];
    const baseDir = outputDir || path.join(process.cwd(), environment_1.ENV_VARS.TMP_DIR_PATH);
    for (const jiraId of jiraIds) {
        try {
            const fileName = `${jiraId.replace('/', '-')}.md`;
            const filePath = path.join(baseDir, fileName);
            const createdPath = await (0, exports.fetchAndSaveJiraDetails)(jiraId, filePath);
            createdFiles.push(createdPath);
        }
        catch (error) {
            console.error(`Failed to fetch JIRA ${jiraId}:`, error instanceof Error ? error.message : 'Unknown error');
        }
    }
    return createdFiles;
};
exports.fetchMultipleJiraDetails = fetchMultipleJiraDetails;
/**
 * Creates a summary markdown file from multiple JIRA issues
 * @param jiraIds - Array of JIRA IDs
 * @param outputPath - Optional output path, defaults to tmp/JiraSummary.md
 * @returns Promise resolving to the created summary file path
 */
const createJiraSummary = async (jiraIds, outputPath) => {
    try {
        const jiraUtil = new jira_util_1.JiraUtil();
        const issues = [];
        console.log(`Fetching ${jiraIds.length} JIRA issues for summary...`);
        for (const jiraId of jiraIds) {
            try {
                const issue = await jiraUtil.fetchJiraDetails(jiraId);
                issues.push(issue);
            }
            catch (error) {
                console.error(`Failed to fetch ${jiraId}:`, error instanceof Error ? error.message : 'Unknown error');
            }
        }
        let summaryContent = `# JIRA Issues Summary

**Total Issues**: ${issues.length}
**Generated on**: ${new Date().toISOString()}
**Project**: ${environment_1.ENV_VARS.JIRA_PROJECT_KEY}

---

`;
        issues.forEach((issue, index) => {
            const { key, fields } = issue;
            summaryContent += `## ${index + 1}. ${key}: ${fields.summary}

- **Type**: ${fields.issuetype.name}
- **Priority**: ${fields.priority.name}
- **Status**: ${fields.status.name}
- **Link**: [${key}](${environment_1.ENV_VARS.JIRA_URL}/browse/${key})

`;
        });
        summaryContent += `---
*Summary generated with JIRA Helper*`;
        const defaultPath = path.join(process.cwd(), environment_1.ENV_VARS.TMP_DIR_PATH, 'JiraSummary.md');
        const filePath = outputPath || defaultPath;
        const dir = path.dirname(filePath);
        await fs.ensureDir(dir);
        await fs.writeFile(filePath, summaryContent, 'utf8');
        console.log(`JIRA summary saved to: ${filePath}`);
        console.log(`Processed ${issues.length} issues successfully`);
        return filePath;
    }
    catch (error) {
        console.error('Failed to create JIRA summary:', error instanceof Error ? error.message : 'Unknown error');
        throw error;
    }
};
exports.createJiraSummary = createJiraSummary;
