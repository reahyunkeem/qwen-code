# 로컬 Qwen3.6 27B 멀티모달 사용 불가 원인 및 해결 방안

## 요약

로컬에서 구동 중인 `qwen3.6 27b` 모델 자체가 멀티모달을 지원하더라도,
현재 Qwen Code는 모델의 비전 지원 여부를 **로컬/OpenAI 호환 모델의
capability로 판단하지 않는다**. 비전 관련 UI/자동 전환 로직은 사실상
`qwen-oauth`의 하드코딩된 `vision-model` 중심으로 동작한다.

다만 코드 경로 전체가 이미지를 완전히 버리는 구조는 아니다. `@이미지파일`
같은 입력은 `inlineData`로 읽히고, OpenAI 호환 백엔드로 보낼 때는
`image_url` data URL로 변환된다. 따라서 로컬 서버가 OpenAI Chat
Completions의 멀티모달 `content: [{ type: "image_url", ... }]` 형식을
정확히 받는다면 동작할 가능성이 있다. 실제로 동작하지 않는다면 원인은
대체로 다음 중 하나다.

1. 현재 모델/인증 타입이 `qwen-oauth`가 아니어서 Qwen Code의 비전 자동 전환
   및 비전 모델 판별 로직에 걸리지 않는다.
2. `modelProviders[*].capabilities.vision` 값은 타입에 존재하지만, 주석상
   "현재 멀티모달 지원 판정에 사용하지 않는다"고 되어 있어 런타임 로컬
   모델의 비전 능력을 기능 게이트에 반영하지 못한다.
3. 로컬 추론 서버의 OpenAI 호환 구현이 Qwen Code가 보내는 `image_url` data
   URL 형식과 다르다. 예를 들어 일부 Ollama/llama.cpp/vLLM 계열 엔드포인트는
   OpenAI 호환 모드, 네이티브 채팅 API, 이미지 배열 필드의 지원 범위가 서로
   다르다.
4. 이미지 포맷, MIME 타입, 파일 크기, 또는 `@파일` 프롬프트 처리 방식 때문에
   이미지가 실제 모델 요청까지 도달하지 않는다.

## 현재 코드 경로 분석

### 1. 파일 입력은 이미지/오디오/비디오/PDF를 `inlineData`로 읽는다

`processSingleFileContent()`는 파일 타입을 감지한 뒤 이미지, 오디오, 비디오,
PDF를 base64로 읽어 `inlineData` 파트로 만든다.

관련 코드:

- `packages/core/src/utils/fileUtils.ts`
  - `detectFileType()`가 MIME 타입이 `image/`, `audio/`, `video/`,
    `application/pdf`인지 확인한다.
  - `processSingleFileContent()`가 해당 파일을 base64로 읽고
    `{ inlineData: { data, mimeType, displayName } }`를 반환한다.
- `packages/core/src/utils/pathReader.ts`
  - `@파일` 또는 디렉터리 확장 시 `processSingleFileContent()` 결과를
    LLM 입력 파트로 넘긴다.

즉, 프롬프트가 `@./sample.png 이 이미지 설명해줘` 형태라면, 이미지 파트가
생성되는 단계 자체는 이미 구현되어 있다.

### 2. OpenAI 호환 요청 변환도 이미지 파트를 지원한다

OpenAI 호환 provider 경로에서는 Gemini-style `Part`를 OpenAI Chat
Completions 메시지로 변환한다. `inlineData`가 이미지 MIME 타입이면 다음과
같은 형태로 변환된다.

```json
{
  "type": "image_url",
  "image_url": {
    "url": "data:image/png;base64,..."
  }
}
```

관련 코드:

- `packages/core/src/core/openaiContentGenerator/converter.ts`
  - `processContent()`가 user role의 media part를 `contentParts`에 추가한다.
  - `createMediaContentPart()`가 `inlineData` 이미지 MIME 타입을
    `image_url` data URL로 변환한다.
  - PDF는 `file`, 오디오는 `input_audio`, 비디오는 `video_url`로 변환하려는
    경로도 존재한다.

