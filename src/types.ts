/**
 * JIRA issue type interface
 */
export interface JiraIssueType {
  self: string;
  id: string;
  name: string;
  subtask: boolean;
}

/**
 * JIRA priority interface
 */
export interface JiraPriority {
  self: string;
  iconUrl: string;
  name: string;
  id: string;
}

/**
 * JIRA status interface
 */
export interface JiraStatus {
  self: string;
  description: string;
  iconUrl: string;
  name: string;
  id: string;
  statusCategory: {
    self: string;
    id: number;
    key: string;
    colorName: string;
    name: string;
  };
}

/**
 * JIRA Atlassian Document Format (ADF) content interface
 */
export interface JiraADFContent {
  type: string;
  content?: JiraADFContent[];
  text?: string;
  attrs?: any;
  marks?: any[];
}

/**
 * JIRA description interface (can be string or ADF object)
 */
export interface JiraDescription {
  type?: string;
  version?: number;
  content?: JiraADFContent[];
}

/**
 * JIRA issue fields interface
 */
export interface JiraIssueFields {
  summary: string;
  description?: string | JiraDescription;
  issuetype: JiraIssueType;
  priority: JiraPriority;
  status: JiraStatus;
  [key: string]: any;
}

/**
 * JIRA issue interface
 */
export interface JiraIssue {
  expand: string;
  id: string;
  self: string;
  key: string;
  fields: JiraIssueFields;
}

/**
 * JIRA API response interface
 */
export interface JiraApiResponse {
  expand: string;
  startAt: number;
  maxResults: number;
  total: number;
  issues: JiraIssue[];
}

/**
 * JIRA API error interface
 */
export interface JiraApiError {
  errorMessages: string[];
  errors: Record<string, string>;
}

/**
 * Confluence page content interface
 */
export interface ConfluenceContent {
  representation: string;
  value: string;
}

/**
 * Confluence page version interface
 */
export interface ConfluenceVersion {
  by: {
    type: string;
    displayName: string;
    userKey?: string;
  };
  when: string;
  number: number;
  message?: string;
}

/**
 * Confluence page space interface
 */
export interface ConfluenceSpace {
  key: string;
  name: string;
  type: string;
}

/**
 * Confluence page interface
 */
export interface ConfluencePage {
  id: string;
  type: string;
  status: string;
  title: string;
  space: ConfluenceSpace;
  version: ConfluenceVersion;
  body?: {
    storage?: ConfluenceContent;
    view?: ConfluenceContent;
    export_view?: ConfluenceContent;
  };
  _links: {
    webui: string;
    self: string;
  };
}

/**
 * Confluence API response interface
 */
export interface ConfluenceApiResponse {
  results: ConfluencePage[];
  start: number;
  limit: number;
  size: number;
  _links: {
    base: string;
    context: string;
    self: string;
    next?: string;
    prev?: string;
  };
}

/**
 * Confluence API error interface
 */
export interface ConfluenceApiError {
  statusCode: number;
  message: string;
  reason?: string;
}

/**
 * Role interface
 */
export interface Role {
  id: string;
  name: string;
}