import { useMemo } from "react";
import { colorFor, sorted, gaps } from "../lib/ranges";

// ─── شريط التغطية ─────────────────────────────────────────────────────────────
// مقرَّر من 400 صفحة لا يُرى كلّه دفعةً في الشبكة. هذا الشريط يمثّل المستند
// كلّه في سطر واحد: كل نطاق قطعةٌ بلونه، والثغرات حمراء مخطَّطة.
// الغرض واحد: أن تُدرَك الثغرة قبل أن تصير محاضرةً ضائعة.

export default function CoverageBar({ ranges, pageCount, onJump }) {
  const segments = useMemo(() => {
    if (!pageCount) return [];
    const list = sorted(ranges);
    const out = [];
    list.forEach((r, i) => {
      const s = Math.max(1, r.start);
      const e = Math.min(pageCount, r.end);
      if (e < s) return;
      out.push({
        kind: "range",
        left: ((s - 1) / pageCount) * 100,
        width: ((e - s + 1) / pageCount) * 100,
        color: colorFor(i),
        label: `${r.name || `نطاق ${i + 1}`} · ${s}–${e}`,
        page: s,
      });
    });
    gaps(list, pageCount).forEach((g) => {
      out.push({
        kind: "gap",
        left: ((g.start - 1) / pageCount) * 100,
        width: ((g.end - g.start + 1) / pageCount) * 100,
        label: `غير مغطّاة · ${g.start}–${g.end}`,
        page: g.start,
      });
    });
    return out;
  }, [ranges, pageCount]);

  if (!pageCount) return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs text-gray-400">خريطة المقرر</span>
        <span className="text-xs text-gray-400">{pageCount} صفحة</span>
      </div>
      <div className="relative h-7 rounded-lg bg-gray-100 overflow-hidden border border-gray-200">
        {segments.map((s, i) => (
          <button
            key={i}
            onClick={() => onJump?.(s.page)}
            title={s.label}
            className="absolute top-0 bottom-0 transition-opacity hover:opacity-75"
            style={{
              right: `${s.left}%`, // RTL: المستند يبدأ من اليمين
              width: `${s.width}%`,
              backgroundColor: s.kind === "range" ? s.color : "transparent",
              backgroundImage:
                s.kind === "gap"
                  ? "repeating-linear-gradient(45deg,#fecaca,#fecaca 4px,#fee2e2 4px,#fee2e2 8px)"
                  : undefined,
              borderInlineEnd: "1px solid rgba(255,255,255,.65)",
            }}
          />
        ))}
      </div>
    </div>
  );
}