따라서 Qwen Code의 OpenAI 호환 경로가 무조건 텍스트 전용인 것은 아니다.
핵심은 **로컬 서버가 이 요청 스키마를 지원하느냐**다.

### 3. 비전 자동 전환은 `qwen-oauth`에만 적용된다

`useVisionAutoSwitch()`는 이미지가 포함된 쿼리를 감지하더라도,
`contentGeneratorConfig.authType !== AuthType.QWEN_OAUTH`이면 바로 통과시킨다.
즉, `OPENAI_BASE_URL`/`OPENAI_MODEL`로 연결한 로컬 모델에는 자동 전환,
비전 안내, capability 기반 판정이 적용되지 않는다.

관련 코드:

- `packages/cli/src/ui/hooks/useVisionAutoSwitch.ts`
  - `shouldOfferVisionSwitch()`가 `authType !== AuthType.QWEN_OAUTH`이면
    `false`를 반환한다.
  - `handleVisionSwitch()`도 `QWEN_OAUTH`가 아니면 `shouldProceed: true`로
    끝난다.

이 동작은 로컬 모델이 비전 모델인지 여부를 판단하지 않고, 단순히 로컬/OpenAI
호환 모델은 비전 자동 전환 대상이 아니라고 처리한다.

### 4. 비전 모델 목록도 `qwen-oauth`의 하드코딩 값 중심이다

CLI의 모델 목록은 `qwen-oauth`에 대해 하드코딩된 `coder-model`과
`vision-model`을 사용한다. `isVisionModel()`도 이 목록에서 `isVision`인
모델인지만 본다.

관련 코드:

- `packages/cli/src/ui/models/availableModels.ts`
  - `MAINLINE_VLM = 'vision-model'`
  - `AVAILABLE_MODELS_QWEN`에만 `isVision: true`가 붙은 `vision-model`이 있다.
  - `getDefaultVisionModel()`은 항상 `vision-model`을 반환한다.
  - `isVisionModel()`은 `AVAILABLE_MODELS_QWEN` 배열만 검사한다.
- `packages/core/src/models/constants.ts`
  - `QWEN_OAUTH_ALLOWED_MODELS`도 `DEFAULT_QWEN_MODEL`과 `vision-model`로
    제한된다.

따라서 `qwen3.6-27b` 같은 로컬 모델명이 실제 비전 모델이어도 이 하드코딩
목록에는 없으므로 "비전 모델"로 인식되지 않는다.

### 5. `capabilities.vision`은 설정 타입에 있지만 기능 판정에는 아직 사용되지 않는다

모델 설정 타입에는 다음과 같은 capability 필드가 있다.

```ts
export interface ModelCapabilities {
  /** Supports image/vision inputs */
  vision?: boolean;
}
```

하지만 같은 파일의 `ModelConfig.capabilities` 주석은 현재 이 값을 멀티모달
지원 판정에 사용하지 않는다고 설명한다.

관련 코드:

- `packages/core/src/models/types.ts`
  - `ModelCapabilities.vision` 필드가 존재한다.
  - `ModelConfig.capabilities` 주석에 "reserve for future use" 및 "Now we do
    not read this to determine multi-modal support" 취지가 적혀 있다.
- `packages/core/src/models/modelRegistry.ts`
  - `/model` 표시용 `AvailableModel.isVision`에는 `capabilities.vision`이
    반영된다.

즉, 사용자 설정에 아래처럼 적어도 UI 표시 일부에는 도움이 될 수 있으나,
비전 자동 전환/요청 허용 여부를 결정하는 일반 기능 게이트로는 충분히 연결되어
있지 않다.

