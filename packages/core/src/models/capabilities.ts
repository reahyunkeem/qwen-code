/**
 * @license
 * Copyright 2025 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  ModelCapabilities,
  ModelToolCallStyle,
} from '../core/contentGenerator.js';

export function isVisionCapableModel(input: {
  model?: string;
  capabilities?: ModelCapabilities;
}): boolean {
  if (input.capabilities?.vision === true) {
    return true;
  }
  if (input.capabilities?.vision === false) {
    return false;
  }

  const model = input.model?.toLowerCase();
  if (!model) {
    return false;
  }

  return (
    model === 'vision-model' ||
    /^qwen[^-]*-vl/.test(model) ||
    model.startsWith('qwen3-vl-plus')
  );
}

export function getConfiguredToolCallStyle(
  capabilities?: ModelCapabilities,
): ModelToolCallStyle | undefined {
  return capabilities?.toolCallStyle;
}

export function isMediaTypeAllowed(
  capabilities: ModelCapabilities | undefined,
  mediaType: 'image' | 'pdf' | 'audio' | 'video',
): boolean {
  if (!capabilities?.media) {
    return true;
  }

  return capabilities.media.includes(mediaType);
}
