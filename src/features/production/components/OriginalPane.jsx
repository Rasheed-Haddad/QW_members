import { useMemo, useState } from "react";
import { Search, X, FileSearch } from "lucide-react";

// ─── لوح الأصل ────────────────────────────────────────────────────────────────
// النصّ الخام كما خرج من المسح، قبل التنظيف والتدقيق.
//
// لماذا يستحق لوحاً؟ لأن الحكم على تصحيحٍ مشتبه به يحتاج رؤية الكلمة في
// سياقها الأصلي. بدونه يفتح المستخدم المقرَّر الورقي — وهو ما نبني هذا
// المنتج لإغنائه عنه.
//
// البحث هنا ضروري لا ترف: نصّ محاضرة يبلغ عشرات الآلاف من الحروف، والعثور
// على كلمةٍ فيه بالعين وحدها ليس مقارنةً بل معاناة.

const norm = (s) =>
  String(s || "")
    .replace(/[ً-ْٰـ]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .toLowerCase();

export default function OriginalPane({ text, highlight, title = "الأصل الخام" }) {
  const [q, setQ] = useState("");
  const term = q.trim() || highlight || "";

  // نبرز كل مواضع الكلمة المطلوبة
  const parts = useMemo(() => {
    const src = String(text || "");
    if (!term) return [{ t: src, hit: false }];
    const n = norm(src);
    const w = norm(term);
    if (!w) return [{ t: src, hit: false }];
    const out = [];
    let i = 0;
    for (;;) {
      const at = n.indexOf(w, i);
      if (at === -1) {
        out.push({ t: src.slice(i), hit: false });
        break;
      }
      if (at > i) out.push({ t: src.slice(i, at), hit: false });
      out.push({ t: src.slice(at, at + term.length), hit: true });
      i = at + term.length;
    }
    return out;
  }, [text, term]);

  const hits = parts.filter((p) => p.hit).length;

  if (!text) {
    return (
      <div className="h-full flex items-center justify-center p-6 text-center">
        <div>
          <FileSearch size={22} className="text-gray-300 mx-auto mb-2" />
          <p className="text-xs text-gray-400">
            لا نسخة أصلية محفوظة لهذه المحاضرة
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="p-2.5 border-b border-gray-100 bg-gray-50">
        <div className="flex items-center gap-2 mb-2">
          <FileSearch size={14} className="text-gray-500" />
          <span className="text-xs font-bold text-gray-700">{title}</span>
          {term && (
            <span className="text-[11px] text-gray-500 mr-auto">
              {hits} تطابق
            </span>
          )}
        </div>
        <div className="relative">
          <Search
            size={13}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
          />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            dir="rtl"
            placeholder={highlight ? `«${highlight}»` : "ابحث في الأصل…"}
            className="w-full pr-8 pl-7 py-1.5 rounded-lg border border-gray-200 text-xs font-arabic outline-none focus:border-brand bg-white"
          />
          {q && (
            <button
              onClick={() => setQ("")}
              className="absolute left-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded text-gray-400 hover:bg-gray-100"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      <div
        dir="rtl"
        className="flex-1 overflow-y-auto p-3 text-[15px] leading-8 font-arabic text-gray-700 whitespace-pre-wrap"
      >
        {parts.map((p, i) =>
          p.hit ? (
            <mark key={i} className="bg-amber-200 rounded px-0.5">
              {p.t}
            </mark>
          ) : (
            <span key={i}>{p.t}</span>
          ),
        )}
      </div>
    </div>
  );
}
