"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.JiraUtil = void 0;
const axios_1 = __importDefault(require("axios"));
const environment_1 = require("../environment");
/**
 * JIRA utility class for API operations
 */
class JiraUtil {
    constructor() {
        this.baseUrl = environment_1.ENV_VARS.JIRA_URL;
        this.email = environment_1.ENV_VARS.JIRA_EMAIL;
        this.apiToken = environment_1.ENV_VARS.JIRA_API_TOKEN;
        this.maxResults = parseInt(environment_1.ENV_VARS.JIRA_MAX_RESULT);
        this.fetchFields = environment_1.ENV_VARS.JIRA_FETCH_FIELDS;
        this.validateConfiguration();
    }
    /**
     * Validates JIRA configuration
     * @throws Error if required configuration is missing
     */
    validateConfiguration() {
        if (!this.baseUrl) {
            throw new Error('JIRA_URL is required');
        }
        if (!this.email) {
            throw new Error('JIRA_EMAIL is required');
        }
        if (!this.apiToken) {
            throw new Error('JIRA_API_TOKEN is required');
        }
    }
    /**
     * Creates authorization header for JIRA API
     * @returns Authorization header value
     */
    getAuthHeader() {
        const credentials = Buffer.from(`${this.email}:${this.apiToken}`).toString('base64');
        return `Basic ${credentials}`;
    }
    /**
     * Creates axios instance with JIRA configuration
     */
    createAxiosInstance() {
        return axios_1.default.create({
            baseURL: `${this.baseUrl}/rest/api/3`,
            headers: {
                'Authorization': this.getAuthHeader(),
                'Accept': 'application/json',
                'Content-Type': 'application/json',
            },
            timeout: 30000,
        });
    }
    /**
     * Fetches JIRA issue details by ID
     * @param jiraId - JIRA issue ID (e.g., 'TEL-9591')
     * @returns Promise resolving to JIRA issue details
     * @throws Error if issue is not found or API call fails
     */
    async fetchJiraDetails(jiraId) {
        try {
            if (!jiraId) {
                throw new Error('JIRA ID is required');
            }
            const axiosInstance = this.createAxiosInstance();
            console.log(`Fetching JIRA details for: ${jiraId}`);
            const response = await axiosInstance.get(`/issue/${jiraId}`, {
                params: {
                    fields: this.fetchFields,
                },
            });
            console.log(`Successfully fetched JIRA details for: ${jiraId}`);
            return response.data;
        }
        catch (error) {
            if (error.response) {
                const status = error.response?.status;
                const data = error.response?.data;
                if (status === 404) {
                    throw new Error(`JIRA issue not found: ${jiraId}`);
                }
                else if (status === 401) {
                    throw new Error('JIRA authentication failed. Check email and API token.');
                }
                else if (status === 403) {
                    throw new Error('Access denied. Check JIRA permissions.');
                }
                else {
                    const errorMessage = data?.errorMessages?.join(', ') || error.message;
                    throw new Error(`JIRA API error: ${errorMessage}`);
                }
            }
            throw new Error(`Failed to fetch JIRA details: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    /**
     * Searches for JIRA issues using JQL
     * @param jql - JQL query string
     * @returns Promise resolving to JIRA search results
     */
    async searchIssues(jql) {
        try {
            if (!jql) {
                throw new Error('JQL query is required');
            }
            const axiosInstance = this.createAxiosInstance();
            console.log(`Executing JQL search: ${jql}`);
            const response = await axiosInstance.post('/search/jql', {
                jql,
                maxResults: this.maxResults,
                fields: this.fetchFields.split(','),
            });
            console.log(`Found ${response.data.total} issues`);
            return response.data;
        }
        catch (error) {
            if (error.response) {
                const data = error.response?.data;
                const errorMessage = data?.errorMessages?.join(', ') || error.message;
                throw new Error(`JIRA search failed: ${errorMessage}`);
            }
            throw new Error(`Failed to search JIRA issues: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    /**
     * Fetches issues for a specific project
     * @param projectKey - JIRA project key (e.g., 'TEL')
     * @returns Promise resolving to project issues
     */
    async fetchProjectIssues(projectKey) {
        const jql = `project = ${projectKey} ORDER BY created DESC`;
        return this.searchIssues(jql);
    }
}
exports.JiraUtil = JiraUtil;
