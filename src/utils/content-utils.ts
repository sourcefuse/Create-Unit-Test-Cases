/**
 * Shared utility functions for content processing
 */

/**
 * Strips HTML tags from content and converts to plain text
 * @param htmlString - HTML content string
 * @returns Plain text string
 */
export function stripHtmlTags(htmlString: string): string {
  return htmlString
    .replace(/<[^>]*>/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .split('\n\n')
    .join('\n')
    .split('\n\n')
    .join('\n')
    .split('{')
    .join('')
    .split('}')
    .join('')
    .split('@sourcefuse.com')
    .join('');
}

/**
 * Efficiently builds large strings using array join instead of concatenation
 * @param parts - Array of string parts to join
 * @param separator - Separator between parts (default: '')
 * @returns Joined string
 */
export function buildContent(parts: string[], separator: string = ''): string {
  return parts.join(separator);
}

/**
 * Chunks an array into smaller arrays for batch processing
 * @param array - Array to chunk
 * @param chunkSize - Size of each chunk
 * @returns Array of chunks
 */
export function chunkArray<T>(array: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
}

/**
 * Extracts page content with fallback priority
 * @param page - Confluence page object
 * @returns Content string
 */
export function extractPageContent(page: any): string {
  if (page.body?.view?.value) {
    return page.body.view.value.trim();
  }
  if (page.body?.storage?.value) {
    return page.body.storage.value.trim();
  }
  return 'No content available';
}