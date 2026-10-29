import { useEffect, useRef, useState } from "react";
import {
  FileText,
  Loader2,
  ZoomIn,
  ZoomOut,
  MonitorPlay,
  Layers,
  Upload,
} from "lucide-react";
import { openForView, renderPageToCanvas } from "../lib/pdfEngine";

// ─── لوح المقرَّر الأصلي ──────────────────────────────────────────────────────
// **ملف الـPDF نفسه** لا ماركداونه الخام.
//
// كان اللوح يعرض النصّ قبل التنظيف، وهو ناتج المسح الضوئي أيضاً — فمقارنته
// بالنصّ بعد التدقيق تقارن قراءةً بقراءة. الحكم على «هل قرأ المسح هذه الكلمة
// صحيحاً؟» لا يُحسم إلا بالعودة إلى الورق نفسه: الصفحة كما كتبها الدكتور،
// بجداولها وأشكالها ورموزها.
//
// الرسم كسولٌ صفحةً صفحة: مقرَّر ٤٠٠ صفحة يُرسَم كلّه دفعةً واحدة يستهلك
// مئات الميغابايتات من الذاكرة ويجمّد التبويب.

const GAP = 12;

// ─── هل يعرض هذا المتصفّح PDF داخل إطار؟ ─────────────────────────────────────
// متصفّحات الموبايل (Chrome على أندرويد، Safari على iOS) **لا تعرض PDF
// داخلياً**: تُظهر بدلاً منه صفحةً سوداء فيها معرّف الـblob وزرّ «فتح» لا
// يفعل شيئاً — لأن الـblob لا يُسلَّم إلى تطبيقٍ خارجي.
//
// فنكشف القدرة ونسقط إلى رسم pdf.js على canvas، وهو يعمل في كل مكان لأنه
// يرسم بكسلات لا يستدعي عارضاً.
export const canInlinePdf = (() => {
  try {
    if (typeof navigator === "undefined") return false;
    // معياريّ وحديث: يقولها المتصفّح صراحةً
    if (navigator.pdfViewerEnabled === false) return false;
    // احتياطٌ لما قبله: لا متصفّح موبايل يعرض PDF داخلياً
    if (/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || "")) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
})();

/**
 * `forceNative` — عارض المتصفّح دائماً بلا زرّ تحويل. تستعمله نافذةُ مراجعة
 *   التدقيق: المطلوب هناك قراءة الورق للمقارنة، لا التكبير ولا شبكة الصفحات.
 * `onPickFile` — حين لا ملفّ: يعرض زرّ رفعٍ في مكانه ويسلّم البايتات للأب،
 *   فيظهر الملفّ فوراً بلا مغادرة النافذة.
 */
