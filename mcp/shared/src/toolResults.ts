/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

type McpTextContent = {
  type: 'text';
  text: string;
};

export type McpToolResult = {
  content: McpTextContent[];
};

export function createTextResult(payload: unknown): McpToolResult {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(payload, null, 2),
      },
    ],
  };
}

export function createErrorResult(
  message: string,
  code: string = 'NOT_CONFIGURED',
): McpToolResult {
  return createTextResult({
    ok: false,
    error: {
      message,
      code,
    },
  });
}
