import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Upload,
  FileText,
  Scissors,
  Layers,
  ArrowLeft,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Download,
  RotateCcw,
  X,
} from "lucide-react";
import JSZip from "jszip";
import {
  openForView,
  mergeFiles,
  bytesOfFile,
  pageAspect,
  firstMeaningfulLine,
  cutAll,
  formatSize,
} from "../lib/pdfEngine";
import {
  wholeDocument,
  splitAt,
  mergeAt,
  updateRange,
  removeRange,
  validate,
  sorted,
  sanitizeName,
  applyBulkNames,
  newRangeId,
} from "../lib/ranges";
import { compressPdf, LEVELS, fmtMB } from "../lib/pdfCompress";
import { usePipeline } from "../pipelineStore";
import PageGrid from "../components/PageGrid";
import CoverageBar from "../components/CoverageBar";
import RangeList from "../components/RangeList";

// ─── الخطوة ١: تقسيم المقرر ───────────────────────────────────────────────────
// ثلاث حالات: لا ملف بعد ← اختيار طريقة التعامل مع عدة ملفات ← التقسيم.
//
// نموذج التقسيم: المستند يبدأ نطاقاً واحداً يغطّي كل صفحة، والمستخدم يشقّه.
// الأداة المرجعية كانت تبدأ من الفراغ وتطلب أرقاماً بلا رؤية المستند، فتُسقط
// صفحاتٍ صامتةً. هنا التغطية كاملةٌ بالتصميم.

const nameFromFile = (n) =>
  sanitizeName(String(n || "").replace(/\.pdf$/i, ""));

