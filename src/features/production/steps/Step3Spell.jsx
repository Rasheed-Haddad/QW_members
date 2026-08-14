import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import {
  SpellCheck2,
  Play,
  Square,
  RotateCw,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  ArrowLeft,
  X,
  ShieldCheck,
  ChevronDown,
  Check,
  Undo2,
} from "lucide-react";
import { usePipeline } from "../pipelineStore";
import OriginalPane from "../components/OriginalPane";
import {
  buildChunks,
  screenCorrections,
  applyCorrections,
} from "../lib/spellGuards";
import { API_BASE_URL, PASSWORD } from "../../../config";
import {
  learnedForPrompt,
  recordAccepted,
  getLearned,
} from "../lib/learnedCorrections";

// ─── الخطوة ٣: التدقيق الإملائي ───────────────────────────────────────────────
// النموذج يقترح، والقواعد ترفض، وأنت تحكم. ثلاث مراحل لا تُختصر:
// الاقتراح (Gemini) ← الفرز الآلي (spellGuards) ← مراجعتك كلمةً كلمة.
//
// لا شيء يُكتب على النص قبل ضغطك «طبّق». التدقيق التلقائي بلا مراجعة كان
// يقلب كلمات سليمة إلى أخرى، ولا يُكتشف ذلك إلا عند الطالب.
const WAIT_BETWEEN_CHUNKS = 6500; // مثل الأصل: 6.5 ثانية بين الطلبات

