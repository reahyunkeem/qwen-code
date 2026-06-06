# vLLM 기반 Qwen 비전 모델 지원 분석설계서

## 목적

회사 내부 폐쇄망에서 vLLM으로 서빙하는 `qwen3.6-27b` 모델을 Qwen Code의
OpenAI-compatible 프로토콜로 사용할 때 이미지 입력을 정상 지원하기 위한 문제
분석과 변경 설계를 정리합니다.

대상 모델은 이름상 `qwen-vl` 계열은 아니지만 비전 입력을 지원합니다. 현재
Qwen Code는 일부 경로에서 모델명을 기준으로 비전 모델 여부를 판정하므로,
OpenAI-compatible/vLLM 환경의 사용자 정의 비전 모델이 비전 모델로 취급되지
않을 수 있습니다.

## 현재 동작 요약

Qwen Code의 이미지 입력 경로는 크게 세 단계입니다.

1. 파일/클립보드/도구 결과에서 이미지가 `inlineData` 또는 `fileData` 형태의
   Gemini `Part`로 들어옵니다.
2. OpenAI-compatible content generator가 Gemini 형식 요청을 OpenAI Chat
   Completions 요청으로 변환합니다.
3. OpenAI SDK가 `baseURL`이 가리키는 provider 또는 vLLM 서버로 요청을 보냅니다.

현재 변환기(`packages/core/src/core/openaiContentGenerator/converter.ts`)는 이미지
`inlineData`를 OpenAI `image_url` data URL로 변환합니다.

```json
{
  "type": "image_url",
  "image_url": {
    "url": "data:image/png;base64,..."
  }
}
```

따라서 OpenAI-compatible 요청 포맷 자체는 vLLM의 일반적인 multimodal chat
template 입력과 맞는 방향입니다.

## 확인된 제한 지점

### 1. 비전 모델 판정이 모델명 패턴에 묶여 있음

`packages/core/src/core/prompts.ts`의 tool-call prompt 선택 로직은 아래 모델명만
Qwen VL 계열로 인식합니다.

- `qwen*-vl`
- `vision-model`
- 환경변수 `QWEN_CODE_TOOL_CALL_STYLE=qwen-vl`

`qwen3.6-27b`는 위 패턴에 걸리지 않으므로 기본 tool-call 예시를 사용합니다.
비전 모델용 프롬프트가 필요한 내부 모델에서는 도구 호출 품질 저하 또는 모델별
출력 형식 불일치가 발생할 수 있습니다.

### 2. DashScope 전용 비전 옵션이 제한된 모델명에만 적용됨

`packages/core/src/core/openaiContentGenerator/provider/dashscope.ts`는 다음 모델만
비전 모델로 판단해 `vl_high_resolution_images: true`를 추가합니다.

- `vision-model`
- `qwen-vl*`
- `qwen3-vl-plus`

vLLM 기본 provider는 이 DashScope 전용 옵션을 사용하지 않으므로 직접적인 실패
원인은 아닐 수 있습니다. 다만 코드 전반의 비전 capability가 모델명 기반으로
흩어져 있음을 보여줍니다.

### 3. 자동 비전 모델 전환은 Qwen OAuth 전용

`packages/cli/src/ui/hooks/useVisionAutoSwitch.ts`는 이미지 입력 감지 시 자동 전환을
Qwen OAuth에서만 수행합니다.

OpenAI-compatible provider에서는 이미지가 포함되어도 자동 전환 로직이 동작하지
않습니다. 회사 설정에서 현재 모델이 이미 vLLM 비전 모델이면 자동 전환이 필요
없지만, Qwen Code가 이 모델을 비전 모델로 인식해 안내/검증을 수행할 방법도
부족합니다.

### 4. token limit과 비전 capability가 분리되어 있지 않음

`packages/core/src/core/tokenLimits.ts`에는 일부 Qwen VL 모델의 token limit이
하드코딩되어 있습니다. 사용자 정의 vLLM 모델은 일반 fallback limit을 사용할 수
있고, 이미지 token 추정과 context window 정책이 실제 모델과 다를 수 있습니다.

## 문제 정의

폐쇄망 vLLM 모델 `qwen3.6-27b`는 OpenAI-compatible endpoint와 이미지 입력을
지원하지만, Qwen Code는 비전 지원 여부를 명시적인 provider/model capability로
관리하지 않습니다. 그 결과 사용자 정의 모델은 다음 문제가 발생할 수 있습니다.

