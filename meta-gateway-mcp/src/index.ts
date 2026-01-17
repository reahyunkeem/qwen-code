import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import dotenv from 'dotenv';

import { OracleAdapter } from './adapters/oracle.js';
import { PostgresAdapter } from './adapters/postgres.js';
import { ElasticsearchAdapter } from './adapters/elasticsearch.js';
import { StaticVectorAdapter } from './adapters/vector.js';
import type { MetaAdapter } from './adapters/base.js';

dotenv.config();

// MCP Server Initialization
const server = new Server(
  {
    name: 'meta-gateway',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

// Initialize Adapters from Env
const adapters: MetaAdapter[] = [];

if (process.env.ORACLE_USER) {
  adapters.push(
    new OracleAdapter(
      process.env.ORACLE_USER,
      process.env.ORACLE_PASSWORD || '',
      process.env.ORACLE_CONNECTION_STRING || '',
    ),
  );
}

if (process.env.PG_CONNECTION_STRING) {
  adapters.push(new PostgresAdapter(process.env.PG_CONNECTION_STRING));
}

if (process.env.ES_NODE) {
  adapters.push(
    new ElasticsearchAdapter(
      process.env.ES_NODE,
      process.env.ES_API_KEY,
      process.env.ES_DEFAULT_TEMPLATE_ID,
    ),
  );
}

if (process.env.VECTOR_DB_PATH) {
  adapters.push(new StaticVectorAdapter(process.env.VECTOR_DB_PATH));
}

/**
 * List available tools.
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'search_meta',
        description:
          'Search corporate metadata across Oracle, PostgreSQL, Elasticsearch, and Static Vector DB.',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description:
                "The business term or technical name to search for (e.g., '고객 등급', 'TB_USER')",
            },
            source: {
              type: 'string',
              enum: ['all', 'oracle', 'postgres', 'elasticsearch', 'vector'],
              description:
                'Specific source to search from (optional, defaults to all)',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'search_es_template',
        description: 'Search Elasticsearch using a specific search template.',
        inputSchema: {
          type: 'object',
          properties: {
            templateId: {
              type: 'string',
              description: 'The ID of the registered ES search template',
            },
            params: {
              type: 'object',
              description: 'Parameters for the template',
            },
          },
          required: ['templateId', 'params'],
        },
      },
      {
        name: 'check_connections',
        description: 'Verify connection status to all 4 meta pillars.',
        inputSchema: { type: 'object', properties: {} },
      },
    ],
  };
});

/**
 * Handle tool execution.
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === 'check_connections') {
    const status = await Promise.all(
      adapters.map(async (a) => ({
        name: a.name,
        connected: await a.testConnection(),
      })),
    );
    return {
      content: [{ type: 'text', text: JSON.stringify(status, null, 2) }],
    };
  }

  if (name === 'search_es_template') {
    const esAdapter = adapters.find(
      (a) => a.name === 'elasticsearch',
    ) as ElasticsearchAdapter;
    if (!esAdapter) {
      throw new Error('Elasticsearch adapter not configured');
    }
    const results = await esAdapter.searchByTemplate(
      args?.templateId as string,
      args?.params as Record<string, any>,
    );
    return {
      content: [{ type: 'text', text: JSON.stringify(results, null, 2) }],
    };
  }

  if (name === 'search_meta') {
    const query = args?.query as string;
    const sourceFilter = (args?.source as string) || 'all';

    const activeAdapters =
      sourceFilter === 'all'
        ? adapters
        : adapters.filter((a) => a.name === sourceFilter);

    if (activeAdapters.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: `No active connectors found for source: ${sourceFilter}`,
          },
        ],
      };
    }

    const results = await Promise.all(
      activeAdapters.map((a) => a.search(query)),
    );
    const flatResults = results.flat();

    if (flatResults.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: `No results found for "${query}" across the selected pillars.`,
          },
        ],
      };
    }

    // Format output
    let output = `Found ${flatResults.length} metadata matches for "${query}":\n\n`;
    flatResults.forEach((res) => {
      output += `[${res.source.toUpperCase()}] ${res.type}: ${res.logicalName} (${res.physicalName})\n`;
      if (res.description) output += `   Description: ${res.description}\n`;
      if (res.location) output += `   Location: ${res.location}\n`;
      output += `---\n`;
    });

    return {
      content: [{ type: 'text', text: output.trim() }],
    };
  }

  throw new Error(`Unknown tool: ${name}`);
});

/**
 * Main entry point.
 */
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Meta-Gateway MCP Server (4 Pillars) running on stdio');
}

main().catch((error) => {
  console.error('Fatal error in main():', error);
  process.exit(1);
});
