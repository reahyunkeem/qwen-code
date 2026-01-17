import { MetaAdapter, MetaResult } from './base.js';
export declare class PostgresAdapter implements MetaAdapter {
    readonly name = "postgres";
    private pool;
    constructor(connectionString: string);
    search(query: string): Promise<MetaResult[]>;
    testConnection(): Promise<boolean>;
}
//# sourceMappingURL=postgres.d.ts.map