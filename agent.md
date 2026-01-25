# Qwen Code 프로젝트 분석 리포트 (agent.md)

이 문서는 `qwen-code` 프로젝트의 구조, 기능 및 기술 스택에 대한 상세 분석 내용을 담고 있습니다.

## 1. 프로젝트 개요

**Qwen Code**는 터미널 환경에서 동작하는 오픈소스 AI 에이전트입니다. [Qwen/Qwen3-Coder](https://github.com/QwenLM/Qwen3-Coder) 모델에 최적화되어 있으며, 개발자가 대규모 코드베이스를 이해하고, 반복적인 작업을 자동화하며, 개발 속도를 높일 수 있도록 돕습니다.

Google의 Gemini CLI 기술을 기반으로 하고 있으나, Qwen-Coder 모델의 특성에 맞게 파서 및 연동 로직이 튜닝되어 있습니다.

## 2. 주요 기능

- **에이전틱 워크플로우 (Agentic Workflow)**: Skills, SubAgents, Plan Mode 등의 고도화된 기능을 통해 복잡한 작업을 자율적으로 수행합니다.
- **다양한 연동 모드**:
  - **대화형 모드 (Interactive Mode)**: 터미널 UI를 통한 실시간 대화 및 코드 편집.
  - **헤드리스 모드 (Headless Mode)**: 스크립트 기반 자동화 및 CI/CD 연동 (`qwen -p "질문"`).
  - **IDE 통합**: VS Code, Zed, JetBrains IDE 연동 지원.
- **인증 방식 지원**:
  - **Qwen OAuth**: `qwen.ai` 계정을 통한 무료 토큰(일일 2,000회 제한) 사용.
  - **OpenAI 호환 API**: API 키 및 커스텀 엔드포인트 설정 지원.
- **다국어 지원**: 한국어, 영어, 중국어, 일본어 등 다국어 문서 및 인터페이스 지원.

## 3. 프로젝트 구조 (Monorepo)

프로젝트는 `npm workspaces`를 사용하는 모노레포 구조로 되어 있습니다.

### 주요 패키지 (`/packages`)

- **`core`**: 에이전트의 핵심 로직, 모델 연동, 도구 실행 엔진 등이 포함된 핵심 라이브러리. (상세 내용 하단 참조)
- **`cli`**: 사용자가 터미널에서 사용하는 CLI 명령어 실체.
- **`sdk-typescript`**: 외부 애플리케이션에서 Qwen Code 기능을 사용할 수 있게 하는 SDK.
- **`sdk-java`**: 자바 환경을 위한 SDK.
- **`vscode-ide-companion`**: VS Code 확장 프로그램과의 통신 및 연동을 위한 컴패니언 레이어.
- **`test-utils`**: 테스트를 위한 공통 유틸리티.

---

## 5. Core 패키지 상세 분석 (`packages/core`)

`core` 패키지는 Qwen Code의 두뇌 역할을 하며, 다음과 같은 주요 컴포넌트로 구성됩니다.

### 5.1 주요 컴포넌트 및 역할

#### 1. GeminiClient (`src/core/client.ts`)

에이전트의 전체 생명주기를 관리하는 메인 컨트롤러입니다.

- **세션 관리**: 대화 기록(History)의 유지, 압축(Compression), 복원 수행.
- **컨텍스트 주입**: 현재 작업 디렉토리 정보 및 IDE(VS Code 등)의 편집 상태(활성 파일, 커서 위치 등)를 모델에 전달.
- **루프 탐지**: 에이전트가 무한 루프에 빠지는 것을 방지하는 `LoopDetectionService` 연동.
- **인증 및 폴백**: API 키 또는 OAuth 인증 상태를 관리하고, 필요 시 대체 모델로의 폴백(`handleFallback`) 수행.

#### 2. Turn (`src/core/turn.ts`)

사용자의 한 번의 입력에 대해 모델이 응답하고 도구를 실행하는 단일 "턴(Turn)" 단위를 관리합니다.

- **응답 파싱**: 모델의 출력에서 텍스트 응답, 생각(Thought), 도구 실행 요청(Tool Call)을 분리.
- **이벤트 스트리밍**: `GeminiEventType`을 통해 상위 레이어(CLI, IDE)에 실시간 상태(콘텐츠 생성 중, 도구 실행 중 등)를 전달.
- **도구 실행 제어**: 도구 실행 전 사용자 승인(Confirmation)이 필요한지 확인하고 실행 결과(Tool Result)를 다시 모델에 전달.

#### 3. Tools 및 CoreToolScheduler (`src/tools/`, `src/core/coreToolScheduler.ts`)

에이전트가 실제로 시스템과 상호작용할 수 있게 해주는 기능들입니다.

- **내장 도구**: 파일 읽기/쓰기, grep 검색, 셸 명령어 실행, 스마트 편집(Smart-edit) 등.
- **MCP(Model Context Protocol) 지원**: 외부 MCP 서버와의 연동을 통해 도구 세트를 동적으로 확장.
- **스케줄러**: 여러 도구 호출이 발생했을 때 순차적으로 실행하고 결과를 취합.

#### 4. Models 및 ContentGenerator (`src/models/`, `src/core/contentGenerator.ts`)

다양한 LLM 프로바이더와의 통신 레이어입니다.

- **다중 모델 지원**: Qwen, Gemini, OpenAI, Anthropic 등 다양한 모델 규격 지원.
- **토큰 관리**: 현재 세션의 토큰 사용량을 계산하고 제한을 관리.

### 5.2 에이전트 동작 흐름 (Sequence Diagram)

```mermaid
sequenceDiagram
    participant U as User / IDE
    participant C as GeminiClient
    participant T as Turn
    participant L as LLM (Qwen/Gemini)
    participant TL as Tools/Skills

    U->>C: 메시지 전송 (Prompt)
    C->>C: IDE 컨텍스트 및 시스템 프롬프트 준비
    C->>T: 신규 Turn 생성 및 시작
    T->>L: 프롬프트 + 히스토리 전달
    loop 응답 생성 & 도구 실행
        L-->>T: 생각(Thought) / 도구 호출(Tool Call) 응답
        T-->>U: 실시간 상태 업데이트 전송
        T->>TL: 도구 실행 (확인 필요시 사용자 승인 대기)
        TL-->>T: 실행 결과 (Tool Result)
        T->>L: 결과와 함께 다시 호출
    end
    L-->>T: 최종 텍스트 응답
    T-->>U: 완료 응답 전송
    C->>C: 대화 히스토리 저장 및 필요시 압축
```

---

## 6. 빌드 및 개발 프로세스

- **빌드**: `npm run build` 스크립트를 통해 전체 또는 특정 패키지 빌드.
- **테스트**: `npm test`를 통해 각 패키지의 단위 테스트 수행 및 `test:integration`으로 통합 테스트 수행.
- **번들링**: `esbuild`를 사용하여 CLI 배포를 위한 단일 파일 번들링 수행.

---

## 7. 최근 구현 사항: Meta-Gateway MCP (`meta-gateway-mcp`)

Oracle, PostgreSQL, Elasticsearch, 그리고 정적 벡터 DB를 통합 검색하는 MCP 서버 구축과 모든 검증 및 Git 배포를 완료했습니다.

### 7.1 주요 성과

- **4-Pillar 통합 MCP 서버 구축**: 사내 메타데이터 검색에 최적화된 MCP 서버 (`meta-gateway-mcp`) 구현.
- **다양한 소스 연동 및 검증**:
  - **Oracle**: `gvenzl/oracle-free` Docker 컨테이너를 통한 연동 및 테이블 검색 성공.
  - **PostgreSQL**: `postgres:latest` Docker 컨테이너를 통한 연동 및 스키마 상세 검색 성공.
  - **Elasticsearch**: 내부 API 검색, 직접 쿼리 검색, 서치 템플릿(Search Template) 연동 기능 구현.
- **Git 협업 및 배포**: [reahyunkeem/qwen-code](https://github.com/reahyunkeem/qwen-code)의 `main` 브랜치에 배포 완료.

### 7.2 주요 구성

- `src/index.ts`: MCP 서버 코어 (도구 정의 및 어댑터 오케스트레이션).
- `src/adapters/`: 각 데이터베이스 및 API 커넥터 모음.

### 7.3 향후 확장 계획

- **Pillar 4 (Static Vector) 고도화**: 대규모 데이터 대응을 위해 SQLite FTS5 또는 Vector Engine 도입 예정.
- **Qwen Code 연동**: `settings.json` 등록을 통해 지능형 코드 검색 활성화 가능.

### 7.4 서버 구조 및 작동 원리 (Orchestration)

`meta-gateway-mcp`는 메인 서버가 각각의 데이터베이스 어댑터를 호출하는 **어댑터 패턴(Adapter Pattern)**으로 설계되었습니다.

```mermaid
graph TD
    A[Qwen Code / IDE] -- MCP Tool Call: search_meta --> B(src/index.ts)
    B -- Config Load --> C[.env]
    B -- Parallel Call: search --> D[OracleAdapter]
    B -- Parallel Call: search --> E[PostgresAdapter]
    B -- Parallel Call: search --> F[ElasticsearchAdapter]
    B -- Parallel Call: search --> G[StaticVectorAdapter]
    D & E & F & G -- Return Results --> B
    B -- Formatted Output --> A
```

- **`index.ts` (컨트롤러)**: MCP 서버의 진입점으로, 모든 어댑터의 생명주기를 관리하고 도구 호출을 각 어댑터에 전달(Dispatch)합니다.
- **`src/adapters/` (어댑터 레이어)**: 각 DB/API에 특화된 검색 로직을 격리하여 구현한 클래스들입니다.

### 7.5 `search_meta` 도구 상세 분석

`search_meta`는 4개의 핵심 데이터 소스(Pillars)에서 메타데이터를 통합 검색하는 핵심 도구입니다.

#### 1. 주요 파라미터

- `query` (String, 필수): 검색할 용어 (용어명, 물리명, 설명 등).
- `source` (Enum, 선택): 검색 대상을 특정 (기본값: `all`).
  - `oracle`, `postgres`, `elasticsearch`, `vector` 중 선택 가능.

#### 2. 소스별 검색 로직

| 소스              | 검색 대상 및 방식                                                                                             | 주요 특징                                              |
| :---------------- | :------------------------------------------------------------------------------------------------------------ | :----------------------------------------------------- |
| **Oracle**        | `USER_TABLES`의 `TABLE_NAME` 검색                                                                             | `LIKE` 연산 및 대문자 변환(`toUpperCase`) 처리.        |
| **PostgreSQL**    | `information_schema.tables` 검색                                                                              | `ILIKE` 연산자를 사용한 대소문자 구분 없는 검색.       |
| **Elasticsearch** | **3가지 모드 병행**:<br>1. 인덱스명 (`_cat/indices`) <br>2. 문서 본문 (`multi_match`) <br>3. 전용 검색 템플릿 | `name`, `title`, `description` 등 멀티 필드 검색 지원. |
| **Static Vector** | `meta_data.json` 로컬 파일 검색                                                                               | 키워드 매칭 기반의 1차 필터링 수행.                    |

#### 3. 결과 포맷

검색 결과는 아래 JSON 포맷으로 에이전트에게 전달됩니다(소스별 상태 포함):

```json
{
  "query": "고객 등급",
  "source": "all",
  "total": 2,
  "results": [
    {
      "source": "oracle",
      "logicalName": "TB_CUSTOMER_GRADE",
      "physicalName": "TB_CUSTOMER_GRADE",
      "type": "TABLE",
      "description": null,
      "location": null
    }
  ],
  "sources": [
    { "name": "oracle", "ok": true, "count": 1 },
    { "name": "postgres", "ok": false, "error": "connection refused" },
    { "name": "elasticsearch", "ok": true, "count": 1 },
    { "name": "vector", "ok": true, "count": 0 }
  ]
}
```

### 7.6 도구 선택 및 실행 원리 (Reasoning)

Qwen LLM이 `search_meta` 도구를 사용할지 결정하는 과정은 **도구 설명(Description) 기반의 추론**에 의합니다.

1.  **도구 명세 전달**: MCP 서버가 시작되면 Qwen Code 에이전트에게 `search_meta` 도구의 이름, 설명, 파라미터 스키마를 전달합니다.
    - _이름_: `search_meta`
    - _설명_: "Search corporate metadata across Oracle, PostgreSQL, Elasticsearch, and Static Vector DB."
2.  **의도 분석**: 사용자가 "고객 등급 테이블 정보 찾아줘"라고 입력하면, LLM은 이 요청이 로컬 파일 읽기나 셸 실행보다 `search_meta` 도구의 설명과 가장 잘 일치한다고 판단합니다.
3.  **파라미터 추출**: LLM은 대화 맥락에서 검색어("고객 등급")를 추출하여 도구의 `query` 파라미터로 할당합니다.
4.  **도구 호출 (Tool Call)**: LLM은 직접 도구를 실행하는 대신, 에이전트에게 "다음 파라미터로 `search_meta`를 실행해줘"라는 특수한 응답을 보냅니다.
5.  **피드백 루프**: 에이전트가 MCP 서버를 통해 얻은 검색 결과(Oracle, ES 등의 데이터)를 다시 LLM에게 전달하면, LLM은 이 데이터를 해석하여 사용자에게 최종 답변을 제공합니다.

### 7.7 Qwen Code 연동 설정 (`settings.json`)

에이전트에서 `search_meta` 도구를 사용하기 위해 `~/.qwen/settings.json` 또는 `.qwen/settings.json` 파일에 아래 설정을 추가합니다.

```json
{
  "mcpServers": {
    "meta-gateway": {
      "command": "node",
      "args": ["c:/workspace/qwen-code/meta-gateway-mcp/dist/index.js"],
      "env": {
        "ORACLE_USER": "system",
        "ORACLE_PASSWORD": "password123",
        "ORACLE_CONNECTION_STRING": "localhost:1521/FREEPDB1",
        "PG_CONNECTION_STRING": "postgresql://postgres:password123@localhost:5432/meta_db",
        "ES_NODE": "http://localhost:9200",
        "VECTOR_DB_PATH": "c:/workspace/qwen-code/meta-gateway-mcp/meta_data.json"
      }
    }
  }
}
```

> [!TIP]
> **MCP 서버 작동 및 관리 팁**
>
> - **자동 실행**: Qwen Code 실행 시 `settings.json` 설정을 읽어 MCP 서버를 자식 프로세스로 자동 구동하므로, 별도로 서버를 띄워둘 필요가 없습니다.
> - **빌드 필수**: MCP 서버 소스 코드를 수정한 후에는 반드시 `npm run build`를 실행하여 `dist/index.js`를 갱신해야 에이전트에 변경 사항이 반영됩니다.

---

_최종 업데이트: 2026-01-20_
_작성자: Antigravity AI Agent_
