import { useEffect, useMemo, useState } from "react";
import { BookMarked, X, Plus, Trash2, Check, ArrowLeft } from "lucide-react";
import { ToolBtn } from "./ToolBtn";

// ─── ذاكرة التدقيق ────────────────────────────────────────────────────────────
// كلماتٌ يخطئ فيها المسح الضوئي دائماً بالشكل نفسه — يكتبها المحرِّر مرةً
// «قبل ← بعد» ويطبّقها على أي مقرَّر بنقرة، بلا نموذجٍ ولا انتظار ولا كلفة.
// شبه ثابتة، فمكانها localStorage على هذا الجهاز.
//
// المطابقة حرفية على أي موضع في النص (لا «كلمة كاملة»): العربية تلصق
// أدواتها بالكلمة («والتمدن»، «بالتمدن»)، والتصحيح يجب أن يصيبها كلها.
// العدد يظهر بجانب كل مدخل قبل التطبيق — هو الحارس من مدخلٍ قصيرٍ يصيب
// أكثر مما قُصد.

const STORE = "spell_memory_v1";

const load = () => {
  try {
    const v = JSON.parse(localStorage.getItem(STORE) || "[]");
    return Array.isArray(v) ? v.filter((e) => e && e.before) : [];
  } catch {
    return [];
  }
};

const countIn = (text, needle) => {
  if (!needle) return 0;
  let n = 0;
  let at = text.indexOf(needle);
  while (at !== -1) {
    n += 1;
    at = text.indexOf(needle, at + needle.length);
  }
  return n;
};

export default function SpellMemoryAction({ text = "", onText }) {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState(load);
  const [before, setBefore] = useState("");
  const [after, setAfter] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    try {
      localStorage.setItem(STORE, JSON.stringify(entries));
    } catch {
      /* التخزين غير متاح — تبقى القائمة لهذه الجلسة */
    }
  }, [entries]);

  const counts = useMemo(
    () => Object.fromEntries(entries.map((e) => [e.id, countIn(text, e.before)])),
    [entries, text],
  );
  const totalHits = entries.reduce((a, e) => a + (counts[e.id] || 0), 0);

  const add = () => {
    const b = before.trim();
    if (!b || b === after.trim()) return;
    setEntries((es) => {
      // نفس «القبل» مرتين يُحدَّث بدل أن يتكرّر
      const rest = es.filter((e) => e.before !== b);
      return [{ id: Date.now().toString(36), before: b, after: after.trim() }, ...rest];
    });
    setBefore("");
    setAfter("");
  };

  const applyOne = (e) => {
    const n = countIn(text, e.before);
    if (!n) return;
    onText(text.split(e.before).join(e.after));
    setNote(`صُحِّح ${n} موضعاً: «${e.before}» ← «${e.after}»`);
  };

  // بالتتابع على النصّ الناتج: كل مدخلٍ يرى ما صحّحه ما قبله
  const applyAll = () => {
    let t = text;
    let n = 0;
    for (const e of entries) {
      const c = countIn(t, e.before);
      if (!c) continue;
      n += c;
      t = t.split(e.before).join(e.after);
    }
    if (!n) return;
    onText(t);
    setNote(`صُحِّح ${n} موضعاً دفعةً واحدة`);
  };

  return (
    <>
      <ToolBtn
        icon={BookMarked}
        color="#d97706"
        onClick={() => {
          setNote("");
          setOpen(true);
        }}
      >
        ذاكرة التدقيق
      </ToolBtn>

      {open && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            dir="rtl"
            className="bg-white rounded-2xl w-full max-w-xl max-h-[85vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 p-4 border-b border-gray-100">
              <BookMarked size={18} className="text-amber-600" />
              <div className="flex-1">
                <h3 className="text-base font-bold text-gray-800">ذاكرة التدقيق</h3>
                <p className="text-xs text-gray-400">
                  أخطاء المسح المتكرّرة · محفوظة على هذا الجهاز · الرقم = مواضعها في النص الحالي
                </p>
              </div>
              <button onClick={() => setOpen(false)} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100">
                <X size={18} />
              </button>
            </div>

            {/* إضافة */}
            <div className="p-3 border-b border-gray-100 flex items-center gap-2">
              <input
                value={before}
                onChange={(e) => setBefore(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && add()}
                placeholder="قبل (الخطأ)"
                className="flex-1 min-w-0 border border-gray-300 rounded-lg p-2 text-sm font-arabic"
              />
              <ArrowLeft size={16} className="text-gray-400 shrink-0" />
              <input
                value={after}
                onChange={(e) => setAfter(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && add()}
                placeholder="بعد (الصواب)"
                className="flex-1 min-w-0 border border-gray-300 rounded-lg p-2 text-sm font-arabic"
              />
              <button
                onClick={add}
                disabled={!before.trim() || before.trim() === after.trim()}
                className="shrink-0 bg-amber-500 text-white rounded-lg p-2 disabled:opacity-40"
                title="إضافة"
              >
                <Plus size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
              {entries.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-10">
                  لا كلمات بعد — أضف أول خطأ يتكرّر في المسح
                </p>
              )}
              {entries.map((e) => {
                const n = counts[e.id] || 0;
                return (
                  <div key={e.id} className="flex items-center gap-2 px-3 py-2">
                    <span className="flex-1 min-w-0 text-sm font-arabic truncate text-red-600 line-through decoration-red-300">
                      {e.before}
                    </span>
                    <ArrowLeft size={14} className="text-gray-300 shrink-0" />
                    <span className="flex-1 min-w-0 text-sm font-arabic truncate text-green-700">
                      {e.after || <span className="text-gray-400 italic">(حذف)</span>}
                    </span>
                    <span
                      className={`text-[11px] font-bold tabular-nums w-8 text-center shrink-0 ${
                        n ? "text-amber-700" : "text-gray-300"
                      }`}
                      title="مواضعها في النص الحالي"
                    >
                      {n}
                    </span>
                    <button
                      onClick={() => applyOne(e)}
                      disabled={!n}
                      className="shrink-0 text-xs font-semibold rounded-lg px-2.5 py-1.5 border border-green-200 text-green-700 bg-green-50 disabled:opacity-30"
                    >
                      تطبيق
                    </button>
                    <button
                      onClick={() => setEntries((es) => es.filter((x) => x.id !== e.id))}
                      className="shrink-0 p-1.5 rounded-md text-red-500 hover:bg-red-50"
                      title="حذف من الذاكرة"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="p-3 border-t border-gray-100 flex items-center gap-3">
              <p className="text-xs flex-1 text-green-700">{note}</p>
              <button
                onClick={applyAll}
                disabled={!totalHits}
                className="bg-amber-500 text-white text-sm font-bold rounded-xl px-5 py-2.5 disabled:opacity-40 flex items-center gap-2"
              >
                <Check size={16} /> تطبيق الكل ({totalHits})
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
