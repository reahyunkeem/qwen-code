/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import {
  createErrorResult,
  createTextResult,
  type OracleMetadataResult,
  type OracleTuneResult,
} from '@qwen-code/mcp-shared';

const server = new McpServer(
  {
    name: 'oracle-tuner',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

const tuneSchema = z.object({
  metadata: z.unknown(),
});

type TuneArgs = z.infer<typeof tuneSchema>;

function buildTuneResult(
  metadataResult: OracleMetadataResult,
): OracleTuneResult {
  const findings: OracleTuneResult['findings'] = [];
  const recommendations: OracleTuneResult['recommendations'] = [];
  const risks: string[] = [];

  if (!metadataResult.ok) {
    findings.push({
      id: 'oracle.metadata.incomplete',
      message:
        '메타데이터 수집이 완료되지 않았습니다. 실제 DB 연결 또는 권한을 확인하세요.',
      severity: 'warning',
    });
    risks.push('메타데이터가 불완전하여 권고 신뢰도가 낮습니다.');
  }

  const metadata = metadataResult.metadata;
  if (!metadata) {
    findings.push({
      id: 'oracle.metadata.missing',
      message: '분석에 필요한 메타데이터가 없습니다.',
      severity: 'critical',
    });
    return {
      ok: false,
      summary: '메타데이터가 없어 튜닝 권고를 생성할 수 없습니다.',
      findings,
      recommendations,
      risks,
      evidence: { metadataResult },
    };
  }

  if (!metadata.sqlId && !metadata.sqlText) {
    findings.push({
      id: 'oracle.input.missing',
      message: 'SQL ID 또는 SQL 텍스트가 제공되지 않았습니다.',
      severity: 'critical',
    });
    return {
      ok: false,
      summary: 'SQL 식별 정보가 없어 분석을 중단했습니다.',
      findings,
      recommendations,
      risks,
      evidence: { metadataResult },
    };
  }

  const stats = metadata.stats;
  if (stats?.executions && stats.executions > 0) {
    const executions = stats.executions;
    const elapsedTimeMs = stats.elapsedTimeMs ?? null;
    const avgElapsedMs =
      elapsedTimeMs !== null ? Math.round(elapsedTimeMs / executions) : null;

    if (avgElapsedMs !== null && avgElapsedMs > 1000) {
      findings.push({
        id: 'oracle.stats.avg_elapsed_high',
        message: '평균 실행 시간이 1초를 초과합니다.',
        severity: 'warning',
        evidence: `avgElapsedMs=${avgElapsedMs}`,
      });
      recommendations.push({
        id: 'oracle.reco.reduce_elapsed',
        title: '평균 실행 시간 개선',
        details:
          '실행 계획과 통계를 함께 확인하고, 주요 조인/필터 컬럼 인덱스를 우선 점검하세요.',
        risk: 'medium',
      });
    }

    if (stats.bufferGets && stats.bufferGets > 1_000_000) {
      findings.push({
        id: 'oracle.stats.buffer_gets_high',
        message: '버퍼 겟이 매우 큽니다. 논리적 I/O 부하가 높은 쿼리입니다.',
        severity: 'warning',
        evidence: `bufferGets=${stats.bufferGets}`,
      });
      recommendations.push({
        id: 'oracle.reco.index_or_rewrite',
        title: '인덱스 또는 쿼리 재작성 검토',
        details:
          '필터/조인 조건을 기준으로 선택도가 높은 인덱스를 검토하고, 불필요한 풀스캔을 줄이도록 쿼리를 재작성하세요.',
        risk: 'medium',
      });
      risks.push('인덱스 추가 시 DML 비용 증가 가능');
    }

    if (stats.diskReads && stats.diskReads > 100_000) {
      findings.push({
        id: 'oracle.stats.disk_reads_high',
        message: '디스크 읽기가 큽니다. 물리 I/O 병목 가능성이 있습니다.',
        severity: 'warning',
        evidence: `diskReads=${stats.diskReads}`,
      });
      recommendations.push({
        id: 'oracle.reco.reduce_io',
        title: '물리 I/O 감소 전략 적용',
        details:
          '커버링 인덱스, 필요한 컬럼만 조회, 파티션 프루닝 등을 통해 I/O를 줄이세요.',
        risk: 'medium',
      });
    }

    if (stats.rowsProcessed === 0 && executions > 0) {
      findings.push({
        id: 'oracle.stats.zero_rows',
        message: '실행은 많지만 결과 행이 없습니다.',
        severity: 'info',
        evidence: `executions=${executions}`,
      });
      recommendations.push({
        id: 'oracle.reco.filter_review',
        title: '필터 조건 재검토',
        details:
          '불필요한 실행 여부를 확인하고, 파라미터 값 및 조건식을 점검하세요.',
        risk: 'low',
      });
    }
  }

  if (metadata.sqlText && /select\s+\*/i.test(metadata.sqlText)) {
    findings.push({
      id: 'oracle.sql.select_star',
      message: 'SELECT * 사용이 감지되었습니다.',
      severity: 'info',
    });
    recommendations.push({
      id: 'oracle.reco.select_columns',
      title: '필요 컬럼만 조회',
      details: '필요한 컬럼만 선택해 네트워크 전송과 I/O 비용을 줄이세요.',
      risk: 'low',
    });
  }

  if (!metadata.plan?.planText && !metadata.plan?.planJson) {
    findings.push({
      id: 'oracle.plan.missing',
      message: '실행 계획이 수집되지 않았습니다.',
      severity: 'info',
    });
    recommendations.push({
      id: 'oracle.reco.collect_plan',
      title: '실행 계획 수집',
      details:
        'DBA 권한 또는 SQL Monitor/AWR 접근 권한을 확인하고 실행 계획을 수집하세요.',
      risk: 'low',
    });
  }

  const planRows = Array.isArray(metadata.plan?.planJson?.['rows'])
    ? (metadata.plan?.planJson?.['rows'] as Array<Record<string, unknown>>)
    : [];

  if (planRows.length > 0) {
    const fullScanRows = planRows.filter((row) => {
      const operation = String(row['OPERATION'] ?? '').toUpperCase();
      const options = String(row['OPTIONS'] ?? '').toUpperCase();
      return operation.includes('TABLE ACCESS') && options.includes('FULL');
    });
    if (fullScanRows.length > 0) {
      findings.push({
        id: 'oracle.plan.full_table_scan',
        message: '실행 계획에 FULL TABLE SCAN이 포함되어 있습니다.',
        severity: 'warning',
        evidence: `fullScanNodes=${fullScanRows.length}`,
      });
      recommendations.push({
        id: 'oracle.reco.index_for_full_scan',
        title: '풀스캔 완화 인덱스 검토',
        details:
          '필터/조인 컬럼 중심으로 인덱스를 검토하거나, 필요한 컬럼만 조회하도록 쿼리를 재작성하세요.',
        risk: 'medium',
      });
    }

    const cartesianRows = planRows.filter((row) => {
      const operation = String(row['OPERATION'] ?? '').toUpperCase();
      const options = String(row['OPTIONS'] ?? '').toUpperCase();
      return operation.includes('MERGE JOIN') && options.includes('CARTESIAN');
    });
    if (cartesianRows.length > 0) {
      findings.push({
        id: 'oracle.plan.cartesian',
        message: '카테시안 조인이 감지되었습니다.',
        severity: 'critical',
        evidence: `cartesianNodes=${cartesianRows.length}`,
      });
      recommendations.push({
        id: 'oracle.reco.fix_join',
        title: '조인 조건 확인',
        details:
          '조인 조건 누락 여부를 확인하고, 의도치 않은 카테시안 조인을 제거하세요.',
        risk: 'high',
      });
    }
  }

  if (recommendations.length === 0) {
    recommendations.push({
      id: 'oracle.reco.review',
      title: '추가 관찰 필요',
      details:
        '현재 정보만으로 명확한 튜닝 포인트를 판단하기 어렵습니다. 실제 실행 통계와 플랜을 확보하세요.',
      risk: 'low',
    });
  }

  const summaryParts = [
    'Oracle SQL 튜닝 권고를 생성했습니다.',
    metadataResult.ok
      ? '메타데이터 수집은 정상으로 표시됩니다.'
      : '메타데이터 수집이 부분적으로 실패했습니다.',
  ];

  return {
    ok: metadataResult.ok,
    summary: summaryParts.join(' '),
    findings,
    recommendations,
    risks,
    evidence: {
      sqlId: metadata.sqlId,
      sqlText: metadata.sqlText,
      plan: metadata.plan,
      stats: metadata.stats,
      warnings: metadata.warnings,
    },
  };
}

server.registerTool(
  'oracle.tune_from_metadata',
  {
    description: 'Generate tuning recommendations from Oracle SQL metadata.',
    inputSchema: tuneSchema.shape,
  },
  async ({ metadata }: TuneArgs) => {
    if (!metadata) {
      return createErrorResult('metadata is required', 'INVALID_INPUT');
    }

    const metadataResult = metadata as OracleMetadataResult;
    const result = buildTuneResult(metadataResult);
    return createTextResult(result);
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
