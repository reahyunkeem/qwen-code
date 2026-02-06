# MCP Meta Gateway (Oracle 12c)

Oracle 메타데이터 수집 MCP 서버입니다. SQL ID 또는 SQL 텍스트를 기반으로 실행 통계와 플랜 정보를 수집합니다.

## 빠른 시작

### 1) 테스트용 Oracle XE 실행 (Docker)

`docker-compose.yml`은 기본값으로 `gvenzl/oracle-xe:21-slim` 이미지를 사용한다.
Oracle 12c 검증은 사내 레지스트리/실환경에서 별도로 수행한다.
다른 이미지를 쓰려면 `ORACLE_IMAGE` 환경 변수로 덮어쓴다.

```
docker compose up -d
```

사내 레지스트리 이미지 사용 예시:

```
ORACLE_IMAGE=<your-registry>/oracle/database:12.2.0.1-ee docker compose up -d
```

기본 접속 정보(XE 기본값 기준, 이미지에 따라 다를 수 있음):

- 사용자: `app`
- 비밀번호: `App123`
- DSN: `localhost:1521/XEPDB1`

V$ 뷰 권한 테스트가 필요하면 SYS 계정으로 접속하세요:

- 사용자: `sys`
- 비밀번호: `Oracle123`
- DSN: `localhost:1521/XE`
- 접속 옵션: `ORACLE_PRIVILEGE=SYSDBA`

서비스명 확인 방법(이미지에 따라 변경될 수 있음):

```
docker exec -it oracle-xe bash -lc "lsnrctl status"
```

XE 21c 이미지 기준 확인된 서비스명:

- CDB: `XE`
- PDB: `XEPDB1`
- 기타: `FREE`, `FREEPDB1`

### 2) 환경 변수 설정

```
ORACLE_USER=app
ORACLE_PASSWORD=App123
ORACLE_DSN=localhost:1521/XEPDB1
```

Instant Client를 별도 설치한 경우:

```
ORACLE_LIB_DIR=/path/to/instantclient
```

`ORACLE_PRIVILEGE`(SYSDBA/SYSOPER)를 사용할 경우 Instant Client(Thick mode)가 필요합니다.

### 3) 실행

```
npm run dev --workspace=@qwen-code/mcp-meta-gateway
```

## MCP 도구

- `oracle.fetch_sql_by_id`
- `oracle.get_plan`
- `oracle.get_sql_stats`

## 주의 사항

- 실제 운영 연결은 읽기 전용 계정을 사용하세요.
- V$ 뷰 접근이 필요하면 `select_catalog_role` 또는 개별 `v_$*` 권한을 부여해야 합니다.
- Oracle XE 환경에서는 PDB 사용자에게 V$ 뷰 권한이 제한될 수 있으니, 테스트는 SYSDBA로 진행하는 것이 안전합니다.
- AWR/ASH 사용 권한이 없을 경우 일부 플랜/통계 수집이 제한될 수 있습니다.

## 샘플 데이터 생성

```
docker exec -i oracle-xe bash -lc "sqlplus -s app/App123@XEPDB1 @/scripts/setup_sample.sql"
```

SQL ID 조회(루트 컨테이너, SYSDBA):

```
docker exec -i oracle-xe bash -lc "sqlplus -s sys/Oracle123@XE as sysdba @/scripts/get_sql_id.sql"
```
