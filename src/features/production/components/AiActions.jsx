import { useEffect, useRef, useState } from "react";
import axios from "axios";
import {
  ScanLine,
  SpellCheck2,
  Sparkles,
  Loader2,
  X,
  Check,
  ChevronDown,
  Key,
  Eye,
  EyeOff,
  Target,
  AlertTriangle,
  Undo2,
  AudioLines,
} from "lucide-react";
import { scanLecture, checkR2 } from "../lib/mistralOcr";
import { transcribeAudio } from "../lib/transcribe";
import { chunkLines } from "../lib/promptSettings";
import { bytesOfFile } from "../lib/pdfEngine";
import {
  buildChunks,
  CHUNK_LINES,
  screenCorrections,
  applyCorrections,
} from "../lib/spellGuards";
import { API_BASE_URL, PASSWORD } from "../../../config";
import {
  learnedForPrompt,
  recordAccepted,
} from "../lib/learnedCorrections";

// ─── أدوات الذكاء الاصطناعي، قابلة للاستعمال خارج خطّ الإنتاج ─────────────────
// المواد القديمة (بلا خطة «معدل») تحتاج نفس الأدوات لكن محاضرةً محاضرة، لا
// بخطٍّ من تسع خطوات. فصلناها هنا ليستعملها محرّر المحاضرة كما يستعملها الخط،
// ونسخةٌ واحدة من المنطق لا نسختان تفترقان.
const MISTRAL_KEY_STORE = "mistral_api_key";
const WAIT_BETWEEN_CHUNKS = 6500;

// قائمة احتياطية حين يتعذّر جلبها من الحساب
const FALLBACK_MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.5-pro", "gemini-2.0-flash"];

const Btn = ({ icon: Icon, color, children, busy, ...rest }) => (
  <button
    {...rest}
    className="text-xs font-semibold rounded-lg px-3 py-2 flex items-center gap-1.5 disabled:opacity-40 border"
    style={{
      color,
      backgroundColor: `${color}14`,
      borderColor: `${color}33`,
    }}
  >
    {busy ? <Loader2 size={13} className="animate-spin" /> : <Icon size={13} />}
    {children}
  </button>
);

// ─── ١) المسح الضوئي: ملف PDF ← ماركداون ──────────────────────────────────────

