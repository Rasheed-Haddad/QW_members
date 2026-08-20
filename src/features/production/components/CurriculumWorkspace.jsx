import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Columns2,
  Eye,
  FileText,
  ImageIcon,
  Pencil,
  Search,
  Trash2,
  X,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import {
  listImages,
  removeImage,
  renderMarkdown,
  stats,
} from "../lib/miniMarkdown";
import PdfPane from "./PdfPane";

// مقاييس النصّ موحّدة بين المحرِّر وطبقة الإبراز خلفه: أي اختلافٍ في الخطّ
// أو الحشو أو ارتفاع السطر يُزيح اللون عن الكلمة. تُكتب مرّةً وتُستعمل مرّتين.
const EDITOR_TEXT = "p-4 text-[17px] leading-9 font-arabic";

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
  // ── البحث: مواضع الكلمة بإزاحتها في النصّ ──
  // رقم السطر لا يفيد شيئاً — لا يُقفَز إليه ولا يُرى في محرِّرٍ بلا ترقيم.
  // المطلوب الوصول إلى الكلمة نفسها، فنخزّن إزاحة كل مطابقة ثم نحدّدها في
  // المحرِّر ونمرّر إليها كما يفعل بحث المتصفّح.
  const hits = useMemo(() => {
    const needle = q.trim();
    if (!needle) return [];
    const hay = String(text || "");
    // تطبيعٌ يتجاهل التشكيل وصور الألف والياء والتاء المربوطة: البحث عن
    // «إجراء» يجب أن يجد «اجراء»، وإلا صار البحث امتحاناً في الإملاء.
    const normCh = (x) =>
      x
        .replace(/[\u064B-\u0652\u0640]/g, "")
        .replace(/[أإآٱ]/g, "ا")
        .replace(/ى/g, "ي")
        .replace(/ة/g, "ه")
        .toLowerCase();
    // التطبيع لا يجوز أن يزيح المواضع، فنطبّع حرفاً حرفاً ونحفظ خريطةً
    // من موضع النصّ المطبَّع إلى موضعه الأصلي.
    let flat = "";
    const map = [];
    for (let i = 0; i < hay.length; i++) {
      const c = normCh(hay[i]);
      if (!c) continue; // حركةٌ حُذفت — لا موضع لها
      for (let k = 0; k < c.length; k++) map.push(i);
      flat += c;
    }
    const nq = normCh(needle);
    if (!nq) return [];
    const out = [];
    let from = 0;
    while (out.length < 500) {
      const at = flat.indexOf(nq, from);
      if (at === -1) break;
      const start = map[at];
      const end = (map[at + nq.length - 1] ?? start) + 1;
      out.push({ start, end });
      from = at + nq.length;
    }
    return out;
  }, [text, q]);

  // المطابقة الحالية — يُتنقَّل بينها بالسهمين أو بـEnter
  const [hitIdx, setHitIdx] = useState(0);
  // أوّل Enter يقف على المطابقة الأولى لا الثانية؛ وما بعده ينتقل.
  const jumpedRef = useRef(false);
  useEffect(() => {
    setHitIdx(0);
    jumpedRef.current = false;
  }, [q]);
  const editorRef = useRef(null);
  const backdropRef = useRef(null);
  // مراجع العلامات: يكتبها ردّ الـref بفهرسها ولا تُصفَّر يدوياً.
  // تصفيرها في جسم المكوّن يفرغها عند إعادة الرسم لتغيّر hitIdx وحده —
  // فReact لا يعيد استدعاء ردّ الـref حين يتغيّر الصنف فقط. وما زاد عن
  // عدد المطابقات يصير null عند فكّ العنصر، وgotoHit يتحقّق منه.
  const markRefs = useRef([]);

  // ── طبقة الإبراز ──
  // textarea لا يلوّن جزءاً من نصّه، وتحديده الأصلي بلون النظام لا يظهر إلا
  // وهو مركَّز — فيبقى المستخدم يقرأ كل المعروض بحثاً عن كلمته.
  // الحلّ المعتاد: طبقةٌ خلفية تحمل النصّ نفسه بمقاييسه نفسها، فيها <mark>
  // على كل مطابقة، وفوقها textarea شفّاف الخلفية. الطبقتان تُمرَّران معاً.
  const segments = useMemo(() => {
    const hay = String(text || "");
    if (!hits.length) return [{ t: hay, hit: -1 }];
    const out = [];
    let at = 0;
    hits.forEach((h, n) => {
      if (h.start > at) out.push({ t: hay.slice(at, h.start), hit: -1 });
      out.push({ t: hay.slice(h.start, h.end), hit: n });
      at = h.end;
    });
    if (at < hay.length) out.push({ t: hay.slice(at), hit: -1 });
    return out;
  }, [text, hits]);


  // تمرير الطبقة مع المحرِّر — بدونه ينفصل اللون عن الكلمة
  const syncScroll = useCallback(() => {
    const el = editorRef.current;
    const bd = backdropRef.current;
    if (!el || !bd) return;
    bd.scrollTop = el.scrollTop;
    bd.scrollLeft = el.scrollLeft;
  }, []);

  /** ينتقل إلى المطابقة رقم i ويُبرزها.
   *  الموضع يُؤخذ من العنصر المرسوم نفسه (offsetTop) لا من حساب الأسطر:
   *  الـtextarea يلفّ السطر الطويل إلى عدّة أسطر بصرية، فحسابُ «عدد أسطر
   *  \n × ارتفاع السطر» يقع بعيداً عن الكلمة — وهو سبب القفزات الخاطئة. */
  const gotoHit = useCallback(
    (i) => {
      if (!hits.length) return;
      const n = ((i % hits.length) + hits.length) % hits.length;
      setHitIdx(n);
      // التحرير يجب أن يكون ظاهراً ليُرى الإبراز
      setMode((m) => (m === "preview" ? "split" : m));
      // إطاران: الأوّل ليُرسم التبويب إن تغيّر، والثاني لتستقرّ مواضع العناصر
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const el = editorRef.current;
          const mark = markRefs.current[n];
          if (!el || !mark) return;
          const top = mark.offsetTop - el.clientHeight / 2 + mark.offsetHeight / 2;
          el.scrollTop = Math.max(0, top);
          syncScroll();
          // التحديد أيضاً: يجعل الكتابة تستبدل الكلمة مباشرةً
          const h = hits[n];
          el.setSelectionRange(h.start, h.end);
        });
      });
    },
    [hits, syncScroll],
  );

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
            showOriginal
              ? "bg-gray-800 text-white"
              : "bg-gray-100 text-gray-700"
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
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              // Enter ينتقل للتالي، وShift+Enter للسابق — كبحث المتصفّح
              if (!hits.length) return;
              if (!jumpedRef.current) {
                jumpedRef.current = true;
                gotoHit(0);
                return;
              }
              gotoHit(e.shiftKey ? hitIdx - 1 : hitIdx + 1);
            }}
            dir="rtl"
            placeholder="ابحث وانتقل إلى الكلمة…"
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

        {/* التنقّل بين المطابقات — هذا ما يفيد، لا رقم السطر */}
        {q.trim() && (
          <div className="flex items-center gap-1">
            <span
              className={`text-xs font-bold tabular-nums px-1.5 ${
                hits.length ? "text-gray-600" : "text-red-500"
              }`}
            >
              {hits.length ? `${hitIdx + 1}/${hits.length}` : "لا نتيجة"}
            </span>
            <button
              onClick={() => {
                jumpedRef.current = true;
                gotoHit(hitIdx - 1);
              }}
              disabled={!hits.length}
              title="السابق (Shift+Enter)"
              className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:text-brand disabled:opacity-30"
            >
              <ChevronUp size={14} />
            </button>
            <button
              onClick={() => {
                if (!jumpedRef.current) {
                  jumpedRef.current = true;
                  gotoHit(0);
                  return;
                }
                gotoHit(hitIdx + 1);
              }}
              disabled={!hits.length}
              title="التالي (Enter)"
              className="p-1.5 rounded-lg border border-gray-200 text-gray-500 hover:text-brand disabled:opacity-30"
            >
              <ChevronDown size={14} />
            </button>
          </div>
        )}
      </div>

      {/* إحصاء مختصر — يكشف نقصاً قبل أن يُكتشف في التطبيق */}
      <div className="px-3 py-1.5 border-b border-gray-100 text-[11px] text-gray-400">
        {st.words.toLocaleString("ar-EG")} كلمة · {st.images} صورة · {st.pages}{" "}
        صفحة · {st.lines} سطر
        {q.trim() ? ` · ${hits.length} موضعاً لـ«${q.trim()}»` : ""}
      </div>

      <div className="flex overflow-hidden" style={{ height }}>
        {showOriginal && (
          <div className="w-1/2 border-l border-gray-100">
            <PdfPane bytes={pdfBytes} />
          </div>
        )}

        {(mode === "edit" || mode === "split") && (
          <div
            className={`relative ${
              mode === "split" ? "flex-1 border-l border-gray-100" : "flex-1"
            }`}
          >
            {/* الطبقة الخلفية: النصّ نفسه بمقاييس المحرِّر حرفياً، فيها
                <mark> على كل مطابقة. أي فرقٍ في الخطّ أو الحشو أو ارتفاع
                السطر يُزيح اللون عن الكلمة، فالأصناف موحّدة بين الاثنين. */}
            <div
              ref={backdropRef}
              aria-hidden="true"
              dir="rtl"
              className={`absolute inset-0 overflow-hidden pointer-events-none whitespace-pre-wrap break-words ${EDITOR_TEXT} text-transparent`}
              // شريط التمرير يقتطع من عرض المحتوى في الـtextarea؛ فإن لم
              // تحجز الطبقة العرض نفسه اختلف موضع لفّ الأسطر بينهما
              // وانزاح اللون عن الكلمة. الحجز الثابت يوحّد العرضين.
              style={{ scrollbarGutter: "stable" }}
            >
              {segments.map((sg, k) =>
                sg.hit === -1 ? (
                  <span key={k}>{sg.t}</span>
                ) : (
                  <mark
                    key={k}
                    ref={(el) => {
                      markRefs.current[sg.hit] = el;
                    }}
                    className={`rounded text-transparent ${
                      sg.hit === hitIdx
                        // الحالية بلونٍ صارخ، والبقيّة بلونٍ هادئ: الفرق بينهما
                        // هو ما يجعل «التالي» مفهوماً بلا قراءة
                        ? "bg-orange-400/70 ring-2 ring-orange-500"
                        : "bg-amber-200/60"
                    }`}
                  >
                    {sg.t}
                  </mark>
                ),
              )}
            </div>

            <textarea
              ref={editorRef}
              value={text}
              onChange={(e) => onChange(e.target.value)}
              onScroll={syncScroll}
              dir="rtl"
              spellCheck={false}
              placeholder="نص المحاضرة بصيغة ماركداون — أو امسحه ضوئياً أو فرّغه صوتياً"
              className={`relative w-full h-full bg-transparent ${EDITOR_TEXT} outline-none resize-none`}
              style={{ scrollbarGutter: "stable" }}
            />
          </div>
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
            {imgs.length === 0 && (
              <p className="text-xs text-gray-400">لا صور</p>
            )}
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
