import { MetaAdapter, MetaResult } from './base.js';
export declare class StaticVectorAdapter implements MetaAdapter {
    readonly name = "vector";
    private dbPath;
    constructor(dbPath: string);
    search(query: string): Promise<MetaResult[]>;
    testConnection(): Promise<boolean>;
}
//# sourceMappingURL=vector.d.ts.map