import { MetaAdapter, MetaResult } from './base.js';
export declare class OracleAdapter implements MetaAdapter {
    readonly name = "oracle";
    private config;
    constructor(user: string, password: string, connectionString: string);
    search(query: string): Promise<MetaResult[]>;
    testConnection(): Promise<boolean>;
}
//# sourceMappingURL=oracle.d.ts.map