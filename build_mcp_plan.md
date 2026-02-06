# MCP 모노레포 설계 계획 (qwen-code)

## 1) 목표

- 루트에 `/mcp` 영역을 만들고 MCP들을 독립 실행 가능한 서비스로 구성한다.
- 공통 로직은 `/mcp/shared`로 통합해 재사용성과 일관성을 확보한다.
- qwen-code CLI에서 MCP를 호출해 오라클 튜닝 리포트를 출력한다(권고만, 자동 적용 없음).

## 2) 목표 구조

```
/mcp
  /shared
  /meta-gateway
  /oracle-tuner
  /<future-mcp-1>
```

## 3) 역할 분리

- **mcp/shared**
  - 공통 스키마/타입(Tool I/O 정의)
  - 공통 에러 타입 및 결과 포맷
  - 마스킹 유틸(SQL/PII)
  - 로깅/추적 유틸
- **mcp/meta-gateway**
  - Oracle 12c 메타 수집 전용
  - SQL ID/SQL 텍스트 조회
  - 실행계획/통계 수집
- **mcp/oracle-tuner**
  - 규칙 기반 진단
  - 튜닝 권고 생성
  - 리스크/영향도 평가

## 4) MCP Tool API (MVP)

- **meta-gateway**
  - `oracle.fetch_sql_by_id(sqlId)`
  - `oracle.get_plan(sqlId | sqlText)`
  - `oracle.get_sql_stats(sqlId)`
- **oracle-tuner**
  - `oracle.tune_from_metadata(metadataJson)`

## 5) qwen-code CLI 연동

- `/oracle tune` 슬래시 명령 추가
- 처리 흐름:
  1. `meta-gateway`에서 SQL/플랜/통계 수집
  2. 결과를 `oracle-tuner`에 전달
  3. 리포트 형태로 출력

## 6) 리포트 출력 포맷

- Summary: 병목 유형, 예상 개선 방향
- Findings: 규칙 기반 진단 + 근거
- Recommendations: 재작성/인덱스/통계 권고
- Risks: 플랜 안정성/쓰기 비용/부작용
- Evidence: plan hash, buffer gets, reads 등

## 7) 빌드/실행 방식

- 각 MCP는 독립 프로세스로 실행
- 개발: `tsx src/index.ts`
- 배포: `node dist/index.js`
- qwen-code 설정의 `mcpServers`에 개별 등록

예시 설정(.qwen/settings.json):

```
{
  "mcpServers": {
    "oracle-meta-gateway": {
      "command": "node",
      "args": ["mcp/meta-gateway/dist/index.js"]
    },
    "oracle-tuner": {
      "command": "node",
      "args": ["mcp/oracle-tuner/dist/index.js"]
    }
  }
}
```

## 8) 보안/컴플라이언스

- 오라클 계정은 **읽기 전용**
- SQL/테이블/컬럼/리터럴 마스킹 옵션 제공
- 자동 적용 기능 없음(권고만)
- 로그 기본값은 **SQL 전문 저장 안함**

Oracle 접속 환경 변수(초기 계획):

- `ORACLE_USER`
- `ORACLE_PASSWORD`
- `ORACLE_DSN`
- `ORACLE_PRIVILEGE` (선택: SYSDBA/SYSOPER)

## 9) 현재 진행 현황

- `/mcp` 워크스페이스 구조 적용 완료
- `mcp/shared` 타입/결과 포맷 유틸 추가 완료
- `meta-gateway` MCP 서버(Oracle 연결) 구현 완료
- `oracle-tuner` 규칙 기반 권고 v1 구현 완료
- `/oracle tune` CLI 명령 연결 완료
- Docker Oracle XE 테스트 인스턴스 구성 완료
- Docker XE 기동 및 리스너 서비스 확인 완료
- 샘플 데이터 생성 및 SQL ID 조회 완료

## 10) 테스트 인스턴스 (Docker)

이 계획과 테스트는 Oracle 12c 기준으로 진행한다.

현재 `mcp/meta-gateway/docker-compose.yml`은 편의를 위해 21c XE 이미지(`gvenzl/oracle-xe:21-slim`)를 사용한다.
Oracle 12c 검증은 사내 레지스트리/실환경에서 별도로 수행한다.
다른 12c 이미지를 쓰려면 `ORACLE_IMAGE` 환경 변수로 덮어쓴다.
이미지 제공/배포는 라이선스 정책에 맞는 사내 레지스트리 사용을 권장한다.

권장 사항(12c 기준):

- 이미지: 사내 레지스트리 또는 Oracle 제공 12c 기반 이미지 사용
- 포트: 1521(리스너), 5500(EM Express)
- 계정/비밀번호: 최소 권한 계정 + SYS 계정 분리
- 서비스명/DSN: 이미지 기본값에 맞춰 설정

예시(12c 이미지로 교체 시 가이드):

```
services:
  oracle-xe:
    image: oracle/database:12.2.0.1-ee
    container_name: oracle-xe
    ports:
      - '1521:1521'
      - '5500:5500'
    volumes:
      - ./scripts:/scripts:ro
    environment:
      ORACLE_PASSWORD: 'Oracle123'
      APP_USER: 'app'
      APP_USER_PASSWORD: 'App123'
```

12c DSN 예시(이미지 기본값에 따라 다를 수 있음):

- CDB/PDB 구성: `localhost:1521/ORCLPDB1`

```
cd mcp/meta-gateway
docker compose up -d
```

사내 레지스트리 이미지 사용 예시:

```
cd mcp/meta-gateway
ORACLE_IMAGE=<your-registry>/oracle/database:12.2.0.1-ee docker compose up -d
```

기본 접속(XE 기본값 기준, 이미지에 따라 다를 수 있음):

- `ORACLE_USER=app`
- `ORACLE_PASSWORD=App123`
- `ORACLE_DSN=localhost:1521/XEPDB1`

SYSDBA 테스트:

- `ORACLE_USER=sys`
- `ORACLE_PASSWORD=Oracle123`
- `ORACLE_DSN=localhost:1521/XE`
- `ORACLE_PRIVILEGE=SYSDBA`

서비스명 확인 방법(이미지에 따라 변경될 수 있음):

```
docker exec -it oracle-xe bash -lc "lsnrctl status"
```

XE 21c 이미지 기준 확인된 서비스명:

- CDB: `XE`
- PDB: `XEPDB1`
- 기타: `FREE`, `FREEPDB1`

`ORACLE_PRIVILEGE` 사용 시 Instant Client(Thick mode) 필요(Oracle 12c 기준)

샘플 데이터/SQL ID:

```
docker exec -i oracle-xe bash -lc "sqlplus -s app/App123@XEPDB1 @/scripts/setup_sample.sql"
docker exec -i oracle-xe bash -lc "sqlplus -s sys/Oracle123@XE as sysdba @/scripts/get_sql_id.sql"
```

최근 실행으로 확인된 SQL ID(샘플 쿼리):

- SQL_ID: `0d4g628z5x605`
- SQL_TEXT: `select count(*) from t_sample where category = 'A'`
- CON_ID: `3` (PDB: XEPDB1)

## 11) 향후 할 일

1. Oracle 12c Instant Client 설치 후 SYSDBA 모드로 meta-gateway 실측 테스트
2. `/oracle tune` end-to-end 실행 검증 및 리포트 포맷 보완
3. 튜닝 규칙 확장(인덱스/조인 방식/통계/카디널리티 추정 개선)
4. 설정 템플릿(.qwen/settings.json) 예시 정리 및 배포 문서화
5. 운영 환경용 권한 최소화 가이드 추가
