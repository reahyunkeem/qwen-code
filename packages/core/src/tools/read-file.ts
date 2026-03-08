/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'node:path';
import { makeRelative, shortenPath } from '../utils/paths.js';
import type { ToolInvocation, ToolLocation, ToolResult } from './tools.js';
import { BaseDeclarativeTool, BaseToolInvocation, Kind } from './tools.js';
import { ToolNames, ToolDisplayNames } from './tool-names.js';

import type { PartUnion } from '@google/genai';
import {
  processSingleFileContent,
  getSpecificMimeType,
} from '../utils/fileUtils.js';
import type { Config } from '../config/config.js';
import { FileOperation } from '../telemetry/metrics.js';
import { getProgrammingLanguage } from '../telemetry/telemetry-utils.js';
import { logFileOperation } from '../telemetry/loggers.js';
import { FileOperationEvent } from '../telemetry/types.js';
import { isSubpath } from '../utils/paths.js';

/**
 * Parameters for the ReadFile tool
 */
export interface ReadFileToolParams {
  /**
   * The absolute path to the file to read
   */
  absolute_path?: string;

  /**
   * Backward-compatible alias for absolute_path
   */
  path?: string;

  /**
   * The line number to start reading from (optional)
   */
  offset?: number | string;

  /**
   * The number of lines to read (optional)
   */
  limit?: number | string;
}

interface NormalizedReadFileToolParams {
  absolute_path: string;
  offset?: number;
  limit?: number;
}

function parseNumericParam(
  value: number | string | undefined,
  fieldName: 'offset' | 'limit',
): { value?: number; error?: string } {
  if (value === undefined) {
    return {};
  }

  if (typeof value === 'number') {
    return { value };
  }

  const trimmed = value.trim();
  if (trimmed === '') {
    return {
      error: `${fieldName} must be a ${fieldName === 'offset' ? 'non-negative' : 'positive'} number or numeric string`,
    };
  }

  const parsed = Number(trimmed);
  if (Number.isNaN(parsed)) {
    return {
      error: `${fieldName} must be a ${fieldName === 'offset' ? 'non-negative' : 'positive'} number or numeric string`,
    };
  }

  return { value: parsed };
}

function normalizeReadFileParams(params: ReadFileToolParams): {
  normalized?: NormalizedReadFileToolParams;
  error?: string;
} {
  const absolutePath =
    typeof params.absolute_path === 'string' &&
    params.absolute_path.trim() !== ''
      ? params.absolute_path
      : undefined;
  const aliasPath =
    typeof params.path === 'string' && params.path.trim() !== ''
      ? params.path
      : undefined;
  const resolvedPath = absolutePath ?? aliasPath;

  if (!resolvedPath) {
    return {
      error:
        "The 'absolute_path' parameter must be non-empty. Did you mean to pass 'absolute_path'?",
    };
  }

  const parsedOffset = parseNumericParam(params.offset, 'offset');
  if (parsedOffset.error) {
    return { error: parsedOffset.error };
  }

  const parsedLimit = parseNumericParam(params.limit, 'limit');
  if (parsedLimit.error) {
    return { error: parsedLimit.error };
  }

  return {
    normalized: {
      absolute_path: resolvedPath,
      offset: parsedOffset.value,
      limit: parsedLimit.value,
    },
  };
}

class ReadFileToolInvocation extends BaseToolInvocation<
  ReadFileToolParams,
  ToolResult
> {
  constructor(
    private config: Config,
    params: NormalizedReadFileToolParams,
  ) {
    super(params);
  }

  private get normalizedParams(): NormalizedReadFileToolParams {
    return this.params as NormalizedReadFileToolParams;
  }

  getDescription(): string {
    const params = this.normalizedParams;
    const relativePath = makeRelative(
      params.absolute_path,
      this.config.getTargetDir(),
    );
    const shortPath = shortenPath(relativePath);

    const { offset, limit } = params;
    if (offset !== undefined && limit !== undefined) {
      return `${shortPath} (lines ${offset + 1}-${offset + limit})`;
    } else if (offset !== undefined) {
      return `${shortPath} (from line ${offset + 1})`;
    } else if (limit !== undefined) {
      return `${shortPath} (first ${limit} lines)`;
    }

    return shortPath;
  }

  override toolLocations(): ToolLocation[] {
    const params = this.normalizedParams;
    return [{ path: params.absolute_path, line: params.offset }];
  }

  async execute(): Promise<ToolResult> {
    const params = this.normalizedParams;
    const result = await processSingleFileContent(
      params.absolute_path,
      this.config,
      params.offset,
      params.limit,
    );

    if (result.error) {
      return {
        llmContent: result.llmContent,
        returnDisplay: result.returnDisplay || 'Error reading file',
        error: {
          message: result.error,
          type: result.errorType,
        },
      };
    }

    let llmContent: PartUnion;
    if (result.isTruncated) {
      const [start, end] = result.linesShown!;
      const total = result.originalLineCount!;
      llmContent = `Showing lines ${start}-${end} of ${total} total lines.\n\n---\n\n${result.llmContent}`;
    } else {
      llmContent = result.llmContent || '';
    }

    const lines =
      typeof result.llmContent === 'string'
        ? result.llmContent.split('\n').length
        : undefined;
    const mimetype = getSpecificMimeType(params.absolute_path);
    const programming_language = getProgrammingLanguage({
      absolute_path: params.absolute_path,
    });
    logFileOperation(
      this.config,
      new FileOperationEvent(
        ReadFileTool.Name,
        FileOperation.READ,
        lines,
        mimetype,
        path.extname(params.absolute_path),
        programming_language,
      ),
    );

    return {
      llmContent,
      returnDisplay: result.returnDisplay || '',
    };
  }
}

