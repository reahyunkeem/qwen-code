import { MetaAdapter, MetaResult } from './base.js';
export class ElasticsearchAdapter {
    name = 'elasticsearch';
    node;
    apiKey;
    constructor(node, apiKey) {
        this.node = node;
        this.apiKey = apiKey;
    }
    async search(query) {
        try {
            // In Phase 1, we use fetch to query ES _cat/indices or mapping API
            const url = `${this.node}/_cat/indices?format=json&index=*${query}*`;
            const headers = {
                'Content-Type': 'application/json',
            };
            if (this.apiKey) {
                headers['Authorization'] = `ApiKey ${this.apiKey}`;
            }
            const response = await fetch(url, { headers });
            if (!response.ok)
                throw new Error(`ES error: ${response.statusText}`);
            const indices = (await response.json());
            return indices.map((idx) => ({
                source: 'elasticsearch',
                logicalName: idx.index,
                physicalName: idx.index,
                type: 'INDEX',
                location: idx.uuid,
            }));
        }
        catch (error) {
            console.error('Elasticsearch search error:', error);
            return [];
        }
    }
    async testConnection() {
        try {
            const response = await fetch(`${this.node}/`, {
                headers: this.apiKey ? { Authorization: `ApiKey ${this.apiKey}` } : {},
            });
            return response.ok;
        }
        catch (error) {
            console.error('Elasticsearch connection test failed:', error);
            return false;
        }
    }
}
//# sourceMappingURL=elasticsearch.js.map