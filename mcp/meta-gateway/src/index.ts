/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import oracledb from 'oracledb';
import { z } from 'zod';
import {
  createErrorResult,
  createTextResult,
  type OracleMetadataResult,
  type OracleSqlMetadata,
} from '@qwen-code/mcp-shared';

const server = new McpServer(
  {
    name: 'oracle-meta-gateway',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

const sqlIdSchema = z.object({
  sqlId: z.string().min(1, 'sqlId is required'),
});

const planSchema = z.object({
  sqlId: z.string().optional(),
  sqlText: z.string().optional(),
});

type SqlIdArgs = z.infer<typeof sqlIdSchema>;
type PlanArgs = z.infer<typeof planSchema>;

type OracleConfigStatus = {
  configured: boolean;
  missing: string[];
  user?: string;
  password?: string;
  dsn?: string;
  libDir?: string;
  privilege?: number;
};

function getOracleConfigStatus(): OracleConfigStatus {
  const required = ['ORACLE_USER', 'ORACLE_PASSWORD', 'ORACLE_DSN'];
  const missing = required.filter((key) => !process.env[key]);
  const privilegeName = process.env['ORACLE_PRIVILEGE']?.toUpperCase();
  const privilege =
    privilegeName === 'SYSDBA'
      ? oracledb.SYSDBA
      : privilegeName === 'SYSOPER'
        ? oracledb.SYSOPER
        : undefined;
  return {
    configured: missing.length === 0,
    missing,
    user: process.env['ORACLE_USER'],
    password: process.env['ORACLE_PASSWORD'],
    dsn: process.env['ORACLE_DSN'],
    libDir: process.env['ORACLE_LIB_DIR'],
    privilege,
  };
}

let clientInitialized = false;

function ensureOracleClient(): void {
  if (clientInitialized) {
    return;
  }

  const libDir = process.env['ORACLE_LIB_DIR'];
  if (libDir) {
    try {
      oracledb.initOracleClient({ libDir });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Failed to init Oracle client.';
      throw new Error(`Oracle client init failed: ${message}`);
    }
  }

  oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
  oracledb.fetchAsString = [oracledb.CLOB];
  clientInitialized = true;
}

async function withOracleConnection<T>(
  config: OracleConfigStatus,
  fn: (connection: oracledb.Connection) => Promise<T>,
): Promise<T> {
  if (config.privilege && !config.libDir) {
    throw new Error(
      'ORACLE_PRIVILEGE requires Oracle Instant Client. Set ORACLE_LIB_DIR to enable thick mode.',
    );
  }
  ensureOracleClient();
  const connection = await oracledb.getConnection({
    user: config.user,
    password: config.password,
    connectString: config.dsn,
    privilege: config.privilege,
  });
  try {
    return await fn(connection);
  } finally {
    await connection.close();
  }
}

function buildPlaceholderMetadata(
  input: Partial<OracleSqlMetadata>,
): OracleMetadataResult {
  const configStatus = getOracleConfigStatus();
  const warnings = [
    'Oracle connection is not configured. Returning placeholder metadata.',
  ];
  if (!configStatus.configured) {
    warnings.push(`Missing env: ${configStatus.missing.join(', ')}`);
  }
  const metadata: OracleSqlMetadata = {
    sqlId: input.sqlId ?? null,
    sqlText: input.sqlText ?? null,
    conId: input.conId ?? null,
    plan: input.plan ?? null,
    stats: input.stats ?? null,
    warnings,
    collectedAt: new Date().toISOString(),
    source: 'placeholder',
  };

  return {
    ok: false,
    metadata,
    error: {
      message: configStatus.configured
        ? 'Oracle connection is configured but not yet implemented in meta-gateway.'
        : 'Oracle connection is not configured. Set ORACLE_USER, ORACLE_PASSWORD, ORACLE_DSN.',
      code: 'NOT_CONFIGURED',
    },
  };
}

function formatOracleError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('ORA-28009')) {
    return 'SYS user requires SYSDBA/SYSOPER privilege. Set ORACLE_PRIVILEGE and enable thick mode.';
  }
  if (message.includes('ORA-00942')) {
    return 'V$ view access failed. Ensure privileges (select_catalog_role or explicit v_$* grants).';
  }
  if (message.includes('DPI-1047')) {
    return 'Oracle Instant Client not found. Set ORACLE_LIB_DIR for thick mode.';
  }
  return message;
}

