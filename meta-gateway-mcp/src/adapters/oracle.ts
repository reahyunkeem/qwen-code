import oracledb from 'oracledb';
import console from 'node:console';
import { getErrorMessage } from './base.js';
import type { MetaAdapter, MetaResult } from './base.js';

export class OracleAdapter implements MetaAdapter {
  readonly name = 'oracle';
  private config: oracledb.ConnectionAttributes;

  constructor(user: string, password: string, connectionString: string) {
    this.config = {
      user,
      password,
      connectString: connectionString,
    };
  }

  async search(query: string): Promise<MetaResult[]> {
    let connection;
    try {
      connection = await oracledb.getConnection(this.config);

      // Simplified query looking for table/column names in USER_TAB_COLUMNS or a Meta Table
      // This example queries USER_TABLES for matching names
      const sql = `
        SELECT 
          'oracle' as source,
          TABLE_NAME as logical_name,
          TABLE_NAME as physical_name,
          'TABLE' as type,
          NULL as description
        FROM USER_TABLES 
        WHERE TABLE_NAME LIKE :1
      `;
      const result = await connection.execute(sql, [
        `%${query.toUpperCase()}%`,
      ]);

      if (!result.rows) return [];

      return (result.rows as any[]).map((row) => ({
        source: row[0],
        logicalName: row[1],
        physicalName: row[2],
        type: row[3],
        description: row[4],
      }));
    } catch (error) {
      const message = getErrorMessage(error);
      console.error('Oracle search error:', message);
      throw new Error(`Oracle search failed: ${message}`);
    } finally {
      if (connection) {
        try {
          await connection.close();
        } catch (err) {
          console.error('Oracle close error:', getErrorMessage(err));
        }
      }
    }
  }

  async testConnection(): Promise<{ ok: boolean; error?: string }> {
    let connection;
    try {
      connection = await oracledb.getConnection(this.config);
      return { ok: true };
    } catch (error) {
      const message = getErrorMessage(error);
      console.error('Oracle connection test failed:', message);
      return { ok: false, error: message };
    } finally {
      if (connection) await connection.close();
    }
  }
}
