import pg from 'pg';
import console from 'node:console';
import { getErrorMessage } from './base.js';
import type { MetaAdapter, MetaResult } from './base.js';

export class PostgresAdapter implements MetaAdapter {
  readonly name = 'postgres';
  private pool: pg.Pool;

  constructor(connectionString: string) {
    this.pool = new pg.Pool({
      connectionString,
    });
  }

  async search(query: string): Promise<MetaResult[]> {
    const client = await this.pool.connect();
    try {
      // Simplified query looking for table/column names in information_schema
      // In real company DB, this would query a dedicated Meta table
      const sql = `
        SELECT 
          'postgres' as source,
          table_name as logical_name,
          table_name as physical_name,
          'TABLE' as type,
          table_schema as location
        FROM information_schema.tables 
        WHERE table_name ILIKE $1
        LIMIT 10
      `;
      const res = await client.query(sql, [`%${query}%`]);

      return res.rows.map((row) => ({
        source: row.source,
        logicalName: row.logical_name,
        physicalName: row.physical_name,
        type: row.type,
        location: row.location,
      }));
    } catch (error) {
      const message = getErrorMessage(error);
      console.error('Postgres search error:', message);
      throw new Error(`Postgres search failed: ${message}`);
    } finally {
      client.release();
    }
  }

  async testConnection(): Promise<{ ok: boolean; error?: string }> {
    try {
      const client = await this.pool.connect();
      await client.query('SELECT 1');
      client.release();
      return { ok: true };
    } catch (error) {
      const message = getErrorMessage(error);
      console.error('Postgres connection test failed:', message);
      return { ok: false, error: message };
    }
  }
}
