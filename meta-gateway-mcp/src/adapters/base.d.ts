export interface MetaResult {
    source: string;
    logicalName: string;
    physicalName: string;
    type: string;
    description?: string;
    location?: string;
    score?: number;
}
export interface MetaAdapter {
    name: string;
    search(query: string): Promise<MetaResult[]>;
    testConnection(): Promise<boolean>;
}
//# sourceMappingURL=base.d.ts.map