```json
{
  "modelProviders": {
    "openai": [
      {
        "id": "qwen3.6-27b",
        "name": "Qwen3.6 27B Local",
        "baseUrl": "http://localhost:8000/v1",
        "envKey": "OPENAI_API_KEY",
        "capabilities": { "vision": true }
      }
    ]
  }
}
```

## 사용자가 겪는 현상의 가장 가능성 높은 원인

### 원인 A: 로컬 모델 capability를 Qwen Code가 기능 게이트로 사용하지 않음

로컬 `qwen3.6 27b`가 비전 입력을 지원해도, 현재 Qwen Code는 일반 OpenAI
호환 모델의 capability를 기준으로 "현재 모델이 비전 모델인가?"를 판단하지
않는다. 비전 모델 판별은 `qwen-oauth`의 `vision-model` 하드코딩에 강하게
묶여 있다.

### 원인 B: 로컬 서버의 멀티모달 OpenAI 호환 스키마 불일치

Qwen Code는 OpenAI Chat Completions 형식의 `image_url` data URL을 보낸다.
로컬 서버가 이 형식을 받지 않고 별도 필드나 네이티브 API만 지원하면 모델이
멀티모달이어도 요청이 실패하거나 이미지가 무시된다.

확인해야 할 점:

- 서버가 `/v1/chat/completions`에서 `messages[].content` 배열을 받는가?
- 배열 안의 `{ "type": "image_url", "image_url": { "url": "data:..." } }`를
  받는가?
- base64 data URL이 아니라 URL 파일 경로나 별도 `images` 배열만 받는 구현은
  아닌가?
- 스트리밍 응답에서 OpenAI 호환 chunk 형식을 정확히 내보내는가?

### 원인 C: 입력 방식 문제

Qwen Code가 이미지 파트를 만들려면 보통 `@파일경로` 방식으로 파일이 프롬프트에
포함되어야 한다. 단순히 "이 이미지 봐줘"라고 쓰거나, 터미널에 경로를 텍스트로만
입력하면 이미지가 모델 요청에 포함되지 않는다.

## 폐쇄망 vLLM 환경 기준 최우선 수정 지점

질문자의 추가 확인처럼 별도 Python 코드로 같은 vLLM 서버에 base64 이미지를
보냈을 때 정상 처리된다면, 1순위 의심 지점은 vLLM이나 Qwen3.6 27B 모델이
아니라 **Qwen Code 내부의 모델 capability 판정 및 `@파일` 처리 결과가 실제
OpenAI 요청에 어떤 모양으로 들어가는지**다.

가장 효과적인 수정 순서는 다음과 같다.

### 1순위: `@이미지`가 실제 요청에 `image_url`로 들어가는지 로그로 확정

먼저 코드를 고치기 전에 OpenAI 요청 로그를 켜서 Qwen Code가 vLLM으로 보내는
body를 확인하는 것이 가장 빠르다. 폐쇄망에서도 외부 인터넷 없이 가능하다.

```json
{
  "model": {
    "enableOpenAILogging": true,
    "openAILoggingDir": "./logs/openai"
  }
}
```

또는 실행 옵션을 쓸 수 있다면 다음처럼 켠다.

```bash
qwen --openai-logging --openai-logging-dir ./logs/openai
```

정상이라면 로그의 `messages` 안에 아래와 같은 배열 content가 있어야 한다.

```json
{
  "role": "user",
  "content": [
    { "type": "text", "text": "..." },
    {
      "type": "image_url",
      "image_url": {
        "url": "data:image/png;base64,..."
      }
    }
  ]
}
```

로그에 `image_url`이 없다면 수정 지점은 `@파일` 처리 경로다. 로그에
`image_url`이 있는데 vLLM 응답만 "이미지를 지원하지 않는다"라면 수정 지점은
provider 변환 형식 또는 모델명/엔드포인트 설정이다.

### 2순위: 로컬 모델을 `modelProviders`에 vision 모델로 등록

