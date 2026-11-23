// DB 가 일시정지이거나 새 마이그레이션이 아직 적용되지 않았을 때 화면이 죽지 않게 하는 도우미.
type Res<T> = { data: T[] | null; error: { code?: string; message?: string } | null };

/** 조회 결과에서 행만 꺼낸다. 오류면 빈 배열. */
export function rows<T>(res: Res<T>): T[] {
  return res.error ? [] : (res.data ?? []);
}

/** 테이블·함수가 아직 없는 오류인지(마이그레이션 미적용). */
export function tableMissing(error: { code?: string } | null | undefined): boolean {
  return !!error && ["42P01", "42883", "PGRST205", "PGRST202"].includes(error.code ?? "");
}
