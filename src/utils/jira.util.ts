import axios from 'axios';
import { ENV_VARS } from '../environment';
import {
  JiraIssue,
  JiraApiResponse,
  JiraApiError,
} from '../types';

/**
 * JIRA utility class for API operations
 */
export class JiraUtil {
  private readonly baseUrl: string;
  private readonly email: string;
  private readonly apiToken: string;
  private readonly maxResults: number;
  private readonly fetchFields: string;

  constructor() {
    this.baseUrl = ENV_VARS.JIRA_URL;
    this.email = ENV_VARS.JIRA_EMAIL;
    this.apiToken = ENV_VARS.JIRA_API_TOKEN;
    this.maxResults = parseInt(ENV_VARS.JIRA_MAX_RESULT);
    this.fetchFields = ENV_VARS.JIRA_FETCH_FIELDS;

    this.validateConfiguration();
  }

  /**
   * Validates JIRA configuration
   * @throws Error if required configuration is missing
   */
  private validateConfiguration(): void {
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
  private getAuthHeader(): string {
    const credentials = Buffer.from(`${this.email}:${this.apiToken}`).toString('base64');
    return `Basic ${credentials}`;
  }

  /**
   * Creates axios instance with JIRA configuration
   */
  private createAxiosInstance() {
    return axios.create({
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
  public async fetchJiraDetails(jiraId: string): Promise<JiraIssue> {
    try {
      if (!jiraId) {
        throw new Error('JIRA ID is required');
      }

      const axiosInstance = this.createAxiosInstance();
      
      console.log(`Fetching JIRA details for: ${jiraId}`);
      
      const response = await axiosInstance.get<JiraIssue>(
        `/issue/${jiraId}`,
        {
          params: {
            fields: this.fetchFields,
          },
        }
      );

      console.log(`Successfully fetched JIRA details for: ${jiraId}`);
      return response.data;

    } catch (error: any) {
      if (error.response) {
        const status = error.response?.status;
        const data = error.response?.data as JiraApiError;
        
        if (status === 404) {
          throw new Error(`JIRA issue not found: ${jiraId}`);
        } else if (status === 401) {
          throw new Error('JIRA authentication failed. Check email and API token.');
        } else if (status === 403) {
          throw new Error('Access denied. Check JIRA permissions.');
        } else {
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
  public async searchIssues(jql: string): Promise<JiraApiResponse> {
    try {
      if (!jql) {
        throw new Error('JQL query is required');
      }

      const axiosInstance = this.createAxiosInstance();
      
      console.log(`Executing JQL search: ${jql}`);
      
      const response = await axiosInstance.post<JiraApiResponse>('/search/jql', {
        jql,
        maxResults: this.maxResults,
        fields: this.fetchFields.split(','),
      });

      console.log(`Found ${response.data.total} issues`);
      return response.data;

    } catch (error: any) {
      if (error.response) {
        const data = error.response?.data as JiraApiError;
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
  public async fetchProjectIssues(projectKey: string): Promise<JiraApiResponse> {
    const jql = `project = ${projectKey} ORDER BY created DESC`;
    return this.searchIssues(jql);
  }
}