환경변수 `OPENAI_MODEL`만으로 로컬 모델을 잡으면 Qwen Code가 해당 모델의
capability를 알 수 없다. 폐쇄망 vLLM 환경에서는 settings에 명시적으로
등록하는 방식이 가장 안전하다.

```json
{
  "selectedAuthType": "openai",
  "model": {
    "name": "qwen3.6-27b",
    "enableOpenAILogging": true,
    "openAILoggingDir": "./logs/openai"
  },
  "modelProviders": {
    "openai": [
      {
        "id": "qwen3.6-27b",
        "name": "Qwen3.6 27B vLLM Local",
        "baseUrl": "http://YOUR_VLLM_HOST:8000/v1",
        "envKey": "OPENAI_API_KEY",
        "capabilities": {
          "vision": true
        }
      }
    ]
  }
}
```

다만 현재 코드에서는 `capabilities.vision`이 표시용에 가깝기 때문에, 아래
3순위 코드 수정까지 해야 Qwen Code의 비전 관련 판단이 로컬 모델에도 일관되게
적용된다.

### 3순위: `useVisionAutoSwitch.ts`의 `qwen-oauth` 전용 비전 판정을 공통 capability 판정으로 교체

가장 효과적인 코드 수정 위치는
`packages/cli/src/ui/hooks/useVisionAutoSwitch.ts`와
`packages/cli/src/ui/models/availableModels.ts`다. `converter.ts`는 이미
`inlineData` 이미지를 `image_url` data URL로 바꾸고 있으므로, Python 테스트로
vLLM의 base64 처리가 검증된 상황에서는 먼저 건드릴 필요가 없다.

권장 방향은 다음과 같다.

1. 현재 authType의 모델 목록에서 현재 모델의 `capabilities.vision` 또는
   `isVision` 값을 조회하는 헬퍼를 만든다.
2. 현재 모델이 vision-capable이면 `@이미지` 입력을 막거나 `vision-model`로
   바꾸려 하지 말고 그대로 보낸다.
3. 현재 모델이 vision-capable이 아니고 같은 authType 안에 vision 모델이 있을
   때만 전환을 제안한다.
4. `qwen-oauth`일 때만 기존 `vision-model` 하드코딩 fallback을 유지한다.

예시 헬퍼:

```ts
export function modelSupportsVision(
  authType: AuthType,
  modelId: string,
  config?: Config,
): boolean {
  if (authType === AuthType.QWEN_OAUTH) {
    return isVisionModel(modelId);
  }

  if (!config) {
    return false;
  }

  return config
    .getAvailableModelsForAuthType(authType)
    .some(
      (model) =>
        model.id === modelId &&
        (model.isVision === true || model.capabilities?.vision === true),
    );
}
```

`handleVisionSwitch()`에서는 `contentGeneratorConfig.authType !==
AuthType.QWEN_OAUTH`이면 즉시 return 하는 현재 구조를 없애고, 위 헬퍼가
`true`를 반환하면 그대로 진행하도록 바꾸는 것이 핵심이다.

```ts
const currentSupportsVision = modelSupportsVision(
  contentGeneratorConfig.authType,
  config.getModel(),
  config,
);

if (currentSupportsVision) {
  return { shouldProceed: true };
}
```

이 수정은 폐쇄망 vLLM처럼 "외부 모델 목록 조회가 불가능하고, 사용자가 settings로
모델 능력을 선언해야 하는 환경"에 가장 잘 맞는다.

### 4순위: 로그에 `image_url`은 있는데 vLLM이 거부하면 provider 변환만 수정

Python 테스트가 아래 OpenAI-compatible 형식과 동일했다면 이 단계는 필요 없다.

```json
{
  "type": "image_url",
  "image_url": {
    "url": "data:image/png;base64,..."
  }
}
```

