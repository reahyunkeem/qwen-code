import { MetaAdapter, MetaResult } from './base.js';
import fs from 'node:fs/promises';

export class StaticVectorAdapter implements MetaAdapter {
  readonly name = 'vector';
  private dbPath: string;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
  }

  async search(query: string): Promise<MetaResult[]> {
    try {
      const data = await fs.readFile(this.dbPath, 'utf8');
      const items = JSON.parse(data) as MetaResult[];

      // Phase 1: Simple keyword matching on logical name, physical name, and description
      const lowerQuery = query.toLowerCase();
      return items
        .filter(
          (item) =>
            item.logicalName.toLowerCase().includes(lowerQuery) ||
            item.physicalName.toLowerCase().includes(lowerQuery) ||
            (item.description &&
              item.description.toLowerCase().includes(lowerQuery)),
        )
        .map((item) => ({ ...item, source: 'vector', score: 1.0 }));
    } catch (error) {
      console.error('Vector search error (check if file exists):', error);
      return [];
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      await fs.access(this.dbPath);
      return true;
    } catch {
      return false;
    }
  }
}