server.registerTool(
  'oracle.fetch_sql_by_id',
  {
    description: 'Fetch SQL text and metadata by SQL ID (Oracle 12c).',
    inputSchema: sqlIdSchema.shape,
  },
  async ({ sqlId }: SqlIdArgs) => {
    const config = getOracleConfigStatus();
    if (!config.configured) {
      const result = buildPlaceholderMetadata({ sqlId });
      return createTextResult(result);
    }

    try {
      const result = await withOracleConnection(config, async (connection) => {
        const sqlResult = await connection.execute<{
          SQL_ID: string;
          SQL_FULLTEXT: string | null;
          PLAN_HASH_VALUE: number | null;
          CON_ID: number | null;
        }>(
          `select sql_id as "SQL_ID",
                  sql_fulltext as "SQL_FULLTEXT",
                  plan_hash_value as "PLAN_HASH_VALUE",
                  con_id as "CON_ID"
             from v$sql
            where sql_id = :sqlId
            fetch first 1 rows only`,
          { sqlId },
        );

        const row = sqlResult.rows?.[0];
        if (!row) {
          return buildPlaceholderMetadata({ sqlId });
        }

        const metadata: OracleSqlMetadata = {
          sqlId: row.SQL_ID,
          sqlText: row.SQL_FULLTEXT ?? null,
          conId: row.CON_ID ?? null,
          plan: {
            planHashValue: row.PLAN_HASH_VALUE ?? null,
          },
          stats: null,
          warnings: [],
          collectedAt: new Date().toISOString(),
          source: 'oracle',
        };

        return {
          ok: true,
          metadata,
        } satisfies OracleMetadataResult;
      });

      return createTextResult(result);
    } catch (error) {
      return createErrorResult(formatOracleError(error), 'ORACLE_ERROR');
    }
  },
);

server.registerTool(
  'oracle.get_plan',
  {
    description: 'Fetch execution plan metadata by SQL ID or SQL text.',
    inputSchema: planSchema.shape,
  },
  async ({ sqlId, sqlText }: PlanArgs) => {
    if (!sqlId && !sqlText) {
      return createErrorResult('sqlId or sqlText is required', 'INVALID_INPUT');
    }

    const config = getOracleConfigStatus();
    if (!config.configured) {
      const result = buildPlaceholderMetadata({ sqlId, sqlText, plan: null });
      return createTextResult(result);
    }

    try {
      const result = await withOracleConnection(config, async (connection) => {
        let resolvedSqlId = sqlId ?? null;
        let resolvedSqlText = sqlText ?? null;
        let resolvedConId: number | null = null;

        if (!resolvedSqlId && sqlText) {
          const sqlMatch = await connection.execute<{
            SQL_ID: string;
            SQL_FULLTEXT: string | null;
            CON_ID: number | null;
          }>(
            `select sql_id as "SQL_ID",
                    sql_fulltext as "SQL_FULLTEXT",
                    con_id as "CON_ID"
               from v$sql
              where sql_text = :sqlText
              fetch first 1 rows only`,
            { sqlText },
          );
          const row = sqlMatch.rows?.[0];
          if (row) {
            resolvedSqlId = row.SQL_ID;
            resolvedSqlText = row.SQL_FULLTEXT ?? sqlText;
            resolvedConId = row.CON_ID ?? null;
          }
        }

        if (!resolvedSqlId) {
          return buildPlaceholderMetadata({ sqlId, sqlText, plan: null });
        }

        let planText: string | null = null;
        try {
          const planOutput = await connection.execute<{
            PLAN_TABLE_OUTPUT: string;
          }>(
            `select plan_table_output as "PLAN_TABLE_OUTPUT"
               from table(dbms_xplan.display_cursor(:sqlId, null, 'ALLSTATS LAST'))`,
            { sqlId: resolvedSqlId },
          );
          if (planOutput.rows && planOutput.rows.length > 0) {
            planText = planOutput.rows
              .map(
                (row: { PLAN_TABLE_OUTPUT: string }) => row.PLAN_TABLE_OUTPUT,
              )
              .join('\n');
          }
        } catch {
          planText = null;
        }

        const planRows = await connection.execute<Record<string, unknown>>(
          `select id as "ID",
                  parent_id as "PARENT_ID",
                  operation as "OPERATION",
                  options as "OPTIONS",
                  object_owner as "OBJECT_OWNER",
                  object_name as "OBJECT_NAME",
                  cardinality as "CARDINALITY",
                  cost as "COST"
             from v$sql_plan
            where sql_id = :sqlId
            order by id`,
          { sqlId: resolvedSqlId },
        );

        const metadata: OracleSqlMetadata = {
          sqlId: resolvedSqlId,
          sqlText: resolvedSqlText,
          conId: resolvedConId,
          plan: {
            planText,
            planJson: {
              rows: planRows.rows ?? [],
            },
          },
          stats: null,
          warnings: [],
          collectedAt: new Date().toISOString(),
          source: 'oracle',
        };

        return {
          ok: true,
          metadata,
        } satisfies OracleMetadataResult;
      });

      return createTextResult(result);
    } catch (error) {
      return createErrorResult(formatOracleError(error), 'ORACLE_ERROR');
    }
  },
);