export default function Step1Split() {
  const { state, dispatch, setMerged, getMerged, setLectureBytes } =
    usePipeline();

  const [busy, setBusy] = useState(null); // نصّ ما يجري الآن
  const [pending, setPending] = useState(null); // ملفات تنتظر قرار الطريقة
  // الضغط اختياري ولكل ملف على حدة: مقرَّر مصوَّر يوفّر 70–85%، ونصّي لا يستفيد
  const [level, setLevel] = useState("light");
  const [zipping, setZipping] = useState(null); // {index, done, total}
  const [zipped, setZipped] = useState({}); // index → {before, after, saved}
  const [pdf, setPdf] = useState(null);
  const [aspect, setAspect] = useState(1.414);
  const [focusPage, setFocusPage] = useState(null);
  const [suggesting, setSuggesting] = useState(null);
  const [cutProgress, setCutProgress] = useState(null);
  const [localError, setLocalError] = useState(null);
  const fileInput = useRef(null);

  const { pageCount, ranges, boundaries, sourceFiles, mode } = state;

  const report = useMemo(
    () => validate(ranges, pageCount),
    [ranges, pageCount],
  );

  const problemsById = useMemo(() => {
    const m = new Map();
    report.problems.forEach((p) => {
      if (!p.id) return;
      if (!m.has(p.id)) m.set(p.id, []);
      m.get(p.id).push(p);
    });
    return m;
  }, [report]);

  // ─── الرفع ──────────────────────────────────────────────────────────────────
  const onPick = async (e) => {
    const files = [...(e.target.files || [])];
    e.target.value = ""; // الاستبدال لا الإضافة — عيب الأداة المرجعية رقم 3
    if (!files.length) return;
    setLocalError(null);

    // حتى الملف الواحد يمرّ بشاشة القرار: هناك يُضغط إن شئت قبل أي عمل ثقيل
    setPending(files);
  };

  /** يضغط ملفاً بعينه في مكانه داخل قائمة الانتظار */
  const compressOne = async (idx) => {
    const f = pending[idx];
    if (!f) return;
    setZipping({ index: idx, done: 0, total: 0 });
    setLocalError(null);
    try {
      const raw = await bytesOfFile(f);
      const r = await compressPdf(raw, level, (done, total) =>
        setZipping({ index: idx, done, total }),
      );
      // ملفٌ جديد باسم الأصل: بقيّة الخط لا تعرف أنّ شيئاً تغيّر
      const nf = new File([r.bytes], f.name, { type: "application/pdf" });
      setPending((prev) => prev.map((x, i) => (i === idx ? nf : x)));
      setZipped((prev) => ({ ...prev, [idx]: r }));
    } catch (err) {
      setLocalError(`تعذّر ضغط «${f.name}»: ${err?.message || "خطأ"}`);
    } finally {
      setZipping(null);
    }
  };

  const compressAll = async () => {
    for (let i = 0; i < pending.length; i++) {
      if (zipped[i]) continue;
      // eslint-disable-next-line no-await-in-loop
      await compressOne(i);
    }
  };

  const adoptSingle = async (file) => {
    setBusy("جارٍ قراءة الملف…");
    try {
      const bytes = await bytesOfFile(file);
      const doc = await openForView(bytes);
      setMerged(bytes);
      setPdf(doc);
      setAspect(await pageAspect(doc, 1));
      dispatch({
        type: "source",
        files: [{ name: file.name, size: file.size, pages: doc.numPages }],
        mode: "single",
        pageCount: doc.numPages,
        boundaries: [],
        ranges: wholeDocument(doc.numPages, nameFromFile(file.name)),
      });
    } catch (err) {
      setLocalError(`تعذّر فتح الملف: ${err?.message || "ملف غير صالح"}`);
    } finally {
      setBusy(null);
    }
  };

  /** يدمج الملفات في مستند واحد. الوضعان يتشاركان الدمج ويختلفان فيما بعده:
   *  "keep" يُبقي كل ملف نطاقاً ولا يعرض الشبكة، و"merge" يفتح التقسيم اليدوي.
   *  الدمج ضروري في الحالتين لأن الخطوات التالية تقصّ من مستندٍ واحد. */
  const adoptMerged = async (files, asMode = "merge") => {
    setPending(null);
    setBusy(`جارٍ دمج ${files.length} ملفات…`);
    try {
      const { bytes, boundaries: bnds, pageCount: total } =
        await mergeFiles(files);
      const doc = await openForView(bytes);
      setMerged(bytes);
      setPdf(doc);
      setAspect(await pageAspect(doc, 1));
      dispatch({
        type: "source",
        files: files.map((f, i) => ({
          name: f.name,
          size: f.size,
          pages: bnds[i].end - bnds[i].start + 1,
        })),
        mode: asMode,
        pageCount: total,
        boundaries: bnds,
        // نبدأ بالتقسيم الطبيعي: كل ملف أصلي نطاق. المستخدم يشقّ أو يدمج بعدها.
        ranges: bnds.map((b) => ({
          id: newRangeId(),
          start: b.start,
          end: b.end,
          name: nameFromFile(b.file),
        })),
      });
    } catch (err) {
      setLocalError(`تعذّر الدمج: ${err?.message || "أحد الملفات غير صالح"}`);
    } finally {
      setBusy(null);
    }
  };

  const adoptKeep = (files) => adoptMerged(files, "keep");

  // تنظيف مستند pdf.js عند الاستبدال أو المغادرة — تسريب ذاكرة صامت لولاه
  useEffect(() => () => pdf?.destroy?.(), [pdf]);

  // ─── إجراءات النطاقات ───────────────────────────────────────────────────────
  const setRanges = useCallback(
    (next) => dispatch({ type: "ranges", ranges: next }),
    [dispatch],
  );

  const handleSuggestName = async (r) => {
    if (!pdf) return;
    setSuggesting(r.id);
    try {
      const line = await firstMeaningfulLine(pdf, r.start);
      if (line) setRanges(updateRange(ranges, r.id, "name", line, pageCount));
      else
        setLocalError(
          `لا نصّ في الصفحة ${r.start} — المقرَّر ممسوح ضوئياً على الأرجح، اكتب الاسم يدوياً`,
        );
    } finally {
      setSuggesting(null);
    }
  };

  const suggestAll = async () => {
    if (!pdf) return;
    setBusy("جارٍ استخراج الأسماء…");
    let next = ranges;
    for (const r of sorted(ranges)) {
      if (r.name.trim()) continue;
      // eslint-disable-next-line no-await-in-loop
      const line = await firstMeaningfulLine(pdf, r.start);
      if (line) next = updateRange(next, r.id, "name", line, pageCount);
    }
    setRanges(next);
    setBusy(null);
  };

  // ─── القصّ والمتابعة ────────────────────────────────────────────────────────
  const doCut = async () => {
    const bytes = getMerged();
    if (!bytes || !report.ok) return;
    const list = sorted(ranges).map((r) => ({
      ...r,
      name: sanitizeName(r.name),
    }));
    setBusy("جارٍ قصّ المحاضرات…");
    setCutProgress({ done: 0, total: list.length, name: "" });
    try {
      const cuts = await cutAll(bytes, list, (done, total, name) =>
        setCutProgress({ done, total, name }),
      );
      cuts.forEach((c) => setLectureBytes(c.id, c.bytes));
      dispatch({
        type: "lectures",
        // البايتات في مخزن الـref لا في الحالة — انظر pipelineStore
        lectures: cuts.map((c) => ({
          id: c.id, name: c.name, start: c.start,
          end: c.end, pages: c.pages, size: c.size,
        })),
      });
      dispatch({ type: "step", step: "ocr" });
    } catch (err) {
      setLocalError(`تعذّر القصّ: ${err?.message || "خطأ غير متوقع"}`);
    } finally {
      setBusy(null);
      setCutProgress(null);
    }
  };

  /** تنزيل اختياري — ملفٌ مضغوط واحد لا فيضٌ من التنزيلات.
   *  الأداة المرجعية كانت تُطلق N تنزيلاً متتابعاً فيحجبها المتصفّح. */
  const downloadZip = async () => {
    const bytes = getMerged();
    if (!bytes) return;
    setBusy("جارٍ تجهيز الملف المضغوط…");
    try {
      const list = sorted(ranges).map((r) => ({ ...r, name: sanitizeName(r.name) }));
      const cuts = await cutAll(bytes, list, (done, total, name) =>
        setCutProgress({ done, total, name }),
      );
      const zip = new JSZip();
      cuts.forEach((c, i) => {
        const base = c.name || `محاضرة_${i + 1}`;
        zip.file(`${base}.pdf`, c.bytes);
      });
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "المحاضرات.zip";
      a.click();
      // الإبطال بعد الالتقاط الفعلي لا بعد مهلة ثابتة
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) {
      setLocalError(`تعذّر التنزيل: ${err?.message || "خطأ"}`);
    } finally {
      setBusy(null);
      setCutProgress(null);
    }
  };

  const startOver = () => {
    if (!window.confirm("سيُلغى التقسيم الحالي. أمتأكد؟")) return;
    pdf?.destroy?.();
    setPdf(null);
    setPending(null);
    dispatch({ type: "reset" });
  };

  // ─── العرض ──────────────────────────────────────────────────────────────────

  // (أ) لا ملف بعد
  if (!pageCount && !pending) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-8">
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const files = [...(e.dataTransfer.files || [])].filter((f) =>
              /\.pdf$/i.test(f.name),
            );
            if (files.length === 1) adoptSingle(files[0]);
            else if (files.length > 1) setPending(files);
          }}
          className="rounded-2xl border-2 border-dashed border-gray-300 p-12 text-center hover:border-brand transition-colors"
        >
          <div className="w-14 h-14 rounded-2xl bg-brand/10 flex items-center justify-center mx-auto mb-4">
            <Upload size={26} className="text-brand" />
          </div>
          <h3 className="text-base font-semibold text-gray-800">
            ارفع ملف المقرَّر
          </h3>
          <p className="text-sm text-gray-400 mt-1.5 mb-5">
            ملف واحد أو عدّة ملفات · PDF فقط · يمكنك سحبها إلى هنا
          </p>
          <button
            onClick={() => fileInput.current?.click()}
            disabled={Boolean(busy)}
            className="bg-brand text-white text-sm font-bold rounded-xl px-6 py-2.5 disabled:opacity-40 inline-flex items-center gap-2"
          >
            {busy ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <FileText size={16} />
            )}
            {busy || "اختر الملفات"}
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/pdf,.pdf"
            multiple
            onChange={onPick}
            className="hidden"
          />
        </div>
        {localError && (
          <div className="mt-4 bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl px-4 py-2.5">
            {localError}
          </div>
        )}
      </div>
    );
  }

  // (ب) عدّة ملفات — اختيار الطريقة
  if (pending) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-6">
        <h3 className="text-base font-semibold text-gray-800 mb-1">
          {pending.length === 1
            ? pending[0].name
            : `رفعتَ ${pending.length} ملفات`}
        </h3>
        <p className="text-sm text-gray-400 mb-5">
          اضغط الملفات إن شئت، ثم اختر كيف نتعامل معها.
        </p>

        {/* الضغط — قبل أي عمل ثقيل */}
        <div className="mb-5 p-4 rounded-xl border border-gray-200 bg-gray-50">
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <span className="text-sm font-semibold text-gray-800">
              ضغط الملفات
            </span>
            <select
              value={level}
              onChange={(e) => setLevel(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs bg-white text-gray-800"
            >
              {Object.values(LEVELS).map((l) => (
                <option key={l.key} value={l.key} className="bg-white text-gray-800">
                  {l.label}
                </option>
              ))}
            </select>
            <span className="text-xs text-gray-400">
              {LEVELS[level].hint}
            </span>
            <button
              onClick={compressAll}
              disabled={Boolean(zipping)}
              className="mr-auto text-xs font-semibold text-brand bg-brand/10 border border-brand/30 rounded-lg px-3 py-1.5 disabled:opacity-40"
            >
              اضغط الكل
            </button>
          </div>
          <p className="text-[11px] text-amber-700">
            الضغط يحوّل كل صفحة إلى صورة — الحجم ينزل كثيراً لكن{" "}
            <span className="font-bold">طبقة النصّ تُفقَد</span>. لا يضرّ هنا
            لأن المسح الضوئي يقرأ الصور، لكن لا تستعمل الناتج نسخةً للطالب.
          </p>
        </div>

        <div className={`grid grid-cols-1 ${pending.length === 1 ? "" : "md:grid-cols-2"} gap-3 mb-5`}>
          {pending.length === 1 && (
            <button
              onClick={() => {
                const f = pending[0];
                setPending(null);
                adoptSingle(f);
              }}
              className="text-right p-5 rounded-xl border-2 border-gray-200 hover:border-brand hover:bg-brand/5 transition-colors"
            >
              <div className="w-10 h-10 rounded-xl bg-brand/10 flex items-center justify-center mb-3">
                <Scissors size={19} className="text-brand" />
              </div>
              <span className="block text-sm font-bold text-gray-800">
                تابع إلى التقسيم
              </span>
              <span className="block text-xs text-gray-500 mt-1.5 leading-relaxed">
                تراه صفحةً صفحة فتقسّمه كما تشاء.
              </span>
            </button>
          )}
          {pending.length > 1 && (
          <button
            onClick={() => adoptKeep(pending)}
            className="text-right p-5 rounded-xl border-2 border-gray-200 hover:border-brand hover:bg-brand/5 transition-colors"
          >
            <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center mb-3">
              <Layers size={19} className="text-emerald-600" />
            </div>
            <span className="block text-sm font-bold text-gray-800">
              أبقِ التقسيم الحالي
            </span>
            <span className="block text-xs text-gray-500 mt-1.5 leading-relaxed">
              كل ملف محاضرةٌ مستقلة. لن تحتاج إلا لمراجعة الأسماء — وهي مأخوذة
              من أسماء الملفات.
            </span>
          </button>
          )}

          {pending.length > 1 && (
          <button
            onClick={() => adoptMerged(pending)}
            className="text-right p-5 rounded-xl border-2 border-gray-200 hover:border-brand hover:bg-brand/5 transition-colors"
          >
            <div className="w-10 h-10 rounded-xl bg-brand/10 flex items-center justify-center mb-3">
              <Scissors size={19} className="text-brand" />
            </div>
            <span className="block text-sm font-bold text-gray-800">
              ادمجها وقسّمها من جديد
            </span>
            <span className="block text-xs text-gray-500 mt-1.5 leading-relaxed">
              تُدمج في مستند واحد وتراه صفحةً صفحة فتقسّمه كما تشاء. تبقى حدود
              الملفات الأصلية ظاهرة على الشبكة.
            </span>
          </button>
          )}
        </div>

        <div className="rounded-xl border border-gray-100 divide-y divide-gray-100">
          {pending.map((f, i) => {
            const z = zipped[i];
            const busyHere = zipping?.index === i;
            const tooBig = f.size > 50 * 1024 * 1024;
            return (
              <div key={i} className="px-3 py-2 text-xs">
                <div className="flex items-center gap-2">
                  <FileText size={13} className="text-gray-400 shrink-0" />
                  <span className="truncate text-gray-700">{f.name}</span>
                  <span
                    className={`shrink-0 ${tooBig ? "text-red-600 font-bold" : "text-gray-400"}`}
                  >
                    {formatSize(f.size)}
                  </span>
                  {z && (
                    <span className="text-green-700 font-semibold shrink-0">
                      ↓ {Math.round(z.saved * 100)}%
                    </span>
                  )}
                  <button
                    onClick={() => compressOne(i)}
                    disabled={Boolean(zipping)}
                    className="mr-auto text-[11px] font-semibold text-brand bg-brand/10 rounded-md px-2 py-1 disabled:opacity-40 shrink-0"
                  >
                    {busyHere ? "…" : z ? "أعد الضغط" : "اضغط"}
                  </button>
                </div>
                {busyHere && zipping.total > 0 && (
                  <div className="h-1 rounded-full bg-gray-200 overflow-hidden mt-1.5">
                    <div
                      className="h-full bg-brand transition-all"
                      style={{ width: `${(zipping.done / zipping.total) * 100}%` }}
                    />
                  </div>
                )}
                {tooBig && !z && (
                  <p className="text-[11px] text-red-600 mt-1">
                    يتجاوز حدّ Mistral (50 م.ب) — اضغطه أولاً
                  </p>
                )}
                {z && (
                  <p className="text-[11px] text-gray-500 mt-0.5">
                    {fmtMB(z.before)} ← {fmtMB(z.after)} · {z.pages} صفحة
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <button
          onClick={() => setPending(null)}
          className="mt-4 text-sm text-gray-600 border border-gray-200 rounded-xl px-4 py-2.5 flex items-center gap-2"
        >
          <X size={15} /> إلغاء
        </button>
      </div>
    );
  }

  // (ج) التقسيم
  const isKeepMode = mode === "keep";
  return (
    <div className="flex flex-col gap-4">
      {/* ملخّص المصدر */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center gap-3 flex-wrap">
        <div className="w-9 h-9 rounded-xl bg-brand/10 flex items-center justify-center shrink-0">
          <FileText size={18} className="text-brand" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-800 truncate">
            {sourceFiles.length === 1
              ? sourceFiles[0].name
              : `${sourceFiles.length} ملفات مدموجة`}
          </p>
          <p className="text-xs text-gray-400">
            {pageCount} صفحة · {sorted(ranges).length} محاضرة
          </p>
        </div>
        <div className="mr-auto flex items-center gap-2">
          <button
            onClick={suggestAll}
            disabled={Boolean(busy)}
            className="text-xs text-gray-600 border border-gray-200 rounded-xl px-3 py-2 flex items-center gap-1.5 disabled:opacity-40"
          >
            اقترح الأسماء الناقصة
          </button>
          <button
            onClick={downloadZip}
            disabled={Boolean(busy) || !report.ok}
            title={report.ok ? "" : "أصلح ما يمنع المتابعة أولاً"}
            className="text-xs text-gray-600 border border-gray-200 rounded-xl px-3 py-2 flex items-center gap-1.5 disabled:opacity-40"
          >
            <Download size={14} /> ZIP
          </button>
          <button
            onClick={startOver}
            className="text-xs text-gray-500 border border-gray-200 rounded-xl px-3 py-2 flex items-center gap-1.5"
          >
            <RotateCcw size={14} /> ابدأ من جديد
          </button>
        </div>
      </div>

      <CoverageBar
        ranges={ranges}
        pageCount={pageCount}
        onJump={(p) => setFocusPage(p)}
      />

      {/* التحقق */}
      {(report.blocking.length > 0 || report.warnings.length > 0) && (
        <div className="flex flex-col gap-2">
          {report.blocking.length > 0 && (
            <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3">
              <p className="text-sm font-bold text-red-700 flex items-center gap-1.5 mb-1">
                <AlertTriangle size={15} /> يمنع المتابعة (
                {report.blocking.length})
              </p>
              <ul className="text-xs text-red-600 space-y-0.5 mr-5 list-disc">
                {report.blocking.slice(0, 6).map((p, i) => (
                  <li key={i}>{p.text}</li>
                ))}
                {report.blocking.length > 6 && (
                  <li>و{report.blocking.length - 6} غيرها…</li>
                )}
              </ul>
            </div>
          )}
          {report.warnings.length > 0 && (
            <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
              <p className="text-sm font-bold text-amber-700 flex items-center gap-1.5 mb-1">
                <AlertTriangle size={15} /> تنبيه — قد يكون مقصوداً
              </p>
              <ul className="text-xs text-amber-700 space-y-0.5 mr-5 list-disc">
                {report.warnings.slice(0, 6).map((p, i) => (
                  <li key={i}>
                    {p.text}
                    {p.pages && (
                      <button
                        onClick={() => setFocusPage(p.pages.start)}
                        className="mr-1.5 underline font-medium"
                      >
                        اعرضها
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {localError && (
        <div className="bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl px-4 py-2.5 flex items-center gap-2">
          {localError}
          <button onClick={() => setLocalError(null)} className="mr-auto">
            <X size={15} />
          </button>
        </div>
      )}

      {/* الشبكة + القائمة */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-4 items-start">
        {isKeepMode ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-6 text-center">
            <CheckCircle2 size={24} className="text-emerald-500 mx-auto mb-2" />
            <p className="text-sm text-gray-700 font-semibold">
              كل ملف محاضرةٌ مستقلة
            </p>
            <p className="text-xs text-gray-400 mt-1">
              راجع الأسماء على اليسار ثم تابع. لعرض الصفحات والتقسيم اليدوي،
              ارفع من جديد واختر «ادمجها وقسّمها».
            </p>
          </div>
        ) : (
          pdf && (
            <PageGrid
              pdf={pdf}
              pageCount={pageCount}
              aspect={aspect}
              ranges={ranges}
              boundaries={boundaries}
              focusPage={focusPage}
              onSplit={(p) => setRanges(splitAt(ranges, p))}
              onMerge={(p) => setRanges(mergeAt(ranges, p))}
            />
          )
        )}

        <div
          className="bg-white rounded-2xl border border-gray-100 p-4"
          style={{ maxHeight: "min(68vh, 760px)" }}
        >
          <RangeList
            ranges={ranges}
            problemsById={problemsById}
            suggesting={suggesting}
            onUpdate={(id, f, v) =>
              setRanges(updateRange(ranges, id, f, v, pageCount))
            }
            onRemove={(id) => setRanges(removeRange(ranges, id))}
            onJump={(p) => setFocusPage(p)}
            onSuggestName={handleSuggestName}
            onBulkName={(prefix) => setRanges(applyBulkNames(ranges, prefix))}
          />
        </div>
      </div>

      {/* المتابعة */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center gap-3 flex-wrap">
        {cutProgress ? (
          <div className="flex-1 min-w-0">
            <p className="text-xs text-gray-600 mb-1.5 truncate">
              {cutProgress.name
                ? `جارٍ قصّ «${cutProgress.name}»…`
                : "جارٍ الإنهاء…"}{" "}
              {cutProgress.done}/{cutProgress.total}
            </p>
            <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
              <div
                className="h-full bg-brand transition-all"
                style={{
                  width: `${(cutProgress.done / Math.max(1, cutProgress.total)) * 100}%`,
                }}
              />
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-500">
            {report.ok ? (
              <span className="flex items-center gap-1.5 text-green-700">
                <CheckCircle2 size={16} />
                {sorted(ranges).length} محاضرة جاهزة · {report.coveredPages} من{" "}
                {pageCount} صفحة مغطّاة
              </span>
            ) : (
              "أصلح ما يمنع المتابعة أعلاه"
            )}
          </p>
        )}

        <button
          onClick={doCut}
          disabled={!report.ok || Boolean(busy)}
          className="mr-auto bg-brand text-white text-sm font-bold rounded-xl px-6 py-2.5 disabled:opacity-40 flex items-center gap-2"
        >
          {busy ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <ArrowLeft size={16} />
          )}
          متابعة إلى المسح الضوئي
        </button>
      </div>
    </div>
  );
}