- 모델명이 `qwen-vl` 또는 `vision-model`이 아니면 비전 모델용 prompt가 적용되지
  않습니다.
- 설정 파일에서 “이 모델은 이미지 입력을 지원한다”라고 선언할 수 없습니다.
- OpenAI-compatible provider에서 이미지 입력 허용 여부를 명확히 제어할 수
  없습니다.
- vLLM이 지원하지 않는 media type까지 변환되어 서버 오류가 날 수 있습니다.
- 내부 모델별 context/output token limit, 이미지 전처리 정책을 설정하기 어렵습니다.

## 설계 목표

- 모델명 패턴이 아니라 설정 기반 capability로 비전 지원 여부를 표현합니다.
- 기존 Qwen OAuth와 DashScope 동작은 유지합니다.
- OpenAI-compatible/vLLM provider에서 이미지 입력을 명시적으로 허용할 수 있게
  합니다.
- 폐쇄망 설정만으로 `qwen3.6-27b`를 비전 모델로 등록할 수 있게 합니다.
- 기존 `inlineData -> image_url` 변환 경로는 최대한 재사용합니다.
- vLLM 서버별 차이는 `generationConfig` 또는 provider config로 흡수합니다.

## 비목표

- vLLM 서버 자체의 multimodal chat template 구성 변경은 Qwen Code 범위 밖입니다.
- 모든 OpenAI-compatible provider에 PDF, audio, video 입력을 보장하지 않습니다.
- Qwen OAuth의 `vision-model` alias 정책을 제거하지 않습니다.
- 모델별 이미지 token 계산을 완전히 정확하게 구현하지 않습니다.

## 권장 설계

### 1. ModelConfig에 capability 필드 추가

`modelProviders`의 각 모델 정의에 capability를 선언할 수 있도록 확장합니다.

예시 설정:

```json
{
  "modelProviders": {
    "openai": [
      {
        "id": "qwen3.6-27b-vllm",
        "name": "Qwen 3.6 27B vLLM",
        "envKey": "COMPANY_LLM_API_KEY",
        "baseUrl": "https://vllm.company.local/v1",
        "generationConfig": {
          "contextWindowSize": 131072,
          "capabilities": {
            "vision": true,
            "media": ["image"]
          }
        }
      }
    ]
  },
  "model": {
    "name": "qwen3.6-27b-vllm"
  },
  "security": {
    "auth": {
      "selectedType": "openai"
    }
  }
}
```

후보 타입:

```ts
type ModelCapabilities = {
  vision?: boolean;
  media?: Array<'image' | 'pdf' | 'audio' | 'video'>;
  toolCallStyle?: 'general' | 'qwen-coder' | 'qwen-vl';
};
```

`toolCallStyle`을 capability에 포함하면 모델명 정규식과 환경변수 override 사이의
중간 제어 지점을 제공할 수 있습니다.

### 2. ContentGeneratorConfig로 capability 전달

현재 `ContentGeneratorConfig`는 model, baseUrl, apiKey, generationConfig 등을
content generator에 전달합니다. 여기에 provider model config에서 해석한 capability를
전달합니다.

권장 필드:

```ts
interface ContentGeneratorConfig {
  model: string;
  capabilities?: ModelCapabilities;
}
```

또는 기존 `generationConfig` 하위에 유지할 경우:

```ts
generationConfig: {
  capabilities?: ModelCapabilities;
}
```

권장안은 `capabilities`를 1급 필드로 분리하는 것입니다. 이유는 capability는 sampling
parameter가 아니며 요청 body에 그대로 전달되면 안 되기 때문입니다.

### 3. 공통 비전 판정 유틸 도입

모델명 기반 판정을 여러 곳에서 직접 수행하지 않도록 공통 유틸을 둡니다.

예시:

```ts
function isVisionCapableModel(input: {
  model?: string;
  capabilities?: ModelCapabilities;
}): boolean {
  if (input.capabilities?.vision === true) {
    return true;
  }

  const model = input.model?.toLowerCase();
  if (!model) {
    return false;
  }

  return (
    model === 'vision-model' ||
    /^qwen(?:\d+(?:\.\d+)?)?-vl/.test(model) ||
    /^qwen3-vl-plus/.test(model)
  );
}
```

적용 대상:

- `packages/core/src/core/prompts.ts`
- `packages/core/src/core/openaiContentGenerator/provider/dashscope.ts`
- `packages/cli/src/ui/models/availableModels.ts`
- `packages/cli/src/ui/hooks/useVisionAutoSwitch.ts`
- 관련 테스트

