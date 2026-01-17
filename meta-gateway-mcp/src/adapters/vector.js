import { MetaAdapter, MetaResult } from './base.js';
import fs from 'node:fs/promises';
export class StaticVectorAdapter {
    name = 'vector';
    dbPath;
    constructor(dbPath) {
        this.dbPath = dbPath;
    }
    async search(query) {
        try {
            const data = await fs.readFile(this.dbPath, 'utf8');
            const items = JSON.parse(data);
            // Phase 1: Simple keyword matching on logical name, physical name, and description
            const lowerQuery = query.toLowerCase();
            return items
                .filter((item) => item.logicalName.toLowerCase().includes(lowerQuery) ||
                item.physicalName.toLowerCase().includes(lowerQuery) ||
                (item.description &&
                    item.description.toLowerCase().includes(lowerQuery)))
                .map((item) => ({ ...item, source: 'vector', score: 1.0 }));
        }
        catch (error) {
            console.error('Vector search error (check if file exists):', error);
            return [];
        }
    }
    async testConnection() {
        try {
            await fs.access(this.dbPath);
            return true;
        }
        catch {
            return false;
        }
    }
}
//# sourceMappingURL=vector.js.map