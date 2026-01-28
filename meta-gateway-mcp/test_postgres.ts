import { PostgresAdapter } from './src/adapters/postgres.js';
import dotenv from 'dotenv';

dotenv.config();

async function test() {
  console.log('Testing PostgreSQL Connection...');
  const conn =
    process.env['PG_CONNECTION_STRING'] ||
    'postgresql://postgres:password123@localhost:5432/meta_db';

  const adapter = new PostgresAdapter(conn);

  const isConnected = await adapter.testConnection();
  console.log('Connection Success:', isConnected);

  if (isConnected) {
    console.log("Searching for 'PG_TEST'...");
    const results = await adapter.search('PG_TEST');
    console.log('Search Results:', JSON.stringify(results, null, 2));
  }
}

test().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
