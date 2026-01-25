export interface MetaResult {
  source: string;
  logicalName: string; // 한글명 (e.g., 회원ID)
  physicalName: string; // 영문명 (e.g., USER_ID)
  type: string; // 테이블, 컬럼, 인덱스 등
  description?: string;
  location?: string; // DB명, 스키마명, 파일경로 등
  score?: number; // 정적 벡터 검색 등의 경우 유사도 점수
}

export interface ConnectionStatus {
  ok: boolean;
  error?: string;
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'Unknown error';
}

export interface MetaAdapter {
  name: string;
  search(query: string): Promise<MetaResult[]>;
  testConnection(): Promise<ConnectionStatus>;
}
