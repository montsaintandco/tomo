"use client";
import { useEffect } from "react";
import { addRecentViewed, type RecentItem } from "@/lib/home/recent-viewed";

// 상세 화면에 한 줄 넣으면 「최근 본 상품」에 기록된다. 아무것도 그리지 않는다.
// 예: <TrackView item={{ href: `/global/${source}/${id}`, title, thumb, price, currency }} />
export default function TrackView({ item }: { item: RecentItem }) {
  const { href, title, thumb, price, currency } = item;
  useEffect(() => { addRecentViewed({ href, title, thumb, price, currency }); }, [href, title, thumb, price, currency]);
  return null;
}