만약 Python 코드는 vLLM 네이티브 형식이나 다른 필드명으로 성공했고, Qwen Code
로그는 `image_url` 형식이라면 `packages/core/src/core/openaiContentGenerator`
아래에 provider별 media 변환 hook을 추가해야 한다. 이 경우 수정 위치는
`converter.ts` 자체보다 `provider/types.ts`에 optional hook을 만들고
`converter.ts`에서 그 hook을 호출하게 하는 구조가 장기적으로 안전하다.

## 즉시 시도 가능한 우회 방법

### 1. OpenAI 호환 서버 스키마를 먼저 검증한다

로컬 서버가 OpenAI 멀티모달 Chat Completions를 받는지 Qwen Code 밖에서 먼저
확인한다.

예시:

```bash
curl http://localhost:8000/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer dummy' \
  -d '{
    "model": "qwen3.6-27b",
    "messages": [
      {
        "role": "user",
        "content": [
          { "type": "text", "text": "이 이미지 설명해줘" },
          {
            "type": "image_url",
            "image_url": {
              "url": "data:image/png;base64,BASE64_DATA_HERE"
            }
          }
        ]
      }
    ]
  }'
```

이 요청이 실패하면 Qwen Code 수정 전에 로컬 서버의 API 형식 또는 OpenAI 호환
브릿지를 맞춰야 한다.

### 2. Qwen Code에서는 `@이미지파일`로 입력한다

예시:

```text
@./sample.png 이 화면에서 오류 메시지를 찾아줘
```

`@파일` 처리를 거치면 이미지가 `inlineData`로 변환될 수 있다. 일반 텍스트
경로만 입력하면 이미지가 첨부되지 않는다.

### 3. 지원 이미지 MIME 타입을 맞춘다

현재 지원 목록은 다음 MIME 타입 중심이다.

- `image/bmp`
- `image/jpeg`
- `image/jpg`
- `image/png`
- `image/tiff`
- `image/webp`
- `image/heic`

로컬 모델/서버가 특정 포맷만 안정적으로 지원한다면 우선 PNG/JPEG로 변환해서
테스트하는 것이 좋다.

## 권장 코드 수정 방향

### 1단계: 현재 모델의 vision capability를 공통 로직으로 조회

새 헬퍼를 core 또는 CLI 모델 유틸에 추가한다.

목표:

- `qwen-oauth` 하드코딩 모델뿐 아니라 `modelProviders`에 등록된 모델의
  `capabilities.vision`도 읽는다.
- env 기반 런타임 모델(`OPENAI_MODEL`)은 capability 정보가 없으므로 기본값은
  `false`로 두되, settings의 `modelProviders` 등록을 권장한다.

예상 인터페이스:

```ts
function currentModelSupportsVision(config: Config): boolean {
  const authType = config.getContentGeneratorConfig()?.authType;
  const model = config.getModel();
  if (!authType) return false;

  const models = config.getAvailableModelsForAuthType(authType);
  return models.some(
    (availableModel) =>
      availableModel.id === model &&
      (availableModel.isVision || availableModel.capabilities?.vision),
  );
}
```

### 2단계: `shouldOfferVisionSwitch()`의 `qwen-oauth` 전용 조건 완화

현재 로직은 `qwen-oauth`가 아니면 비전 스위치를 제안하지 않는다. 이를 다음처럼
바꾸는 것이 좋다.

- 현재 모델이 이미 `vision: true`이면 아무 것도 하지 않고 그대로 진행한다.
- 현재 모델이 `vision: false`이고, 같은 authType 안에 `vision: true` 모델이
  있으면 해당 모델로 전환을 제안한다.
- 같은 authType 안에 비전 모델이 없으면 안내만 표시한다.

### 3단계: 기본 비전 모델을 하드코딩하지 않고 authType/model registry에서 선택

`getDefaultVisionModel()`이 항상 `vision-model`을 반환하는 구조는 로컬 모델과
맞지 않는다. 다음 순서로 후보를 찾는 방식이 더 안전하다.

