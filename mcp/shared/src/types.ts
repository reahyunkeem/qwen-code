/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export type OracleSqlPlan = {
  planHashValue?: number | null;
  planText?: string | null;
  planJson?: Record<string, unknown> | null;
};

export type OracleSqlStats = {
  elapsedTimeMs?: number | null;
  cpuTimeMs?: number | null;
  bufferGets?: number | null;
  diskReads?: number | null;
  rowsProcessed?: number | null;
  executions?: number | null;
  fetches?: number | null;
};

export type OracleSqlMetadata = {
  sqlId?: string | null;
  sqlText?: string | null;
  conId?: number | null;
  plan?: OracleSqlPlan | null;
  stats?: OracleSqlStats | null;
  warnings?: string[];
  collectedAt: string;
  source: 'oracle' | 'placeholder';
};

export type OracleMetadataResult = {
  ok: boolean;
  metadata?: OracleSqlMetadata;
  error?: {
    message: string;
    code?: string;
  };
};

export type OracleTuneRecommendation = {
  id: string;
  title: string;
  details: string;
  risk: 'low' | 'medium' | 'high';
};

export type OracleTuneResult = {
  ok: boolean;
  summary: string;
  findings: Array<{
    id: string;
    message: string;
    severity: 'info' | 'warning' | 'critical';
    evidence?: string;
  }>;
  recommendations: OracleTuneRecommendation[];
  risks: string[];
  evidence?: Record<string, unknown>;
};
