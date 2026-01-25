import { getErrorMessage } from './base.js';
import type { MetaAdapter, MetaResult } from './base.js';
import console from 'node:console';

export class ElasticsearchAdapter implements MetaAdapter {
  readonly name = 'elasticsearch';
  private node: string;
  private apiKey?: string;
  private defaultTemplateId?: string;

  constructor(node: string, apiKey?: string, defaultTemplateId?: string) {
    this.node = node;
    this.apiKey = apiKey;
    this.defaultTemplateId = defaultTemplateId;
  }

  /**
   * Search across Meta API, Direct Query, and Search Templates.
   */
  async search(query: string): Promise<MetaResult[]> {
    const results: MetaResult[] = [];

    // Mode 1: Internal API (Index Mapping Search)
    const metaResults = await this.searchIndexMeta(query);
    results.push(...metaResults);

    // Mode 2: Search Query (Document Content Search)
    const docResults = await this.searchDocuments(query);
    results.push(...docResults);

    // Mode 3: Search Template (If configured)
    if (this.defaultTemplateId) {
      const templateResults = await this.searchByTemplate(
        this.defaultTemplateId,
        { query_string: query },
      );
      results.push(...templateResults);
    }

    return results;
  }

  /**
   * Mode 3: Uses ES Search Template API (_search/template).
   */
  async searchByTemplate(
    templateId: string,
    params: Record<string, any>,
  ): Promise<MetaResult[]> {
    try {
      const url = `${this.node}/_search/template`;
      const body = {
        id: templateId,
        params: params,
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const message = `ES template error: ${response.status} ${response.statusText}`;
        console.error(message);
        throw new Error(message);
      }

      const searchRes = (await response.json()) as any;
      const hits = searchRes.hits?.hits || [];

      return hits.map((hit: any) => ({
        source: 'elasticsearch_template',
        logicalName:
          hit._source.title || hit._source.name || `Template Match: ${hit._id}`,
        physicalName: hit._id,
        type: 'TEMPLATE_RESULT',
        description: `Template: ${templateId}, Score: ${hit._score}`,
        location: hit._index,
      }));
    } catch (error) {
      const message = getErrorMessage(error);
      console.error('ES search template error:', message);
      throw new Error(`Elasticsearch template search failed: ${message}`);
    }
  }

  /**
   * Mode 1: Uses ES Internal API (_cat/indices) to find matching index metadata.
   */
  private async searchIndexMeta(query: string): Promise<MetaResult[]> {
    try {
      const url = `${this.node}/_cat/indices?format=json&index=*${query}*`;
      const response = await fetch(url, { headers: this.getHeaders() });

      if (!response.ok) {
        const message = `ES meta API error: ${response.status} ${response.statusText}`;
        console.error(message);
        throw new Error(message);
      }

      const indices = (await response.json()) as any[];
      return indices.map((idx) => ({
        source: 'elasticsearch',
        logicalName: `Index: ${idx.index}`,
        physicalName: idx.index,
        type: 'META_API',
        location: `Health: ${idx.health}, UUID: ${idx.uuid}`,
      }));
    } catch (error) {
      const message = getErrorMessage(error);
      console.error('ES meta API search error:', message);
      throw new Error(`Elasticsearch meta API search failed: ${message}`);
    }
  }

  /**
   * Mode 2: Uses ES Search API (_search) to find matches within document content.
   */
  private async searchDocuments(query: string): Promise<MetaResult[]> {
    try {
      const url = `${this.node}/_all/_search?size=5`;
      const body = {
        query: {
          multi_match: {
            query: query,
            fields: ['*name*', '*title*', '*description*', '*content*'],
          },
        },
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const message = `ES search query error: ${response.status} ${response.statusText}`;
        console.error(message);
        throw new Error(message);
      }

      const searchRes = (await response.json()) as any;
      const hits = searchRes.hits?.hits || [];

      return hits.map((hit: any) => ({
        source: 'elasticsearch',
        logicalName:
          hit._source.title || hit._source.name || 'Untitled Document',
        physicalName: hit._id,
        type: 'SEARCH_QUERY',
        description: `Score: ${hit._score}, Index: ${hit._index}`,
        location: hit._index,
      }));
    } catch (error) {
      const message = getErrorMessage(error);
      console.error('ES search query error:', message);
      throw new Error(`Elasticsearch query search failed: ${message}`);
    }
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.apiKey) {
      headers['Authorization'] = `ApiKey ${this.apiKey}`;
    }
    return headers;
  }

  async testConnection(): Promise<{ ok: boolean; error?: string }> {
    try {
      const response = await fetch(`${this.node}/`, {
        headers: this.getHeaders(),
      });
      if (!response.ok) {
        return {
          ok: false,
          error: `ES connection failed: ${response.status} ${response.statusText}`,
        };
      }
      return { ok: true };
    } catch (error) {
      const message = getErrorMessage(error);
      console.error('Elasticsearch connection test failed:', message);
      return { ok: false, error: message };
    }
  }
}