/**
 * Implementation of the ReadFile tool logic
 */
export class ReadFileTool extends BaseDeclarativeTool<
  ReadFileToolParams,
  ToolResult
> {
  static readonly Name: string = ToolNames.READ_FILE;

  constructor(private config: Config) {
    super(
      ReadFileTool.Name,
      ToolDisplayNames.READ_FILE,
      `Reads and returns the content of a specified file. If the file is large, the content will be truncated. The tool's response will clearly indicate if truncation has occurred and will provide details on how to read more of the file using the 'offset' and 'limit' parameters. Handles text, images (PNG, JPG, GIF, WEBP, SVG, BMP), and PDF files. For text files, it can read specific line ranges.`,
      Kind.Read,
      {
        properties: {
          absolute_path: {
            description:
              "The absolute path to the file to read (e.g., '/home/user/project/file.txt'). Relative paths are not supported. You must provide an absolute path.",
            type: 'string',
          },
          path: {
            description:
              "Backward-compatible alias for absolute_path. Prefer 'absolute_path'.",
            type: 'string',
          },
          offset: {
            description:
              "Optional: For text files, the 0-based line number to start reading from. Accepts number or numeric string. Requires 'limit' to be set. Use for paginating through large files.",
            anyOf: [{ type: 'number' }, { type: 'string' }],
          },
          limit: {
            description:
              "Optional: For text files, maximum number of lines to read. Accepts number or numeric string. Use with 'offset' to paginate through large files. If omitted, reads the entire file (if feasible, up to a default limit).",
            anyOf: [{ type: 'number' }, { type: 'string' }],
          },
        },
        type: 'object',
      },
    );
  }

  protected override validateToolParamValues(
    params: ReadFileToolParams,
  ): string | null {
    const normalization = normalizeReadFileParams(params);
    if (!normalization.normalized) {
      return normalization.error || 'Invalid read_file parameters';
    }
    const normalized = normalization.normalized;
    const filePath = normalized.absolute_path;

    if (!path.isAbsolute(filePath)) {
      return `File path must be absolute, but was relative: ${filePath}. You must provide an absolute path.`;
    }

    const workspaceContext = this.config.getWorkspaceContext();
    const projectTempDir = this.config.storage.getProjectTempDir();
    const userSkillsDir = this.config.storage.getUserSkillsDir();
    const resolvedFilePath = path.resolve(filePath);
    const isWithinTempDir = isSubpath(projectTempDir, resolvedFilePath);
    const isWithinUserSkills = isSubpath(userSkillsDir, resolvedFilePath);

    if (
      !workspaceContext.isPathWithinWorkspace(filePath) &&
      !isWithinTempDir &&
      !isWithinUserSkills
    ) {
      const directories = workspaceContext.getDirectories();
      return `File path must be within one of the workspace directories: ${directories.join(
        ', ',
      )} or within the project temp directory: ${projectTempDir}`;
    }
    if (normalized.offset !== undefined && normalized.offset < 0) {
      return 'Offset must be a non-negative number';
    }
    if (normalized.limit !== undefined && normalized.limit <= 0) {
      return 'Limit must be a positive number';
    }

    const fileService = this.config.getFileService();
    if (fileService.shouldQwenIgnoreFile(filePath)) {
      return `File path '${filePath}' is ignored by .qwenignore pattern(s).`;
    }

    return null;
  }

  protected createInvocation(
    params: ReadFileToolParams,
  ): ToolInvocation<ReadFileToolParams, ToolResult> {
    const normalization = normalizeReadFileParams(params);
    if (!normalization.normalized) {
      throw new Error(normalization.error || 'Invalid read_file parameters');
    }

    return new ReadFileToolInvocation(this.config, normalization.normalized);
  }
}
