import { useEffect, useMemo, useRef, useState } from "react";
import {
  Columns2,
  Eye,
  FileText,
  ImageIcon,
  Pencil,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { listImages, removeImage, renderMarkdown, stats } from "../lib/miniMarkdown";
import PdfPane from "./PdfPane";

// ─── ورشة نصّ المقرَّر ────────────────────────────────────────────────────────
// **مكوّنٌ واحد يستعمله خط الإنتاج وتعديل المادة معاً.**
//
// كانت الورشة الغنيّة (معاينة/تحرير/مقارنة/صور/تصفية) حبيسة خطوة المراجعة
// في خط الإنتاج، وتعديل المادة لا يملك إلا مربّع نصّ. فاضطُرّ المحرِّر إلى
// إعادة إنتاج مادةٍ كاملة لمجرّد أن يراجع نصّها — وهو ما كلّفه المادة خمس
// مرات.
//
// التوحيد هنا بنيويّ لا نسخيّ: أي ميزة تُضاف تظهر في المكانين معاً، فلا
// يعود أحدهما يتخلّف عن الآخر.

const MODES = [
  ["preview", "معاينة", Eye],
  ["split", "الاثنان", Columns2],
  ["edit", "تحرير", Pencil],
];

export default function CurriculumWorkspace({
  text = "",
  onChange,
  /** بايتات الملفّ الأصلي (PDF) إن وُجدت — تُعرض للمقارنة */
  pdfBytes,
  /** أدوات الذكاء الاصطناعي فوق الورشة (مسح/تفريغ/تدقيق) */
  toolbar,
  height = "62vh",
}) {
  const [mode, setMode] = useState("split");
  const [showOriginal, setShowOriginal] = useState(false);
  const [showImages, setShowImages] = useState(false);
  const [q, setQ] = useState("");
  const previewRef = useRef(null);

  const imgs = useMemo(() => listImages(text), [text]);
  const html = useMemo(() => renderMarkdown(text), [text]);
  const st = stats(text);

  // ── التصفية: مواضع الكلمة في النصّ ──
  // نصّ محاضرةٍ يبلغ عشرات الآلاف من الحروف، والعثور على كلمةٍ فيه بالعين
  // وحدها ليس مراجعةً بل معاناة.
  const hits = useMemo(() => {
    const needle = q.trim();
    if (!needle) return [];
    const out = [];
    const lines = String(text || "").split("\n");
    lines.forEach((line, i) => {
      if (line.includes(needle)) out.push({ line: i + 1, text: line.trim() });
    });
    return out.slice(0, 60);
  }, [text, q]);

  // حذف صورة بالنقر عليها في المعاينة
  useEffect(() => {
    const el = previewRef.current;
    if (!el) return undefined;
    const onClick = (e) => {
      const url = e.target?.dataset?.img;
      if (!url) return;
      if (!window.confirm("أتحذف هذه الصورة من النصّ؟")) return;
      onChange(removeImage(text, url).text);
    };
    el.addEventListener("click", onClick);
    return () => el.removeEventListener("click", onClick);
  }, [text, onChange, html]);

  return (
    <div className="flex flex-col rounded-2xl border border-gray-200 overflow-hidden bg-white">
      {/* شريط الأدوات */}
      <div className="flex items-center gap-2 p-2.5 border-b border-gray-100 flex-wrap bg-gray-50">
        {toolbar}

        <div className="flex items-center bg-gray-200/70 rounded-xl p-1 gap-1">
          {MODES.map(([k, label, Icon]) => (
            <button
              key={k}
              onClick={() => setMode(k)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold ${
                mode === k ? "bg-white text-brand shadow-sm" : "text-gray-500"
              }`}
            >
              <Icon size={13} /> {label}
            </button>
          ))}
        </div>

        <button
          onClick={() => setShowOriginal((v) => !v)}
          disabled={!pdfBytes?.length}
          title={
            pdfBytes?.length
              ? "اعرض ملفّ المقرَّر الأصلي بجانب النصّ"
              : "لا ملفّ أصليّ لهذه المحاضرة في هذه الجلسة"
          }
          className={`text-xs font-medium rounded-lg px-3 py-2 flex items-center gap-1.5 disabled:opacity-40 ${
            showOriginal ? "bg-gray-800 text-white" : "bg-gray-100 text-gray-700"
          }`}
        >
          <FileText size={13} /> المقرَّر الأصلي
        </button>

        <button
          onClick={() => setShowImages((v) => !v)}
          className={`text-xs font-medium rounded-lg px-3 py-2 flex items-center gap-1.5 ${
            showImages ? "bg-brand text-white" : "bg-brand/10 text-brand"
          }`}
        >
          <ImageIcon size={13} /> الصور ({imgs.length})
        </button>

        <div className="relative mr-auto">
          <Search
            size={14}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
          />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            dir="rtl"
            placeholder="صفِّ النصّ بكلمة…"
            className="w-56 pr-8 pl-7 py-2 rounded-xl border border-gray-200 text-xs font-arabic outline-none focus:border-brand"
          />
          {q && (
            <button
              onClick={() => setQ("")}
              className="absolute left-1.5 top-1/2 -translate-y-1/2 p-1 rounded text-gray-400 hover:bg-gray-100"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* إحصاء مختصر — يكشف نقصاً قبل أن يُكتشف في التطبيق */}
      <div className="px-3 py-1.5 border-b border-gray-100 text-[11px] text-gray-400">
        {st.words.toLocaleString("ar-EG")} كلمة · {st.images} صورة · {st.pages}{" "}
        صفحة · {st.lines} سطر
        {q.trim() ? ` · ${hits.length} موضعاً لـ«${q.trim()}»` : ""}
      </div>

      {q.trim() ? (
        <div className="max-h-40 overflow-y-auto border-b border-gray-100 bg-amber-50/40">
          {hits.length === 0 ? (
            <p className="text-xs text-gray-400 p-3 m-0">لا نتيجة</p>
          ) : (
            hits.map((h) => (
              <div
                key={h.line}
                className="px-3 py-1.5 text-xs text-gray-700 border-b border-amber-100/60 last:border-0"
              >
                <span className="text-gray-400 ml-2">سطر {h.line}</span>
                {h.text.slice(0, 160)}
              </div>
            ))
          )}
        </div>
      ) : null}

      <div className="flex overflow-hidden" style={{ height }}>
        {showOriginal && (
          <div className="w-1/2 border-l border-gray-100">
            <PdfPane bytes={pdfBytes} />
          </div>
        )}

        {(mode === "edit" || mode === "split") && (
          <textarea
            value={text}
            onChange={(e) => onChange(e.target.value)}
            dir="rtl"
            spellCheck={false}
            placeholder="نص المحاضرة بصيغة ماركداون — أو امسحه ضوئياً أو فرّغه صوتياً"
            className={`${
              mode === "split" ? "flex-1 border-l border-gray-100" : "flex-1"
            } p-4 text-[17px] leading-9 font-arabic outline-none resize-none`}
          />
        )}

        {(mode === "preview" || mode === "split") && (
          <div
            ref={previewRef}
            className="flex-1 overflow-y-auto p-5 mdbody mdbody-lg"
            // النصّ مُهرَّب ومُدقَّق في miniMarkdown: لا وسوم إلا المعروفة،
            // ولا سمات إلا المسموحة، ولا روابط إلا http(s) وdata:image.
            dangerouslySetInnerHTML={{ __html: html }}
          />
        )}

        {showImages && (
          <div className="w-64 border-r border-gray-100 overflow-y-auto p-3 bg-gray-50">
            <p className="text-xs font-bold text-gray-600 mb-2">صور المحاضرة</p>
            {imgs.length === 0 && <p className="text-xs text-gray-400">لا صور</p>}
            <div className="flex flex-col gap-2">
              {imgs.map((im, i) => (
                <div
                  key={`${im.url}_${i}`}
                  className="relative group rounded-lg overflow-hidden border border-gray-200 bg-white"
                >
                  <img
                    src={im.url}
                    alt={`شكل ${i + 1}`}
                    loading="lazy"
                    className="w-full h-24 object-contain"
                  />
                  <button
                    onClick={() => onChange(removeImage(text, im.url).text)}
                    title="احذفها من النصّ"
                    className="absolute top-1 left-1 p-1 rounded-md bg-white/90 text-red-600 opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="px-3 py-2 border-t border-gray-100 text-[11px] text-gray-400">
        انقر أي صورة في المعاينة لحذفها
      </div>
    </div>
  );
}
