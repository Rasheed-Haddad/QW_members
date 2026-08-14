import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Scissors, Link2, Bookmark } from "lucide-react";
import { renderPageToCanvas } from "../lib/pdfEngine";
import { colorFor, sorted } from "../lib/ranges";

// ─── شبكة صفحات المقرر ────────────────────────────────────────────────────────
// مقرَّر من 400 صفحة يعني 400 لوحة رسم. رسمها كلها دفعةً واحدة — كما تفعل
// الأداة المرجعية — يعني عشرات الثواني من التجمّد ومئات الميغابايت.
//
// لذلك: هيكل الصفحات كلّه في DOM فوراً (رخيص، ويُبقي شريط التمرير صادقاً)،
// والرسم كسولٌ عبر IntersectionObserver، بطابور محدود التزامن، ويُلغى ما خرج
// من الشاشة قبل دوره. الذاكرة محدودة بسقف: ما تجاوزه من اللوحات البعيدة يُفرَّغ.

// عمودان بصفحاتٍ كبيرة: التقسيم يقوم على قراءة العنوان العريض، وذاك لا
// يُقرأ في مصغّرةٍ بعرض 132 بكسل. الثمن ذاكرة: الصفحة الواحدة هنا تسع
// أضعاف السابقة، فخفّضنا السقف والتزامن بالمقابل.
const CONCURRENCY_HINT = 2;
const CANVAS_BUDGET = 44; // ‎44 × ~0.9م.ب ≈ 40م.ب
const THUMB_W = 460; // دقّة الرسم — والعرض الفعلي من العمود

