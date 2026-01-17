import { MetaAdapter, MetaResult } from './base.js';
export declare class ElasticsearchAdapter implements MetaAdapter {
    readonly name = "elasticsearch";
    private node;
    private apiKey?;
    constructor(node: string, apiKey?: string);
    search(query: string): Promise<MetaResult[]>;
    testConnection(): Promise<boolean>;
}
//# sourceMappingURL=elasticsearch.d.ts.map