### 4. OpenAI 변환기에서 media capability 기반 필터링

현재 converter는 이미지, PDF, audio, video를 OpenAI content part로 변환할 수 있습니다.
vLLM 모델이 이미지 외 media를 지원하지 않는다면 서버 오류를 유발할 수 있습니다.

권장 동작:

- `capabilities.media`가 없으면 기존 동작 유지
- `capabilities.media`가 있으면 허용 media만 OpenAI content part로 변환
- 허용되지 않은 media는 명시적인 text warning part로 변환하거나 사전 오류 처리

폐쇄망 vLLM Qwen 모델의 기본 권장값:

```json
"capabilities": {
  "vision": true,
  "media": ["image"],
  "toolCallStyle": "qwen-vl"
}
```

### 5. prompt 선택에서 capability 우선 적용

`getToolCallExamples(model?: string)`은 현재 model 문자열만 받습니다. 이를 다음 중
하나로 변경합니다.

권장안:

```ts
getToolCallExamples(options?: {
  model?: string;
  toolCallStyle?: 'general' | 'qwen-coder' | 'qwen-vl';
  capabilities?: ModelCapabilities;
})
```

우선순위:

1. `QWEN_CODE_TOOL_CALL_STYLE` 환경변수
2. `capabilities.toolCallStyle`
3. `capabilities.vision === true`이면 `qwen-vl`
4. 기존 모델명 패턴
5. `general`

이렇게 하면 `qwen3.6-27b`처럼 이름만으로 판단할 수 없는 모델도 설정만으로
비전 프롬프트를 사용할 수 있습니다.

### 6. vLLM OpenAI request 호환성 유지

vLLM OpenAI-compatible server는 일반적으로 Chat Completions의 content array와
`image_url` data URL을 지원합니다. Qwen Code는 이미 이 형식으로 변환하므로,
핵심 구현은 “이미지를 보내지 못하게 막는 로직 제거”가 아니라 “비전 가능 모델로
정확히 판정하고 필요한 prompt/정책을 적용”하는 쪽입니다.

필요 시 vLLM 전용 `extra_body`를 그대로 사용할 수 있습니다.

예:

```json
"generationConfig": {
  "extra_body": {
    "chat_template_kwargs": {
      "enable_thinking": false
    }
  }
}
```

실제 key는 사내 vLLM 배포 설정과 chat template 구현에 맞춰 조정해야 합니다.

## 설정 예시

폐쇄망 `~/.qwen/settings.json` 예시:

```json
{
  "env": {
    "COMPANY_LLM_API_KEY": "${COMPANY_LLM_API_KEY}"
  },
  "security": {
    "auth": {
      "selectedType": "openai"
    }
  },
  "model": {
    "name": "qwen3.6-27b-vllm"
  },
  "modelProviders": {
    "openai": [
      {
        "id": "qwen3.6-27b-vllm",
        "name": "Qwen 3.6 27B vLLM",
        "description": "Internal vLLM-hosted Qwen vision model",
        "envKey": "COMPANY_LLM_API_KEY",
        "baseUrl": "https://vllm.company.local/v1",
        "generationConfig": {
          "contextWindowSize": 131072,
          "capabilities": {
            "vision": true,
            "media": ["image"],
            "toolCallStyle": "qwen-vl"
          },
          "samplingParams": {
            "temperature": 0.3,
            "max_tokens": 8192
          }
        }
      }
    ]
  }
}
```

임시 우회 설정:

```bash
set QWEN_CODE_TOOL_CALL_STYLE=qwen-vl
```

위 환경변수는 프롬프트 스타일만 바꾸며, 모델 capability를 Qwen Code 전체에
전달하지는 못합니다. 따라서 장기 해법은 설정 기반 capability 추가입니다.

## 구현 단계

### 1단계: schema와 타입 확장

- `ModelConfig` 또는 `generationConfig` schema에 `capabilities` 추가
- 설정 문서 업데이트
- 알 수 없는 capability 값 검증

### 2단계: capability resolver 추가

- model provider 설정에서 capability를 읽어 `ContentGeneratorConfig`로 전달
- `capabilities` source tracking이 필요하면 `generationConfigSources`에 출처 기록

### 3단계: 공통 판정 유틸 적용

- 기존 `isVisionModel`/정규식 기반 로직을 공통 유틸로 통합
- 기존 Qwen OAuth `vision-model` 동작 보존
- `qwen-vl`, `qwen3-vl-plus` 기존 테스트 유지

### 4단계: prompt 선택 개선