1. 현재 authType의 모델 목록에서 `isVision || capabilities.vision`인 첫 모델
2. 사용자가 settings에 지정한 기본 VLM
3. `qwen-oauth`일 때만 기존 `vision-model` fallback

### 4단계: provider별 media 변환 전략 추가

현재 OpenAI 호환 변환은 이미지에 대해 `image_url` data URL 하나로 통일되어
있다. 로컬 서버가 다른 스키마를 요구하면 provider hook이 필요하다.

예시 방향:

```ts
interface OpenAICompatibleProvider {
  transformMediaContentPart?(part: OpenAIContentPart): OpenAIContentPart;
}
```

또는 더 명시적으로:

```ts
type MediaRequestFormat = 'openai-image-url' | 'ollama-images-array';
```

settings에서 로컬 provider별로 media format을 지정할 수 있게 하면,
Qwen/Ollama/vLLM/llama.cpp 계열 차이를 흡수할 수 있다.

### 5단계: 테스트 추가

추가해야 할 테스트:

- `converter.ts`
  - `inlineData image/png`가 OpenAI `image_url` data URL로 변환되는지
  - `fileData image/*`가 URL 기반 `image_url`로 변환되는지
- `useVisionAutoSwitch.ts`
  - `openai` authType + `capabilities.vision: true` 현재 모델이면 전환 없이 진행
  - `openai` authType + 현재 모델 비전 미지원 + 같은 authType의 비전 모델 존재 시
    전환 제안
  - `qwen-oauth` 기존 동작이 깨지지 않는지
- 로컬 provider e2e 또는 mocked OpenAI client
  - 이미지 포함 request body가 기대 스키마로 나가는지

## 권장 settings 예시

로컬 OpenAI 호환 서버가 `image_url` data URL을 지원한다는 전제하에:

```json
{
  "selectedAuthType": "openai",
  "model": {
    "name": "qwen3.6-27b"
  },
  "modelProviders": {
    "openai": [
      {
        "id": "qwen3.6-27b",
        "name": "Qwen3.6 27B Local",
        "baseUrl": "http://localhost:8000/v1",
        "envKey": "OPENAI_API_KEY",
        "capabilities": {
          "vision": true
        },
        "generationConfig": {
          "contextWindowSize": 131072
        }
      }
    ]
  }
}
```

환경 변수 예시:

```bash
export OPENAI_API_KEY=dummy
export OPENAI_BASE_URL=http://localhost:8000/v1
export OPENAI_MODEL=qwen3.6-27b
```

단, env 기반 런타임 모델만 쓰면 capability 메타데이터가 없으므로,
멀티모달 모델임을 Qwen Code에 알려주려면 `modelProviders` 등록 방식이 더 낫다.

## 결론

현재 Qwen Code는 이미지 파일을 읽고 OpenAI 호환 `image_url` 요청으로 변환하는
기본 경로를 이미 갖고 있다. 그러나 로컬 `qwen3.6 27b` 같은 모델의 멀티모달
능력을 **capability 기반으로 인식하고 UI/자동 전환/안내 로직에 반영하는 부분은
부족하다**.

가장 현실적인 해결 순서는 다음과 같다.

1. 로컬 서버가 OpenAI Chat Completions의 `image_url` data URL 스키마를 받는지
   독립적으로 검증한다.
2. Qwen Code에서는 `@이미지파일` 방식으로 이미지가 실제 파트로 들어가게 한다.
3. settings의 `modelProviders.openai[].capabilities.vision = true`로 모델
   메타데이터를 등록한다.
4. 코드 레벨에서는 `qwen-oauth` 하드코딩 중심의 비전 판별을 제거하고, 현재
   authType/model registry의 `capabilities.vision`을 공통 capability 소스로
   사용하도록 수정한다.
5. 로컬 서버가 `image_url`이 아닌 다른 멀티모달 스키마를 요구한다면 provider별
   media request format hook을 추가한다.
