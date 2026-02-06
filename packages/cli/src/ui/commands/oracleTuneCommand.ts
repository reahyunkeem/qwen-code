/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */

import { parse } from 'shell-quote';
import { t } from '../../i18n/index.js';
import {
  CommandKind,
  type SlashCommand,
  type SlashCommandActionReturn,
} from './types.js';

type ParsedArgs = {
  sqlId?: string;
  sqlText?: string;
};

function parseOracleTuneArgs(rawArgs: string): ParsedArgs | null {
  const tokens = parse(rawArgs)
    .filter((token): token is string => typeof token === 'string')
    .map((token) => token.trim())
    .filter(Boolean);

  let sqlId: string | undefined;
  let sqlText: string | undefined;
  const remaining: string[] = [];

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (!token) {
      continue;
    }
    if (token === '--sql-id' || token === '-i') {
      const next = tokens[i + 1];
      if (next) {
        sqlId = next;
        i += 1;
      }
      continue;
    }
    if (token === '--sql-text' || token === '--sql') {
      const next = tokens[i + 1];
      if (next) {
        sqlText = next;
        i += 1;
      }
      continue;
    }
    remaining.push(token);
  }

  if (!sqlId && !sqlText && remaining.length > 0) {
    sqlText = remaining.join(' ');
  }

  if (!sqlId && !sqlText) {
    return null;
  }

  if (sqlId && sqlText) {
    return null;
  }

  return { sqlId, sqlText };
}

function buildOracleTunePrompt(parsed: ParsedArgs): string {
  const target = parsed.sqlId
    ? `SQL ID: ${parsed.sqlId}`
    : `SQL TEXT: ${parsed.sqlText}`;

  const instructionLines = [
    '당신은 오라클 SQL 튜닝 에이전트입니다.',
    '반드시 MCP 툴을 사용하여 메타데이터를 수집하고 권고를 생성하세요.',
    '권고만 제공하며 실제 변경/적용은 절대 수행하지 않습니다.',
    '출력은 한국어로 Summary/Findings/Recommendations/Risks/Evidence 섹션을 포함하세요.',
    '',
    `대상: ${target}`,
    '',
    '1) meta-gateway MCP 툴을 호출해 SQL/플랜/통계를 수집하세요.',
    '   - oracle.fetch_sql_by_id',
    '   - oracle.get_plan',
    '   - oracle.get_sql_stats',
    '2) 수집한 결과를 oracle-tuner MCP 툴로 전달하세요.',
    '   - oracle.tune_from_metadata',
    '3) 결과를 요약해 리포트로 출력하세요.',
  ];

  return instructionLines.join('\n');
}

export const oracleTuneCommand: SlashCommand = {
  name: 'oracle',
  description: t('Oracle SQL tuning commands.'),
  kind: CommandKind.BUILT_IN,
  subCommands: [
    {
      name: 'tune',
      description: t('Analyze an Oracle SQL query and suggest tunings.'),
      kind: CommandKind.BUILT_IN,
      action: async (
        _context,
        args: string,
      ): Promise<SlashCommandActionReturn> => {
        const parsed = parseOracleTuneArgs(args);
        if (!parsed) {
          return {
            type: 'message',
            messageType: 'error',
            content: t(
              'Provide either --sql-id <id> or --sql-text "<query>" (or pass the SQL text directly).',
            ),
          };
        }

        const prompt = buildOracleTunePrompt(parsed);
        return {
          type: 'submit_prompt',
          content: [{ text: prompt }],
        };
      },
    },
  ],
};