server.registerTool(
  'oracle.get_sql_stats',
  {
    description: 'Fetch execution statistics by SQL ID.',
    inputSchema: sqlIdSchema.shape,
  },
  async ({ sqlId }: SqlIdArgs) => {
    const config = getOracleConfigStatus();
    if (!config.configured) {
      const result = buildPlaceholderMetadata({ sqlId, stats: null });
      return createTextResult(result);
    }

    try {
      const result = await withOracleConnection(config, async (connection) => {
        const statsResult = await connection.execute<{
          ELAPSED_TIME: number | null;
          CPU_TIME: number | null;
          BUFFER_GETS: number | null;
          DISK_READS: number | null;
          ROWS_PROCESSED: number | null;
          EXECUTIONS: number | null;
          FETCHES: number | null;
          SQL_ID: string;
          SQL_FULLTEXT: string | null;
          CON_ID: number | null;
        }>(
          `select sql_id as "SQL_ID",
                  sql_fulltext as "SQL_FULLTEXT",
                  elapsed_time as "ELAPSED_TIME",
                  cpu_time as "CPU_TIME",
                  buffer_gets as "BUFFER_GETS",
                  disk_reads as "DISK_READS",
                  rows_processed as "ROWS_PROCESSED",
                  executions as "EXECUTIONS",
                  fetches as "FETCHES",
                  con_id as "CON_ID"
             from v$sql
            where sql_id = :sqlId
            fetch first 1 rows only`,
          { sqlId },
        );

        const row = statsResult.rows?.[0];
        if (!row) {
          return buildPlaceholderMetadata({ sqlId, stats: null });
        }

        const metadata: OracleSqlMetadata = {
          sqlId: row.SQL_ID,
          sqlText: row.SQL_FULLTEXT ?? null,
          conId: row.CON_ID ?? null,
          plan: null,
          stats: {
            elapsedTimeMs: row.ELAPSED_TIME
              ? Math.round(row.ELAPSED_TIME / 1000)
              : null,
            cpuTimeMs: row.CPU_TIME ? Math.round(row.CPU_TIME / 1000) : null,
            bufferGets: row.BUFFER_GETS ?? null,
            diskReads: row.DISK_READS ?? null,
            rowsProcessed: row.ROWS_PROCESSED ?? null,
            executions: row.EXECUTIONS ?? null,
            fetches: row.FETCHES ?? null,
          },
          warnings: [],
          collectedAt: new Date().toISOString(),
          source: 'oracle',
        };

        return {
          ok: true,
          metadata,
        } satisfies OracleMetadataResult;
      });

      return createTextResult(result);
    } catch (error) {
      return createErrorResult(formatOracleError(error), 'ORACLE_ERROR');
    }
  },
);

try {
  const transport = new StdioServerTransport();
  await server.connect(transport);
} catch (error) {
  const message =
    error instanceof Error ? error.message : 'Failed to start MCP server.';
  const result = createErrorResult(message, 'STARTUP_FAILURE');
  process.stderr.write(JSON.stringify(result, null, 2));
  process.exitCode = 1;
}