export default function Step3Spell() {
  const { state, dispatch } = usePipeline();
  const { lectures, markdown, original } = state;

  const scanned = useMemo(
    () => lectures.filter((l) => markdown[l.id]),
    [lectures, markdown],
  );

  const [models, setModels] = useState([]);
  const [model, setModel] = useState("");
  // لا يبدأ التدقيق قبل تثبيت النموذج: البدء بنموذجٍ لم تختره يستهلك
  // حصّتك على نتيجةٍ قد ترفضها.
  const [modelLocked, setModelLocked] = useState(false);
  const [learnedCount, setLearnedCount] = useState(() => getLearned().length);
  const [geminiReady, setGeminiReady] = useState(null);
  // id → {status, accepted[], rejected[], progress, error}
  const [reports, setReports] = useState({});
  const [running, setRunning] = useState(false);
  const [reviewing, setReviewing] = useState(null);
  const stopRef = useRef(false);

  useEffect(() => {
    axios
      .post(`${API_BASE_URL}/production/gemini-models`, { PASSWORD })
      .then((r) => {
        setModels(r.data?.models || []);
        setModel(r.data?.current || "");
        setGeminiReady(r.data?.ready !== false);
      })
      .catch(() => setGeminiReady(false));
  }, []);

  const patch = useCallback((id, v) => {
    setReports((prev) => ({ ...prev, [id]: { ...(prev[id] || {}), ...v } }));
  }, []);

  // ─── تدقيق ملف واحد ─────────────────────────────────────────────────────────
  const checkOne = async (lec) => {
    const text = markdown[lec.id];
    if (!text) return false;
    const chunks = buildChunks(text, await chunkLines());
    patch(lec.id, {
      status: "running",
      error: null,
      progress: { done: 0, total: chunks.length },
    });

    const raw = [];
    // سقف إعادة المحاولة على الحصة: بدونه تدور الدفعة نفسها إلى الأبد إن
    // نفدت الحصة اليومية — وهي تنفد فعلاً على الخطة المجانية.
    let quotaRetries = 0;
    const MAX_QUOTA_RETRIES = 3;
    for (let i = 0; i < chunks.length; i++) {
      if (stopRef.current) {
        patch(lec.id, { status: "idle", progress: null });
        return false;
      }
      patch(lec.id, { progress: { done: i, total: chunks.length } });
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
        if (wait && quotaRetries < MAX_QUOTA_RETRIES) {
          // تجاوز الحصة: ننتظر المهلة التي طلبها الخادم ونعيد الدفعة نفسها
          quotaRetries += 1;
          patch(lec.id, {
            progress: { done: i, total: chunks.length, waiting: wait },
          });
          // eslint-disable-next-line no-await-in-loop
          await new Promise((r2) => setTimeout(r2, wait * 1000));
          i -= 1;
          // eslint-disable-next-line no-continue
          continue;
        }
        patch(lec.id, {
          status: "error",
          error: wait
            ? `نفدت الحصة بعد ${MAX_QUOTA_RETRIES} محاولات — الحصة اليومية على الخطة المجانية محدودة. أعد المحاولة غداً أو بدّل النموذج.`
            : e?.response?.data?.message || e.message,
          progress: null,
        });
        return false;
      }
      if (i < chunks.length - 1) {
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r2) => setTimeout(r2, WAIT_BETWEEN_CHUNKS));
      }
    }

    // الفرز الآلي: أربع طبقات قبل أن يرى المستخدم شيئاً
    const { accepted, rejected } = screenCorrections(raw, text);
    patch(lec.id, {
      status: "done",
      progress: null,
      // كل مقبول يبدأ مُحدَّداً، ونصّه قابل للتعديل اليدوي
      accepted: accepted.map((c, i) => ({ ...c, key: `a${i}`, on: true })),
      rejected: rejected.map((c, i) => ({ ...c, key: `r${i}`, on: false })),
    });
    return true;
  };

  const checkAll = async () => {
    stopRef.current = false;
    setRunning(true);
    for (const lec of scanned) {
      if (stopRef.current) break;
      if (reports[lec.id]?.status === "done") continue;
      // eslint-disable-next-line no-await-in-loop
      await checkOne(lec);
    }
    setRunning(false);
  };

  // ─── تطبيق تصحيحات ملف ──────────────────────────────────────────────────────
  const applyFor = (id) => {
    const rep = reports[id];
    if (!rep) return;
    const chosen = [...(rep.accepted || []), ...(rep.rejected || [])].filter(
      (c) => c.on && String(c.after || "").trim() && c.after !== c.before,
    );
    // ما قبِلتَه فعلاً — بصيغتك النهائية بعد تعديلك لا بصيغة النموذج
    recordAccepted(chosen);
    setLearnedCount(getLearned().length);
    const r = applyCorrections(markdown[id], chosen);
    dispatch({ type: "markdown", markdown: { [id]: r.text } });
    patch(id, {
      status: "applied",
      appliedCount: r.applied,
      skippedCount: r.skipped,
    });
    setReviewing(null);
  };

  const setField = (id, key, field, value) => {
    setReports((prev) => {
      const rep = prev[id];
      if (!rep) return prev;
      const upd = (arr) =>
        (arr || []).map((c) => (c.key === key ? { ...c, [field]: value } : c));
      return {
        ...prev,
        [id]: { ...rep, accepted: upd(rep.accepted), rejected: upd(rep.rejected) },
      };
    });
  };

  const counts = useMemo(() => {
    let done = 0;
    let applied = 0;
    scanned.forEach((l) => {
      const s = reports[l.id]?.status;
      if (s === "done") done += 1;
      if (s === "applied") applied += 1;
    });
    return { done, applied, total: scanned.length };
  }, [scanned, reports]);

  if (!scanned.length) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center">
        <SpellCheck2 size={24} className="text-gray-300 mx-auto mb-3" />
        <p className="text-sm text-gray-500">
          لا نصوص ممسوحة — ارجع إلى خطوة المسح الضوئي أولاً
        </p>
      </div>
    );
  }

  const rep = reviewing ? reports[reviewing] : null;

  return (
    <div className="flex flex-col gap-4">
      {/* التنبيه الحاكم */}
      <div className="bg-brand/5 border border-brand/20 rounded-xl px-4 py-3 flex items-start gap-2.5">
        <ShieldCheck size={16} className="text-brand mt-0.5 shrink-0" />
        <p className="text-xs text-gray-700 leading-relaxed">
          <span className="font-bold">الإملاء وحده.</span> الأرقام والنسب لا
          تُمَسّ، ولا تُقلب الكلمة بتبديل حرفها الأول، ولا تُصحَّح كلمة متكررة
          في المادة. وما عدا ذلك <span className="font-bold">تراجعه أنت</span>{" "}
          كلمةً كلمة قبل التطبيق.
          <span className="text-gray-500">
            {" "}
            لا شيء يُكتب على النص قبل ضغطك «طبّق».
          </span>
        </p>
      </div>

      {/* الإعدادات */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center gap-3 flex-wrap">
        <span className="text-sm font-semibold text-gray-800">النموذج</span>
        {models.length > 0 ? (
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            dir="ltr"
            className="px-3 py-2 rounded-xl border border-gray-200 text-sm outline-none focus:border-brand bg-white text-gray-800"
          >
            {models.map((m) => (
              <option key={m} value={m} className="bg-white text-gray-800">
                {m}
              </option>
            ))}
          </select>
        ) : (
          <input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            dir="ltr"
            placeholder="gemini-2.5-flash-lite"
            className="px-3 py-2 rounded-xl border border-gray-200 text-sm outline-none focus:border-brand font-mono w-64"
          />
        )}
        {geminiReady === false && (
          <span className="text-xs text-red-600 flex items-center gap-1.5">
            <AlertTriangle size={13} /> GEMINI_API_KEY غير مضبوط في الخادم
          </span>
        )}

        {learnedCount > 0 && (
          <span
            title="تصحيحات قبِلتَها سابقاً — تُقدَّم للنموذج استئناساً لا قاعدة"
            className="text-xs text-brand bg-brand/10 border border-brand/20 rounded-lg px-2.5 py-1.5"
          >
            {learnedCount} تصحيحاً متعلَّماً
          </span>
        )}

        {!modelLocked && (
          <span className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-1.5">
            اختر النموذج ثم ابدأ
          </span>
        )}

        <span className="text-sm text-gray-500 mr-auto">
          {counts.applied} مطبَّق · {counts.done} بانتظار المراجعة · من{" "}
          {counts.total}
        </span>

        {running ? (
          <button
            onClick={() => {
              stopRef.current = true;
            }}
            className="text-sm font-bold text-red-600 border border-red-200 bg-red-50 rounded-xl px-4 py-2.5 flex items-center gap-2"
          >
            <Square size={15} /> أوقف
          </button>
        ) : (
          <button
            onClick={() => {
              setModelLocked(true);
              checkAll();
            }}
            disabled={geminiReady === false || !model}
            title={model ? "" : "اختر النموذج أولاً"}
            className="bg-brand text-white text-sm font-bold rounded-xl px-5 py-2.5 flex items-center gap-2 disabled:opacity-40"
          >
            <Play size={15} /> دقّق الكل
          </button>
        )}
      </div>

      {/* الملفات */}
      <div className="flex flex-col gap-2">
        {scanned.map((l, i) => {
          const r = reports[l.id] || {};
          const nAcc = r.accepted?.length || 0;
          const nRej = r.rejected?.length || 0;
          return (
            <div
              key={l.id}
              className={`bg-white rounded-xl border p-3.5 ${
                r.status === "error" ? "border-red-200" : "border-gray-100"
              }`}
            >
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-xs font-bold text-gray-400 w-5">{i + 1}</span>
                <span className="text-sm font-semibold text-gray-800 truncate max-w-[220px]">
                  {l.name}
                </span>
                <span className="text-xs text-gray-400">
                  {markdown[l.id]?.split("\n").length.toLocaleString("ar-EG")} سطر
                </span>

                {r.status === "done" && (
                  <span className="text-xs text-gray-600">
                    {nAcc} مقترح
                    {nRej > 0 && (
                      <span className="text-gray-400"> · {nRej} مرفوض آلياً</span>
                    )}
                  </span>
                )}
                {r.status === "applied" && (
                  <span className="text-xs text-green-700 flex items-center gap-1.5">
                    <CheckCircle2 size={13} /> طُبِّق {r.appliedCount} تصحيح
                  </span>
                )}
                {r.progress && (
                  <span className="text-xs text-blue-600 flex items-center gap-1.5">
                    <Loader2 size={12} className="animate-spin" />
                    {r.progress.waiting
                      ? `تجاوز الحصة — انتظار ${r.progress.waiting} ث`
                      : `دفعة ${r.progress.done + 1} من ${r.progress.total}`}
                  </span>
                )}

                <div className="mr-auto flex items-center gap-2">
                  {(r.status === "done" || r.status === "applied") && nAcc + nRej > 0 && (
                    <button
                      onClick={() => setReviewing(l.id)}
                      className="text-xs font-medium text-brand bg-brand/10 rounded-lg px-3 py-1.5"
                    >
                      عرض نتيجة التدقيق
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setModelLocked(true);
                      checkOne(l);
                    }}
                    disabled={
                      running ||
                      r.status === "running" ||
                      geminiReady === false ||
                      !model
                    }
                    title={model ? "" : "اختر النموذج أولاً"}
                    className="text-xs text-gray-600 border border-gray-200 rounded-lg px-3 py-1.5 flex items-center gap-1.5 disabled:opacity-40"
                  >
                    {r.status === "running" ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : (
                      <RotateCw size={13} />
                    )}
                    {r.status ? "أعد التدقيق" : "دقّق"}
                  </button>
                </div>
              </div>

              {r.status === "done" && nAcc === 0 && nRej === 0 && (
                <p className="text-xs text-green-700 mt-2">
                  لم يُعثر على أخطاء إملائية
                </p>
              )}
              {r.error && (
                <p className="text-xs text-red-600 mt-2 flex items-start gap-1.5">
                  <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                  {r.error}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center gap-3">
        <p className="text-sm text-gray-500">
          يمكنك المتابعة الآن — التدقيق اختياري
        </p>
        <button
          onClick={() => dispatch({ type: "step", step: "review" })}
          disabled={running}
          className="mr-auto bg-brand text-white text-sm font-bold rounded-xl px-6 py-2.5 disabled:opacity-40 flex items-center gap-2"
        >
          <ArrowLeft size={16} /> متابعة إلى المراجعة النهائية
        </button>
      </div>

      {/* مراجعة التصحيحات */}
      {rep && (
        <ReviewModal
          name={lectures.find((l) => l.id === reviewing)?.name}
          text={markdown[reviewing]}
          originalText={original?.[reviewing]}
          report={rep}
          onField={(key, field, v) => setField(reviewing, key, field, v)}
          onApply={() => applyFor(reviewing)}
          onClose={() => setReviewing(null)}
        />
      )}
    </div>
  );
}

// ─── نافذة المراجعة ───────────────────────────────────────────────────────────
// كل كلمة: «سابقاً» و«الآن» قابلة للتعديل. المرفوض آلياً معروضٌ أيضاً بسببه —
// القاعدة قد تخطئ في حالةٍ بعينها، والقرار الأخير لك.

const Row = ({ c, text, onField, onFocusWord, muted }) => {
  const line = String(text || "").split("\n")[Number(c.line)] || "";
  const idx = line.indexOf(c.before);
  const head = idx >= 0 ? line.slice(0, idx) : "";
  const tail = idx >= 0 ? line.slice(idx + c.before.length) : "";

  return (
    <div
      className={`grid grid-cols-[auto_1fr_auto_1fr] gap-2.5 items-start px-3 py-2.5 border-b border-gray-100 ${
        muted ? "bg-gray-50/60" : ""
      }`}
    >
      <button
        onClick={() => onField(c.key, "on", !c.on)}
        title={c.on ? "لن يُطبَّق" : "سيُطبَّق"}
        className={`w-6 h-6 mt-1 rounded-md flex items-center justify-center shrink-0 ${
          c.on
            ? "bg-green-500 text-white"
            : "bg-gray-200 text-gray-400 hover:bg-gray-300"
        }`}
      >
        {c.on && <Check size={14} />}
      </button>

      <div className="min-w-0" onMouseEnter={() => onFocusWord?.(c.before)}>
        <button
          onClick={() => onFocusWord?.(c.before)}
          title="أبرزها في الأصل"
          className="block text-sm font-semibold text-red-700 line-through text-right hover:text-red-900"
        >
          {c.before}
        </button>
        {/* السطر كاملاً بلا قصّ: الحكم على تصحيحٍ إملائي يحتاج الجملة
            التي وردت فيها الكلمة، لا أوّل كلماتها. */}
        <span
          className="block text-xs text-gray-600 leading-7 mt-1 font-arabic"
          dir="rtl"
        >
          <span className="text-gray-400">سطر {c.line}: </span>
          {idx >= 0 ? (
            <>
              {head}
              <mark className="bg-amber-200 rounded px-0.5">{c.before}</mark>
              {tail}
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

const ReviewModal = ({
  name,
  text,
  originalText,
  report,
  onField,
  onApply,
  onClose,
}) => {
  const [showRejected, setShowRejected] = useState(false);
  const [showOriginal, setShowOriginal] = useState(true);
  // الكلمة التي تنظر إليها الآن — تُبرَز في الأصل تلقائياً
  const [focusWord, setFocusWord] = useState("");
  const accepted = report.accepted || [];
  const rejected = report.rejected || [];
  const chosen = [...accepted, ...rejected].filter(
    (c) => c.on && String(c.after || "").trim() && c.after !== c.before,
  ).length;

  return (
    <div
      className="fixed inset-0 bg-black/45 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        dir="rtl"
        className="bg-white rounded-2xl w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 p-4 border-b border-gray-100">
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-bold text-gray-800 truncate">{name}</h3>
            <p className="text-xs text-gray-400">
              {accepted.length} مقترح · {rejected.length} مرفوض آلياً · اختير{" "}
              {chosen}
            </p>
          </div>
          <button
            onClick={() => setShowOriginal((v) => !v)}
            className={`text-xs font-semibold rounded-lg px-3 py-2 border ${
              showOriginal
                ? "bg-brand text-white border-transparent"
                : "bg-brand/10 text-brand border-brand/30"
            }`}
          >
            الأصل
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 flex overflow-hidden">
        <div className={`${showOriginal ? "w-3/5" : "w-full"} overflow-y-auto`}>
          <div className="grid grid-cols-[auto_1fr_auto_1fr] gap-2.5 px-3 py-2 bg-gray-50 border-b border-gray-200 text-[11px] font-bold text-gray-500 sticky top-0">
            <span className="w-6" />
            <span>سابقاً</span>
            <span />
            <span>الآن — عدّله كما تشاء</span>
          </div>

          {accepted.length === 0 && (
            <p className="text-sm text-gray-500 text-center py-10">
              لا اقتراحات مقبولة
            </p>
          )}
          {accepted.map((c) => (
            <Row
              key={c.key}
              c={c}
              text={text}
              onField={onField}
              onFocusWord={setFocusWord}
            />
          ))}

          {rejected.length > 0 && (
            <>
              <button
                onClick={() => setShowRejected((v) => !v)}
                className="w-full flex items-center gap-2 px-3 py-2.5 bg-gray-50 text-xs font-semibold text-gray-600 hover:bg-gray-100 border-y border-gray-200"
              >
                <ChevronDown
                  size={14}
                  className={showRejected ? "" : "-rotate-90"}
                />
                {rejected.length} اقتراحاً رفضته القواعد
                <span className="font-normal text-gray-400">
                  — اعرضها إن أردت نقض الرفض
                </span>
              </button>
              {showRejected &&
                rejected.map((c) => (
                  <Row
                    key={c.key}
                    c={c}
                    text={text}
                    onField={onField}
                    onFocusWord={setFocusWord}
                    muted
                  />
                ))}
            </>
          )}
        </div>

        {showOriginal && (
          <div className="w-2/5 border-r border-gray-200 bg-gray-50">
            <OriginalPane text={originalText} highlight={focusWord} />
          </div>
        )}
        </div>

        <div className="p-4 border-t border-gray-100 flex items-center gap-3">
          <button
            onClick={onClose}
            className="text-sm text-gray-600 border border-gray-200 rounded-xl px-4 py-2.5 flex items-center gap-2"
          >
            <Undo2 size={15} /> أغلق بلا تطبيق
          </button>
          <button
            onClick={onApply}
            disabled={chosen === 0}
            className="mr-auto bg-brand text-white text-sm font-bold rounded-xl px-6 py-2.5 disabled:opacity-40 flex items-center gap-2"
          >
            <Check size={16} /> طبّق {chosen} تصحيحاً
          </button>
        </div>
      </div>
    </div>
  );
};
