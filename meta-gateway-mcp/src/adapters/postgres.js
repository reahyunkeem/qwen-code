import pg from 'pg';
import { MetaAdapter, MetaResult } from './base.js';
export class PostgresAdapter {
    name = 'postgres';
    pool;
    constructor(connectionString) {
        this.pool = new pg.Pool({
            connectionString,
        });
    }
    async search(query) {
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
        }
        catch (error) {
            console.error('Postgres search error:', error);
            return [];
        }
        finally {
            client.release();
        }
    }
    async testConnection() {
        try {
            const client = await this.pool.connect();
            await client.query('SELECT 1');
            client.release();
            return true;
        }
        catch (error) {
            console.error('Postgres connection test failed:', error);
            return false;
        }
    }
}
//# sourceMappingURL=postgres.js.map