export default function PageGrid({
  pdf,
  pageCount,
  aspect = 1.414,
  ranges,
  boundaries = [],
  onSplit,
  onMerge,
  focusPage,
}) {
  const [rendered, setRendered] = useState(() => new Set());
  const canvasRefs = useRef(new Map());
  const queue = useRef([]);
  const active = useRef(0);
  const visible = useRef(new Set());
  const order = useRef([]); // ترتيب الرسم للتفريغ (الأقدم أولاً)
  const rootRef = useRef(null);

  const list = useMemo(() => sorted(ranges), [ranges]);

  // خريطة صفحة → معلومات نطاقها (اللون، أهي بداية، اسمها)
  const pageInfo = useMemo(() => {
    const m = new Map();
    list.forEach((r, i) => {
      for (let p = Math.max(1, r.start); p <= Math.min(pageCount, r.end); p++) {
        if (!m.has(p)) {
          m.set(p, {
            color: colorFor(i),
            isStart: p === r.start,
            isEnd: p === r.end,
            name: r.name,
            idx: i,
          });
        }
      }
    });
    return m;
  }, [list, pageCount]);

  const boundaryStarts = useMemo(
    () => new Set(boundaries.map((b) => b.start)),
    [boundaries],
  );

  // ─── طابور الرسم ────────────────────────────────────────────────────────────
  const pump = useCallback(() => {
    while (active.current < CONCURRENCY_HINT && queue.current.length) {
      // الأحدث دخولاً أولاً: ما يراه المستخدم الآن أهمّ ممّا مرّ عليه
      const page = queue.current.pop();
      if (!visible.current.has(page)) continue; // خرج قبل دوره
      const canvas = canvasRefs.current.get(page);
      if (!canvas) continue;
      active.current += 1;
      renderPageToCanvas(pdf, page, canvas, THUMB_W)
        .then(() => {
          order.current.push(page);
          setRendered((prev) => {
            if (prev.has(page)) return prev;
            const next = new Set(prev);
            next.add(page);
            return next;
          });
          // سقف الذاكرة: نفرّغ الأقدم الخارج عن الشاشة
          while (order.current.length > CANVAS_BUDGET) {
            const old = order.current.shift();
            if (visible.current.has(old)) {
              order.current.push(old); // ما زال مرئياً — لا يُفرَّغ
              break;
            }
            const c = canvasRefs.current.get(old);
            if (c) {
              c.width = 0;
              c.height = 0;
            }
            setRendered((prev) => {
              const next = new Set(prev);
              next.delete(old);
              return next;
            });
          }
        })
        .catch(() => {
          // إلغاء الرسم أو صفحة تالفة: لا نُفشل الشبكة كلّها من أجل صفحة —
          // تبقى بمكانها الرمادي ويكمل الباقي.
        })
        .finally(() => {
          active.current -= 1;
          pump();
        });
    }
  }, [pdf]);

  useEffect(() => {
    if (!pdf || !rootRef.current) return undefined;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          const page = Number(e.target.dataset.page);
          if (e.isIntersecting) {
            visible.current.add(page);
            if (!rendered.has(page) && !queue.current.includes(page)) {
              queue.current.push(page);
            }
          } else {
            visible.current.delete(page);
          }
        });
        pump();
      },
      // هامش سخيّ: نبدأ الرسم قبل الوصول فلا يرى المستخدم فراغاً
      { root: rootRef.current, rootMargin: "600px 0px" },
    );
    rootRef.current
      .querySelectorAll("[data-page]")
      .forEach((el) => io.observe(el));
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdf, pageCount, pump]);

  // التمرير إلى صفحة عند الطلب (من قائمة النطاقات أو من تحذير ثغرة)
  useEffect(() => {
    if (!focusPage || !rootRef.current) return;
    const el = rootRef.current.querySelector(`[data-page="${focusPage}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusPage]);


  return (
    <div
      ref={rootRef}
      className="overflow-y-auto rounded-xl border border-gray-200 bg-gray-50 p-3"
      style={{ maxHeight: "min(68vh, 760px)" }}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {Array.from({ length: pageCount }, (_, i) => i + 1).map((page) => {
          const info = pageInfo.get(page);
          const covered = Boolean(info);
          const isStart = info?.isStart;
          const canSplit = covered && !isStart;
          const canMerge = isStart && page > 1;
          const boundary = boundaryStarts.has(page);

          return (
            <div key={page} className="relative">
              {/* علامة حدّ الملف الأصلي — معلومةٌ يملكها المستخدم ولا نملكها */}
              {boundary && page > 1 && (
                <span
                  title="بداية ملف أصلي"
                  className="absolute -right-1.5 top-0 bottom-0 w-0.5 bg-gray-400 rounded"
                />
              )}

              <button
                data-page={page}
                onClick={() => {
                  if (canSplit) onSplit?.(page);
                  else if (canMerge) onMerge?.(page);
                }}
                title={
                  canSplit
                    ? `اجعل الصفحة ${page} بداية محاضرة جديدة`
                    : canMerge
                      ? `ادمج هذه المحاضرة بالسابقة`
                      : covered
                        ? "بداية المستند"
                        : "صفحة غير مغطاة"
                }
                className={`group relative block w-full rounded-lg overflow-hidden border-2 transition-all ${
                  covered
                    ? "bg-white hover:brightness-95"
                    : "bg-red-50 border-dashed"
                }`}
                style={{
                  // النسبة محفوظة قبل الرسم فلا تقفز الشبكة عند وصول الصفحة
                  aspectRatio: `1 / ${aspect}`,
                  borderColor: covered ? info.color : "#fca5a5",
                }}
              >
                <canvas
                  ref={(el) => {
                    if (el) canvasRefs.current.set(page, el);
                    else canvasRefs.current.delete(page);
                  }}
                  className="block w-full"
                />
                {!rendered.has(page) && (
                  <span className="absolute inset-0 flex items-center justify-center bg-gray-100">
                    <span className="w-5 h-5 rounded-full border-2 border-gray-300 border-t-transparent animate-spin" />
                  </span>
                )}

                {/* شريط علوي بلون النطاق — التغطية تُقرأ بلمحة */}
                {covered && (
                  <span
                    className="absolute top-0 inset-x-0 h-1.5"
                    style={{ backgroundColor: info.color }}
                  />
                )}

                {/* الإجراء يظهر عند المرور فلا يزدحم العرض */}
                {(canSplit || canMerge) && (
                  <span className="absolute inset-0 items-center justify-center bg-black/45 hidden group-hover:flex">
                    <span className="flex items-center gap-1 px-2 py-1 rounded-md bg-white text-[11px] font-bold text-gray-800">
                      {canSplit ? (
                        <>
                          <Scissors size={15} /> قسّم هنا
                        </>
                      ) : (
                        <>
                          <Link2 size={15} /> ادمج بالسابقة
                        </>
                      )}
                    </span>
                  </span>
                )}
              </button>

              {/* رقم الصفحة + اسم المحاضرة عند بدايتها */}
              <div className="mt-1 text-center">
                <span
                  className={`inline-block px-2 py-0.5 rounded text-sm font-bold ${
                    covered ? "text-gray-600" : "bg-red-100 text-red-700"
                  }`}
                >
                  {page}
                </span>
                {isStart && (
                  <span
                    className="block text-xs font-bold truncate leading-tight mt-1"
                    style={{ color: info.color }}
                    title={info.name || "بلا اسم"}
                  >
                    <Bookmark size={11} className="inline -mt-0.5 ml-0.5" />
                    {info.name || "بلا اسم"}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