- `getToolCallExamples`가 capability 또는 toolCallStyle을 받도록 변경
- system prompt 생성 호출부에서 현재 모델 capability 전달
- 환경변수 override 우선순위 유지

### 5단계: OpenAI converter media policy 적용

- `OpenAIContentConverter` 생성자에 capability 전달
- image 허용 모델은 기존 `image_url` 변환 유지
- image 미지원 모델에서 image part가 들어오면 명확한 오류 또는 안내 메시지 제공

### 6단계: 테스트 추가

- OpenAI provider + `capabilities.vision=true` 모델에서 이미지가 `image_url`로 변환됨
- `qwen3.6-27b-vllm` 설정에서 `qwen-vl` tool-call prompt 선택
- `capabilities.media=["image"]`일 때 PDF/audio/video는 허용되지 않음
- 기존 `vision-model`, `qwen-vl-max`, `qwen3-vl-plus` 동작 회귀 없음
- `QWEN_CODE_TOOL_CALL_STYLE` 환경변수 override 회귀 없음

## 영향 범위

수정 예상 파일:

- `packages/core/src/models/*`
- `packages/core/src/core/prompts.ts`
- `packages/core/src/core/openaiContentGenerator/converter.ts`
- `packages/core/src/core/openaiContentGenerator/pipeline.ts`
- `packages/core/src/core/openaiContentGenerator/provider/dashscope.ts`
- `packages/cli/src/config/settingsSchema.ts`
- `packages/cli/src/ui/models/availableModels.ts`
- `packages/cli/src/ui/hooks/useVisionAutoSwitch.ts`
- `docs/users/configuration/settings.md`
- `docs/users/configuration/auth.md`

## vLLM 서버 측 확인사항

Qwen Code 변경만으로 해결되지 않는 항목도 있습니다. 사내 vLLM 서버에서 아래를
확인해야 합니다.

- OpenAI Chat Completions endpoint가 `/v1/chat/completions`로 노출되어 있는지
- request content array의 `image_url.url = data:image/...;base64,...`를 허용하는지
- vLLM 실행 시 multimodal limit이 충분한지
- Qwen vision chat template이 적용되어 있는지
- tool calling과 vision을 동시에 사용할 때 응답 포맷이 Qwen Code parser와 맞는지
- 이미지 크기 제한, base64 payload 제한, reverse proxy body size 제한이 충분한지

## 리스크와 대응

| 리스크                                             | 영향               | 대응                                    |
| -------------------------------------------------- | ------------------ | --------------------------------------- |
| capability가 request body에 섞여 provider로 전송됨 | vLLM 400 오류      | `capabilities`는 sampling params와 분리 |
| provider별 media 지원이 다름                       | 특정 provider 오류 | `media` allowlist 적용                  |
| 모델명 패턴과 capability가 충돌                    | 예측 어려운 동작   | capability 명시값 우선                  |
| 기존 Qwen OAuth 자동 전환 회귀                     | 사용자 경험 저하   | 기존 alias/정규식 테스트 유지           |
| vLLM chat template 미설정                          | 이미지 입력 실패   | 서버 측 체크리스트 별도 검증            |

## 수용 기준

- `qwen3.6-27b-vllm`을 OpenAI-compatible provider로 설정할 수 있습니다.
- `capabilities.vision=true` 설정 시 이미지 입력이 거부되지 않고 OpenAI
  `image_url` content part로 vLLM에 전달됩니다.
- 해당 모델에 `qwen-vl` tool-call prompt style을 적용할 수 있습니다.
- 기존 Qwen OAuth `vision-model`과 DashScope Qwen VL 모델 동작은 유지됩니다.
- 이미지 미지원 모델에 이미지 입력 시 사용자가 이해할 수 있는 안내를 받습니다.

## 임시 대응안

정식 구현 전에는 아래 조합으로 일부 문제를 완화할 수 있습니다.

1. 모델 provider를 OpenAI-compatible로 등록합니다.
2. 모델명을 `vision-model` 또는 `qwen-vl-*` alias로 등록해 현재 정규식에 맞춥니다.
3. 실제 vLLM backend model 이름이 별도로 필요하면 사내 gateway에서 alias를
   실제 모델명으로 매핑합니다.
4. 또는 `QWEN_CODE_TOOL_CALL_STYLE=qwen-vl` 환경변수를 사용합니다.

임시 대응은 모델명/프롬프트 문제만 완화하며, 설정 기반 capability와 media 정책을
제공하지 않으므로 장기 해법으로는 권장하지 않습니다.
