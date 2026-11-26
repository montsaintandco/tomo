"use client";

// 그리드 선택 공용 훅 (G1)
//
// 왜 훅으로 뺐나: 같은 결함이 그리드마다 반복해서 들어왔다.
//   · 일괄 액션이 `rows`(전체) 기준이라 필터로 감춘 행까지 취소·환불·상태전환됐다
//   · 조회 조건이 바뀌어도 선택이 남아 "3건 선택"인데 실제 대상은 50건이었다
//   · 전체선택이 다른 페이지 선택을 말없이 버렸다
// F3에서 세 화면을 고쳤는데, 그 뒤 새로 만든 ShipGrid가 같은 형태로 다시 들어왔다.
// 화면마다 고치는 한 계속 재발하므로 선택 규칙 자체를 여기 한 곳에 둔다.

import { useCallback, useMemo, useState } from "react";

export interface GridSelection<T> {
  /** 선택된 id 집합 (표시용 — 개수 배지 등) */
  checked: Set<string>;
  /** 일괄 액션 대상. **항상 현재 조회 결과 안에서만** 나온다 */
  checkedRows: T[];
  /** 행 하나 토글 */
  toggle: (id: string, on: boolean) => void;
  /** 현재 페이지 전체선택 — 다른 페이지 선택은 건드리지 않는다 */
  togglePage: (pageRows: T[], on: boolean) => void;
  /** 이 페이지가 전부 선택됐는지 */
  isPageAllChecked: (pageRows: T[]) => boolean;
  /** 일부만 선택됐는지 — 체크박스 indeterminate 표시용 */
  isPageIndeterminate: (pageRows: T[]) => boolean;
  clear: () => void;
  /** 성공한 건만 선택에서 빼기 — 부분 실패 후 재시도가 안전해진다 */
  remove: (ids: string[]) => void;
}

/**
 * @param filtered 조회 조건이 적용된 전체 결과 (페이지 슬라이스 이전)
 * @param idOf     행 → 고유 id
 */
export function useGridSelection<T>(filtered: T[], idOf: (row: T) => string): GridSelection<T> {
  const [checked, setChecked] = useState<Set<string>>(new Set());

  // 조회 조건이 바뀌어 화면에서 사라진 선택은 버린다.
  // (선택 개수와 실제 실행 대상이 어긋나는 순간이 사고의 시작이다)
  const visibleIds = useMemo(() => new Set(filtered.map(idOf)), [filtered, idOf]);
  // (렌더 중 이전 값 비교 패턴 — effect 안 setState 는 렌더를 한 번 더 돌려서 쓰지 않는다)
  const [prevVisible, setPrevVisible] = useState(visibleIds);
  if (prevVisible !== visibleIds) {
    setPrevVisible(visibleIds);
    setChecked((prev) => {
      if (prev.size === 0) return prev;
      const next = new Set(Array.from(prev).filter((id) => visibleIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }

  const checkedRows = useMemo(() => filtered.filter((r) => checked.has(idOf(r))), [filtered, checked, idOf]);

  const toggle = useCallback((id: string, on: boolean) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const togglePage = useCallback(
    (pageRows: T[], on: boolean) => {
      setChecked((prev) => {
        const next = new Set(prev);
        for (const r of pageRows) {
          if (on) next.add(idOf(r));
          else next.delete(idOf(r));
        }
        return next;
      });
    },
    [idOf]
  );

  const isPageAllChecked = useCallback(
    (pageRows: T[]) => pageRows.length > 0 && pageRows.every((r) => checked.has(idOf(r))),
    [checked, idOf]
  );
  const isPageIndeterminate = useCallback(
    (pageRows: T[]) => {
      const n = pageRows.filter((r) => checked.has(idOf(r))).length;
      return n > 0 && n < pageRows.length;
    },
    [checked, idOf]
  );

  const clear = useCallback(() => setChecked(new Set()), []);
  const remove = useCallback((ids: string[]) => {
    setChecked((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.delete(id);
      return next;
    });
  }, []);

  return { checked, checkedRows, toggle, togglePage, isPageAllChecked, isPageIndeterminate, clear, remove };
}