export const OcrAction = ({ lectureName, subjectName, onText, onFile }) => {
  const [apiKey, setApiKey] = useState(
    () => localStorage.getItem(MISTRAL_KEY_STORE) || "",
  );
  const [showKey, setShowKey] = useState(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState(null);
  const [error, setError] = useState(null);
  const [r2, setR2] = useState(null);
  const fileRef = useRef(null);

  useEffect(() => {
    if (open && r2 === null) checkR2().then(setR2);
  }, [open, r2]);

  useEffect(() => {
    if (apiKey) localStorage.setItem(MISTRAL_KEY_STORE, apiKey);
  }, [apiKey]);

  const run = async (file) => {
    setBusy(true);
    setError(null);
    try {
      const bytes = await bytesOfFile(file);
      // البايتات تُسلَّم للمستدعي ليعرض الملفّ الأصلي في المقارنة.
      // نسخةٌ مستقلّة: pdf.js يستولي على المخزن المؤقت فيصير فارغاً بعده.
      onFile?.(bytes.slice(0));
      const r = await scanLecture({
        apiKey: apiKey.trim(),
        subject: subjectName || "مادة",
        name: lectureName,
        bytes,
        withImages: r2?.ready !== false,
        onStage: setStage,
      });
      onText(r.markdown, r.stats);
      setOpen(false);
    } catch (e) {
      setError(
        e?.response?.data?.message || e?.message || "تعذّر المسح الضوئي",
      );
    } finally {
      setBusy(false);
      setStage(null);
    }
  };

  return (
    <>
      <Btn icon={ScanLine} color="#0ea5e9" onClick={() => setOpen(true)}>
        مسح ضوئي من PDF
      </Btn>

      {open && (
        <div
          className="fixed inset-0 bg-black/45 flex items-center justify-center z-50 p-4"
          onClick={() => !busy && setOpen(false)}
        >
          <div
            dir="rtl"
            className="bg-white rounded-2xl w-full max-w-lg p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 mb-4">
              <div className="w-9 h-9 rounded-xl bg-sky-50 flex items-center justify-center">
                <ScanLine size={17} className="text-sky-600" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-bold text-gray-800">
                  مسح ضوئي — {lectureName}
                </h3>
                <p className="text-xs text-gray-400">
                  ارفع ملف PDF لهذه المحاضرة وحدها
                </p>
              </div>
              <button
                onClick={() => !busy && setOpen(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100"
              >
                <X size={17} />
              </button>
            </div>

            <label className="block mb-3">
              <span className="text-xs text-gray-400 flex items-center gap-1 mb-1">
                <Key size={12} /> مفتاح Mistral
              </span>
              <div className="relative">
                <input
                  type={showKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  dir="ltr"
                  placeholder="sk-…"
                  className="w-full px-3 py-2 pl-9 rounded-xl border border-gray-200 text-sm outline-none focus:border-brand font-mono"
                />
                <button
                  onClick={() => setShowKey((v) => !v)}
                  className="absolute left-2 top-1/2 -translate-y-1/2 p-1 text-gray-400"
                >
                  {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </label>

            {r2 && !r2.ready && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mb-3">
                R2 غير مهيّأ — سيُستخرج النصّ بلا صور
              </p>
            )}

            {stage && (
              <p className="text-xs text-blue-600 flex items-center gap-1.5 mb-3">
                <Loader2 size={12} className="animate-spin" /> {stage}
              </p>
            )}
            {error && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-3">
                {error}
              </p>
            )}

            <input
              ref={fileRef}
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) run(f);
              }}
            />
            <div className="flex items-center gap-2">
              <p className="text-xs text-gray-400 flex-1">
                النصّ الحالي سيُستبدل بالنتيجة
              </p>
              <button
                onClick={() => fileRef.current?.click()}
                disabled={busy || !apiKey.trim()}
                className="bg-brand text-white text-sm font-bold rounded-xl px-5 py-2.5 disabled:opacity-40 flex items-center gap-2"
              >
                {busy ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <ScanLine size={15} />
                )}
                اختر الملف وامسح
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

// ─── ٢) التدقيق الإملائي ──────────────────────────────────────────────────────

// سطر تصحيح واحد. **خارج** جسم SpellAction عمداً: تعريفه داخله يجعل React
// يراه نوعَ مكوّنٍ جديداً عند كل ضغطة حرف، فيهدم الحقل ويبنيه — فيقفز المؤشّر
// خارج الحقل ويعود التمرير إلى الأعلى.
const SpellRow = ({ c, text, onField, muted }) => {
  const line = String(text || "").split("\n")[Number(c.line)] || "";
  const idx = line.indexOf(c.before);
  const before = idx >= 0 ? line.slice(0, idx) : "";
  const after = idx >= 0 ? line.slice(idx + c.before.length) : "";
  return (
    <div
      className={`grid grid-cols-[auto_1fr_auto_1fr] gap-2.5 items-start px-3 py-2.5 border-b border-gray-100 ${
        muted ? "bg-gray-50/60" : ""
      }`}
    >
      <button
        onClick={() => onField(c.key, "on", !c.on)}
        className={`w-6 h-6 mt-1 rounded-md flex items-center justify-center shrink-0 ${
          c.on ? "bg-green-500 text-white" : "bg-gray-200 text-gray-400"
        }`}
      >
        {c.on && <Check size={14} />}
      </button>
      <div className="min-w-0">
        <span className="block text-sm font-semibold text-red-700 line-through">
          {c.before}
        </span>
        {/* السطر كاملاً — الحكم على التصحيح يحتاج الجملة لا أوّلها */}
        <span
          className="block text-[11px] text-gray-500 leading-6 mt-1 font-arabic"
          dir="rtl"
        >
          <span className="text-gray-400">سطر {c.line}: </span>
          {idx >= 0 ? (
            <>
              {before}
              <mark className="bg-amber-200 rounded px-0.5">{c.before}</mark>
              {after}
            </>
          ) : (
            <span className="text-amber-600">
              لم تُعثر عليها في السطر — ستُتخطّى
            </span>
          )}
        </span>
        {c.reason && (
          <span className="block text-[11px] text-gray-500 mt-0.5">
            رُفض آلياً: {c.reason}
          </span>
        )}
      </div>
      <span className="text-gray-300 text-sm mt-1.5">←</span>
      <input
        value={c.after}
        onChange={(e) => onField(c.key, "after", e.target.value)}
        dir="rtl"
        className="w-full px-2.5 py-1.5 mt-0.5 rounded-lg border border-gray-200 text-sm font-semibold text-green-800 bg-green-50/40 outline-none focus:border-brand"
      />
    </div>
  );
};


export const SpellAction = ({ text, onText }) => {
  // حجم الدفعة كما ضبطه المحرِّر — للعرض وحده، والتقسيم يقرأه عند التشغيل
  const [chunkSize, setChunkSize] = useState(CHUNK_LINES);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState(null);
  const [models, setModels] = useState([]);
  const [model, setModel] = useState("");
  const [report, setReport] = useState(null);
  const [showRejected, setShowRejected] = useState(false);

  useEffect(() => {
    axios
      .post(`${API_BASE_URL}/production/gemini-models`, { PASSWORD })
      .then((r) => {
        setModels(r.data?.models || []);
        setModel(r.data?.current || "");
      })
      .catch(() => {
        setModels(FALLBACK_MODELS);
        setModel(FALLBACK_MODELS[0]);
      });
  }, []);

  // فتح النافذة لا يبدأ التدقيق: النموذج يُختار أولاً. كان البدء فورياً
  // فيظهر المحدِّد بينما الطلبات جارية — اختيارٌ لا أثر له.
  const openPicker = () => {
    if (!text?.trim()) return;
    setReport(null);
    setError(null);
    setProgress(null);
    setOpen(true);
  };

  const run = async () => {
    if (!text?.trim()) return;
    setOpen(true);
    chunkLines().then(setChunkSize);
    setBusy(true);
    setError(null);
    setReport(null);
    const chunks = buildChunks(text, await chunkLines());
    const raw = [];
    let quotaRetries = 0;
    try {
      for (let i = 0; i < chunks.length; i++) {
        setProgress({ done: i, total: chunks.length });
        try {
          // eslint-disable-next-line no-await-in-loop
          const r = await axios.post(`${API_BASE_URL}/production/spellcheck`, {
            PASSWORD,
            text: chunks[i].text,
            model,
            learned: learnedForPrompt(),
          });
          raw.push(...(r.data?.corrections || []));
        } catch (e) {
          const wait = e?.response?.data?.retryAfter;
          if (wait && quotaRetries < 3) {
            quotaRetries += 1;
            setProgress({ done: i, total: chunks.length, waiting: wait });
            // eslint-disable-next-line no-await-in-loop
            await new Promise((r2) => setTimeout(r2, wait * 1000));
            i -= 1;
            // eslint-disable-next-line no-continue
            continue;
          }
          throw e;
        }
        if (i < chunks.length - 1) {
          // eslint-disable-next-line no-await-in-loop
          await new Promise((r2) => setTimeout(r2, WAIT_BETWEEN_CHUNKS));
        }
      }
      const { accepted, rejected } = screenCorrections(raw, text);
      setReport({
        accepted: accepted.map((c, i) => ({ ...c, key: `a${i}`, on: true })),
        rejected: rejected.map((c, i) => ({ ...c, key: `r${i}`, on: false })),
      });
    } catch (e) {
      setError(e?.response?.data?.message || e.message);
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const setField = (key, field, value) =>
    setReport((p) => ({
      accepted: p.accepted.map((c) =>
        c.key === key ? { ...c, [field]: value } : c,
      ),
      rejected: p.rejected.map((c) =>
        c.key === key ? { ...c, [field]: value } : c,
      ),
    }));

  const chosen = report
    ? [...report.accepted, ...report.rejected].filter(
        (c) => c.on && String(c.after || "").trim() && c.after !== c.before,
      )
    : [];

  const apply = () => {
    recordAccepted(chosen);
    const r = applyCorrections(text, chosen);
    onText(r.text, r);
    setOpen(false);
    setReport(null);
  };

  return (
    <>
      <Btn
        icon={SpellCheck2}
        color="#8C52FF"
        onClick={openPicker}
        disabled={!text?.trim()}
        title={text?.trim() ? "" : "لا نصّ لتدقيقه"}
      >
        تدقيق إملائي
      </Btn>

      {open && (
        <div className="fixed inset-0 bg-black/45 flex items-center justify-center z-50 p-4">
          <div
            dir="rtl"
            className="bg-white rounded-2xl w-full max-w-3xl max-h-[88vh] flex flex-col overflow-hidden"
          >
            <div className="flex items-center gap-3 p-4 border-b border-gray-100 flex-wrap">
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-bold text-gray-800">
                  التدقيق الإملائي
                </h3>
                <p className="text-xs text-gray-400">
                  {report
                    ? `${report.accepted.length} مقترح · ${report.rejected.length} مرفوض آلياً · اختير ${chosen.length}`
                    : "الأرقام لا تُمَسّ · تراجع كل كلمة قبل التطبيق"}
                </p>
              </div>
              {busy && model && (
                <span className="text-[11px] text-gray-400" dir="ltr">
                  {model}
                </span>
              )}
              <button
                onClick={() => !busy && setOpen(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {/* شاشة ما قبل البدء: اختر النموذج ثم ابدأ */}
              {!busy && !report && !error && (
                <div className="p-6 flex flex-col items-center gap-4 text-center">
                  <SpellCheck2 size={30} className="text-brand" />
                  <div>
                    <p className="text-sm text-gray-700 font-semibold">
                      اختر نموذج التدقيق ثم ابدأ
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      النصّ {text.length.toLocaleString("ar-EG")} حرفاً ·{" "}
                      {buildChunks(text, chunkSize).length} دفعة
                    </p>
                  </div>

                  <select
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    dir="ltr"
                    className="px-3 py-2.5 rounded-xl border border-gray-200 text-sm bg-white text-gray-800 min-w-[16rem]"
                  >
                    {(models.length ? models : FALLBACK_MODELS).map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>

                  <button
                    onClick={run}
                    disabled={!model}
                    className="bg-brand text-white text-sm font-bold rounded-xl px-8 py-2.5 disabled:opacity-40"
                  >
                    ابدأ التدقيق
                  </button>
                </div>
              )}

              {busy && (
                <div className="py-12 text-center">
                  <Loader2 size={26} className="animate-spin mx-auto text-brand" />
                  <p className="text-sm text-gray-500 mt-3">
                    {progress?.waiting
                      ? `تجاوز الحصة — انتظار ${progress.waiting} ثانية`
                      : `دفعة ${(progress?.done ?? 0) + 1} من ${progress?.total ?? "?"}`}
                  </p>
                </div>
              )}

              {error && (
                <p className="m-4 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3 flex items-start gap-2">
                  <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                  {error}
                </p>
              )}

              {report && (
                <>
                  <div className="grid grid-cols-[auto_1fr_auto_1fr] gap-2.5 px-3 py-2 bg-gray-50 border-b border-gray-200 text-[11px] font-bold text-gray-500 sticky top-0">
                    <span className="w-6" />
                    <span>سابقاً</span>
                    <span />
                    <span>الآن — عدّله كما تشاء</span>
                  </div>
                  {report.accepted.length === 0 && (
                    <p className="text-sm text-gray-500 text-center py-10">
                      لم يُعثر على أخطاء إملائية
                    </p>
                  )}
                  {report.accepted.map((c) => (
                    <SpellRow key={c.key} c={c} text={text} onField={setField} />
                  ))}
                  {report.rejected.length > 0 && (
                    <>
                      <button
                        onClick={() => setShowRejected((v) => !v)}
                        className="w-full flex items-center gap-2 px-3 py-2.5 bg-gray-50 text-xs font-semibold text-gray-600 border-y border-gray-200"
                      >
                        <ChevronDown
                          size={14}
                          className={showRejected ? "" : "-rotate-90"}
                        />
                        {report.rejected.length} اقتراحاً رفضته القواعد
                      </button>
                      {showRejected &&
                        report.rejected.map((c) => (
                          <SpellRow key={c.key} c={c} text={text} onField={setField} muted />
                        ))}
                    </>
                  )}
                </>
              )}
            </div>

            <div className="p-4 border-t border-gray-100 flex items-center gap-3">
              <button
                onClick={() => setOpen(false)}
                disabled={busy}
                className="text-sm text-gray-600 border border-gray-200 rounded-xl px-4 py-2.5 flex items-center gap-2 disabled:opacity-40"
              >
                <Undo2 size={15} /> أغلق بلا تطبيق
              </button>
              <button
                onClick={apply}
                disabled={chosen.length === 0}
                className="mr-auto bg-brand text-white text-sm font-bold rounded-xl px-6 py-2.5 disabled:opacity-40 flex items-center gap-2"
              >
                <Check size={16} /> طبّق {chosen.length} تصحيحاً
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

// ─── ٣) توليد البطاقات أو الاختبار التحريري ───────────────────────────────────

export const GenerateAction = ({ kind, text, onItems }) => {
  const isFlash = kind === "flash";
  const color = isFlash ? "#10b981" : "#ef4444";
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [models, setModels] = useState([]);
  const [model, setModel] = useState("");
  const [focus, setFocus] = useState("");
  const [count, setCount] = useState(isFlash ? 10 : 5);

  useEffect(() => {
    if (!open || models.length) return;
    axios
      .post(`${API_BASE_URL}/production/gemini-models`, { PASSWORD })
      .then((r) => {
        setModels(r.data?.models || []);
        setModel(r.data?.current || "");
      })
      .catch(() => {
        setModels(FALLBACK_MODELS);
        setModel(FALLBACK_MODELS[0]);
      });
  }, [open, models.length]);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await axios.post(`${API_BASE_URL}/production/generate`, {
        PASSWORD,
        kind,
        text,
        model,
        focus,
        count,
      });
      const items = isFlash ? r.data?.cards || [] : r.data?.questions || [];
      if (!items.length) {
        setError("لم يُعِد النموذج أي عنصر — أعد المحاولة");
        return;
      }
      onItems(items);
      setOpen(false);
    } catch (e) {
      setError(e?.response?.data?.message || e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Btn
        icon={Sparkles}
        color={color}
        onClick={() => setOpen(true)}
        disabled={!text?.trim()}
        title={text?.trim() ? "" : "يحتاج نصّ المقرَّر — امسحه أولاً"}
      >
        ولّد بالذكاء الاصطناعي
      </Btn>

      {open && (
        <div
          className="fixed inset-0 bg-black/45 flex items-center justify-center z-50 p-4"
          onClick={() => !busy && setOpen(false)}
        >
          <div
            dir="rtl"
            className="bg-white rounded-2xl w-full max-w-lg p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 mb-4">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: `${color}1A` }}
              >
                <Sparkles size={17} style={{ color }} />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-bold text-gray-800">
                  توليد {isFlash ? "بطاقات الاسترجاع" : "الاختبار التحريري"}
                </h3>
                <p className="text-xs text-gray-400">
                  من نصّ مقرَّر هذه المحاضرة
                </p>
              </div>
              <button
                onClick={() => !busy && setOpen(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100"
              >
                <X size={17} />
              </button>
            </div>

            <div className="flex items-end gap-2 mb-3 flex-wrap">
              <label className="flex flex-col gap-1 flex-1 min-w-[180px]">
                <span className="text-xs text-gray-400">النموذج</span>
                {models.length > 0 && (
                  <select
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    dir="ltr"
                    className="px-3 py-2 rounded-xl border border-gray-200 text-sm bg-white text-gray-800"
                  >
                    {models.map((m) => (
                      <option key={m} value={m} className="bg-white text-gray-800">
                        {m}
                      </option>
                    ))}
                  </select>
                )}
              </label>
              <label className="flex flex-col gap-1 w-24">
                <span className="text-xs text-gray-400">العدد</span>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={count}
                  onChange={(e) => setCount(Number(e.target.value))}
                  className="px-3 py-2 rounded-xl border border-gray-200 text-sm"
                />
              </label>
            </div>

            <label className="block mb-4">
              <span className="text-xs text-gray-400 flex items-center gap-1 mb-1">
                <Target size={12} /> موضوع التركيز — اختياري
              </span>
              <input
                value={focus}
                onChange={(e) => setFocus(e.target.value)}
                dir="rtl"
                placeholder="مثلاً: التصنيفات والأرقام"
                className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm outline-none focus:border-brand"
              />
            </label>

            {error && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-3">
                {error}
              </p>
            )}

            <div className="flex items-center gap-2">
              <p className="text-xs text-gray-400 flex-1">
                المولَّد يُضاف إلى الموجود ولا يستبدله
              </p>
              <button
                onClick={run}
                disabled={busy}
                className="text-white text-sm font-bold rounded-xl px-5 py-2.5 disabled:opacity-40 flex items-center gap-2"
                style={{ backgroundColor: color }}
              >
                {busy ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <Sparkles size={15} />
                )}
                ولّد
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};


// ─── ٤) تفريغ تسجيل صوتي إلى نصّ مقرَّر ─────────────────────────────────────────
// المحاضرة قد تكون تسجيلاً لا ملفاً. الناتج يصير **نصّ المقرَّر** نفسه، فيمرّ
// على ما يمرّ عليه سواه: التدقيق الإملائي وتوليد البطاقات والتحريري.
// لذلك المخرَج ماركداون لا نصّاً خاماً — نصٌّ بلا عناوين كتلةٌ لا تُقرأ.

export const TranscribeAction = ({ onText }) => {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);
  const [models, setModels] = useState([]);
  const [model, setModel] = useState("");
  const [prompt, setPrompt] = useState("");
  const [showPrompt, setShowPrompt] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    if (!open || models.length) return;
    axios
      .post(`${API_BASE_URL}/production/transcribe-models`, { PASSWORD })
      .then((r) => {
        const list = r.data?.models || [];
        setModels(list);
        setModel(r.data?.current || list[0] || "");
      })
      .catch(() => {
        setModels(FALLBACK_MODELS);
        setModel(FALLBACK_MODELS[0]);
      });
  }, [open, models.length]);

  const run = async (file) => {
    setBusy(true);
    setError(null);
    setProgress(0);
    try {
      const r = await transcribeAudio(file, {
        model,
        prompt: prompt.trim() || undefined,
        onStage: setStage,
        onProgress: setProgress,
      });
      if (r?.truncated) {
        setError(
          "التسجيل أطول من سعة المخرَج فبُتر النصّ. النصّ أُدرج — قسّم التسجيل وأعد الباقي.",
        );
      }
      onText(r.text);
      if (!r?.truncated) setOpen(false);
    } catch (e) {
      setError(
        e?.response?.data?.message || e?.message || "تعذّر تفريغ التسجيل",
      );
    } finally {
      setBusy(false);
      setStage(null);
      setProgress(0);
    }
  };

  return (
    <>
      <Btn icon={AudioLines} color="#a855f7" onClick={() => setOpen(true)}>
        تفريغ تسجيل صوتي
      </Btn>

      {open && (
        <div
          className="fixed inset-0 bg-black/45 flex items-center justify-center z-50 p-4"
          onClick={() => !busy && setOpen(false)}
        >
          <div
            dir="rtl"
            className="bg-white rounded-2xl w-full max-w-lg p-5 max-h-[88vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 mb-4">
              <div className="w-9 h-9 rounded-xl bg-purple-50 flex items-center justify-center">
                <AudioLines size={17} className="text-purple-600" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-bold text-gray-800">
                  تفريغ تسجيل صوتي
                </h3>
                <p className="text-xs text-gray-400">
                  الناتج يصير نصّ المقرَّر — أي صيغة صوتية
                </p>
              </div>
              <button
                onClick={() => !busy && setOpen(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100"
              >
                <X size={17} />
              </button>
            </div>

            <label className="block mb-3">
              <span className="text-xs text-gray-400 mb-1 block">النموذج</span>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                dir="ltr"
                className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm bg-white text-gray-800"
              >
                {models.map((m) => (
                  <option key={m} value={m} className="bg-white text-gray-800">
                    {m}
                  </option>
                ))}
              </select>
            </label>

            <button
              onClick={() => setShowPrompt((v) => !v)}
              className="text-xs text-brand mb-2"
            >
              {showPrompt ? "أخفِ" : "عدّل"} تعليمات التفريغ
            </button>
            {showPrompt && (
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                dir="rtl"
                rows={6}
                placeholder="اتركه فارغاً للتعليمات الافتراضية (تُخرج ماركداون بعناوين وقوائم)"
                className="w-full p-2.5 mb-3 rounded-xl border border-gray-200 text-sm font-arabic outline-none focus:border-brand"
              />
            )}

            {stage && (
              <div className="mb-3">
                <p className="text-xs text-blue-600 flex items-center gap-1.5">
                  <Loader2 size={12} className="animate-spin" /> {stage}
                </p>
                {progress > 0 && progress < 100 && (
                  <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden mt-1.5">
                    <div
                      className="h-full bg-purple-500 transition-all"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                )}
              </div>
            )}
            {error && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-3">
                {error}
              </p>
            )}

            <input
              ref={fileRef}
              type="file"
              accept="audio/*,video/mp4,.m4a,.mp3,.wav,.ogg,.opus,.aac,.flac"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) run(f);
              }}
            />
            <div className="flex items-center gap-2">
              <p className="text-xs text-gray-400 flex-1">
                النصّ الحالي سيُستبدل بالتفريغ
              </p>
              <button
                onClick={() => fileRef.current?.click()}
                disabled={busy || !model}
                className="text-white text-sm font-bold rounded-xl px-5 py-2.5 disabled:opacity-40 flex items-center gap-2"
                style={{ backgroundColor: "#a855f7" }}
              >
                {busy ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <AudioLines size={15} />
                )}
                اختر التسجيل وفرّغ
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