export default function PdfPane({
  bytes,
  title = "المقرَّر الأصلي",
  forceNative = false,
  onPickFile,
}) {
  const [pdf, setPdf] = useState(null);
  const [error, setError] = useState(null);
  const [width, setWidth] = useState(700);
  const [visible, setVisible] = useState(3); // كم صفحة رُسمت حتى الآن
  const scrollRef = useRef(null);

  // ── العارض الأصلي ──
  // رسم pdf.js يعتمد على برنامج الخطّ المُضمَّن في الملف؛ فإن كان الترميز
  // تالفاً أو الخطّ غير مُضمَّن خرجت الحروف مقطوشة، ولا يُصلحه إعداد.
  // عارض المتصفّح (Chrome/Electron) محرِّكٌ آخر أصلب في هذه الحالات، فنتيح
  // التحويل إليه بضغطة بدل أن يبقى المستخدم أمام نصٍّ لا يُقرأ.
  // `forceNative` رغبةٌ لا أمر: إن عجز المتصفّح عن العرض الداخلي فالشبكة
  // أصدق من إطارٍ أسود.
  // العارض هو الافتراضي في كل مكان (المقارنة قراءةٌ للورق قبل كل شيء)،
  // والشبكة بزرٍّ لمن يحتاج التكبير الدقيق
  const [native, setNative] = useState(canInlinePdf);
  const [blobUrl, setBlobUrl] = useState("");

  useEffect(() => {
    if (!bytes?.length) {
      setBlobUrl("");
      return undefined;
    }
    // نسخة مستقلة: pdf.js قد يكون استولى على المخزن الأصلي
    const copy = bytes.slice(0);
    const url = URL.createObjectURL(
      new Blob([copy], { type: "application/pdf" }),
    );
    setBlobUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [bytes]);

  useEffect(() => {
    let dead = false;
    let doc = null;
    setPdf(null);
    setError(null);
    setVisible(3);
    if (!bytes?.length) return undefined;

    openForView(bytes)
      .then((d) => {
        if (dead) {
          d.destroy();
          return;
        }
        doc = d;
        setPdf(d);
      })
      .catch((e) => !dead && setError(e?.message || "تعذّر فتح الملف"));

    return () => {
      dead = true;
      // إغلاق المستند يحرّر عامل pdf.js وذاكرته — تركه مفتوحاً يتراكم
      // مع كل محاضرة تُفتَح ثم تُغلَق.
      if (doc) doc.destroy();
    };
  }, [bytes]);

  // التحميل الكسول: نزيد المرسوم كلّما قارب المستخدم النهاية
  const onScroll = (e) => {
    if (!pdf) return;
    const el = e.currentTarget;
    if (el.scrollTop + el.clientHeight > el.scrollHeight - 400) {
      setVisible((v) => Math.min(pdf.numPages, v + 3));
    }
  };

  if (!bytes?.length) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-center p-6">
        <FileText size={30} className="text-gray-300" />
        <p className="text-sm text-gray-500 m-0">لا ملفّ أصليّ لهذه المحاضرة</p>
        {onPickFile ? (
          <>
            <p className="text-xs text-gray-400 m-0 leading-relaxed max-w-xs">
              ارفع ملفّ المحاضرة لتقارن التصحيحات بالورق نفسه — يُعرض فوراً
              ولا يُرفَع إلى الخادم.
            </p>
            <label className="cursor-pointer text-sm font-bold text-white bg-brand rounded-xl px-5 py-2.5 flex items-center gap-2">
              <Upload size={15} /> اختر ملفّ PDF
              <input
                type="file"
                accept="application/pdf,.pdf"
                className="hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (!f) return;
                  onPickFile(new Uint8Array(await f.arrayBuffer()));
                }}
              />
            </label>
          </>
        ) : (
          <p className="text-xs text-gray-400 m-0 leading-relaxed">
            يظهر هنا حين تمرّ المحاضرة بخطوة التقسيم في هذه الجلسة
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-gray-100">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-200 bg-white shrink-0">
        <FileText size={15} className="text-brand" />
        <span className="text-sm font-bold text-gray-800 flex-1">{title}</span>
        {pdf && (
          <span className="text-[11px] text-gray-400">
            {pdf.numPages} صفحة
          </span>
        )}
        {(!forceNative || !canInlinePdf) && canInlinePdf && (
        <button
          onClick={() => setNative((v) => !v)}
          title={
            native
              ? "عد إلى شبكة الصفحات (تكبير وتحكّم أدقّ)"
              : "افتحه بعارض المتصفّح — أصلب مع الملفات ذات الترميز التالف"
          }
          className={`text-[11px] font-semibold rounded-lg px-2 py-1 flex items-center gap-1 border ${
            native
              ? "bg-brand text-white border-transparent"
              : "bg-brand/10 text-brand border-brand/20"
          }`}
        >
          {native ? <Layers size={12} /> : <MonitorPlay size={12} />}
          {native ? "شبكة" : "عارض"}
        </button>
        )}
        {!canInlinePdf && (
          <span
            className="text-[10px] text-gray-400"
            title="متصفّحات الموبايل لا تعرض PDF داخل الصفحة — تُرسم الصفحات هنا صوراً بدل ذلك"
          >
            رسم الصفحات
          </span>
        )}
        {!native && (
          <>
            <button
              onClick={() => setWidth((w) => Math.max(360, w - 120))}
              className="p-1 rounded text-gray-500 hover:bg-gray-100"
              title="تصغير"
            >
              <ZoomOut size={14} />
            </button>
            <button
              onClick={() => setWidth((w) => Math.min(1600, w + 120))}
              className="p-1 rounded text-gray-500 hover:bg-gray-100"
              title="تكبير"
            >
              <ZoomIn size={14} />
            </button>
          </>
        )}
      </div>

      {native ? (
        blobUrl ? (
          // العارض الأصلي يتولّى تمريره وتكبيره وبحثه بنفسه
          <iframe
            src={blobUrl}
            title={title}
            className="flex-1 w-full border-0 bg-white"
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
            <Loader2 size={15} className="animate-spin ml-2" /> جارٍ التجهيز…
          </div>
        )
      ) : (
      <>

      <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-auto p-3">
        {error && (
          <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
            {error}
          </p>
        )}
        {!pdf && !error && (
          <div className="flex items-center justify-center gap-2 py-10 text-gray-400 text-sm">
            <Loader2 size={15} className="animate-spin" /> جارٍ فتح الملف…
          </div>
        )}
        {pdf && (
          <div className="flex flex-col items-center" style={{ gap: GAP }}>
            {Array.from({ length: Math.min(visible, pdf.numPages) }, (_, i) => (
              <PdfPage key={i} pdf={pdf} num={i + 1} width={width} />
            ))}
            {visible < pdf.numPages && (
              <button
                onClick={() => setVisible((v) => Math.min(pdf.numPages, v + 5))}
                className="text-xs text-brand border border-brand/30 rounded-xl px-4 py-2 my-2"
              >
                اعرض المزيد ({pdf.numPages - visible} صفحة متبقية)
              </button>
            )}
          </div>
        )}
      </div>
      </>
      )}
    </div>
  );
}

function PdfPage({ pdf, num, width }) {
  const ref = useRef(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let dead = false;
    const canvas = ref.current;
    if (!canvas) return undefined;
    setDone(false);
    renderPageToCanvas(pdf, num, canvas, width)
      .then(() => !dead && setDone(true))
      .catch(() => !dead && setDone(true));
    return () => {
      dead = true;
    };
  }, [pdf, num, width]);

  return (
    <div className="relative bg-white shadow-sm" style={{ width }}>
      <canvas ref={ref} className="block" />
      {!done && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/70">
          <Loader2 size={16} className="animate-spin text-gray-400" />
        </div>
      )}
      <span className="absolute bottom-1 left-1 text-[10px] bg-black/50 text-white rounded px-1.5">
        {num}
      </span>
    </div>
  );
}
