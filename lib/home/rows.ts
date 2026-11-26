// 홈 인기 줄 — 한 요청 안에서 여러 Suspense 블록(첫 줄·나머지 줄·원형 사진·빈 국내 대체)이 같은 조립 결과를 쓴다.
// 홈 키워드는 고정(코드 테이블 TRENDING). 어드민 큐레이션은 인기 검색어 줄과 /global·카테고리 페이지에서 쓴다.
import { cache } from "react";
import { getFixedSections } from "@/lib/market/trending";
import { assembleRows } from "./assemble";

export const getHomeRows = cache(async (country: "KR" | "JP") => assembleRows(await getFixedSections(country)));
