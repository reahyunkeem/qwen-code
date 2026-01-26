import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import process from 'node:process';
import console from 'node:console';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import dotenv from 'dotenv';

import { OracleAdapter } from './adapters/oracle.js';
import { PostgresAdapter } from './adapters/postgres.js';
import { ElasticsearchAdapter } from './adapters/elasticsearch.js';
import { StaticVectorAdapter } from './adapters/vector.js';
import {
  getErrorMessage,
  type MetaAdapter,
  type MetaResult,
} from './adapters/base.js';

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
          'Search corporate metadata across Oracle, PostgreSQL, Elasticsearch, and Static Vector DB. Returns structured JSON with per-source status.',
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
        ...(await a.testConnection()),
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
      args?.params as Record<string, unknown>,
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
            text: JSON.stringify(
              {
                query,
                source: sourceFilter,
                total: 0,
                results: [],
                sources: [
                  {
                    name: sourceFilter,
                    ok: false,
                    error: 'No active connectors configured for this source.',
                  },
                ],
              },
              null,
              2,
            ),
          },
        ],
      };
    }

    const settledResults = await Promise.allSettled(
      activeAdapters.map(async (adapter) => ({
        name: adapter.name,
        results: await adapter.search(query),
      })),
    );

    const sources = settledResults.map((result, index) => {
      const adapterName = activeAdapters[index]?.name || 'unknown';
      if (result.status === 'fulfilled') {
        return {
          name: result.value.name,
          ok: true,
          count: result.value.results.length,
        };
      }
      return {
        name: adapterName,
        ok: false,
        error: getErrorMessage(result.reason),
      };
    });

    const flatResults: MetaResult[] = [];
    settledResults.forEach((result) => {
      if (result.status === 'fulfilled') {
        flatResults.push(...result.value.results);
      }
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              query,
              source: sourceFilter,
              total: flatResults.length,
              results: flatResults,
              sources,
            },
            null,
            2,
          ),
        },
      ],
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
