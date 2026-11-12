import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { API_BASE_URL, PASSWORD } from "../../config";
import { createPortal } from "react-dom";
import {
  Workflow,
  X,
  FileUp,
  Files,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Square,
  CheckSquare,
  Play,
  KeyRound,
  SpellCheck2,
  Trash2,
} from "lucide-react";
import { completedCount } from "./v2api";
import { DEFAULT_GEMINI_MODEL } from "../production/components/AiActions";
import {
  ClaudeModelPicker,
  claudeDisabledReason,
  useClaudePrefs,
  useClaudeStatus,
} from "../production/components/ClaudeModelPicker";
import { ToolBtn } from "../production/components/ToolBtn";
import { getFocusDefault } from "../production/lib/focusDefaults";
import {
  STEP_KEYS,
  STEP_LABELS,
  discardReview,
  openReview,
  retryBulk,
  startBulk,
  stopBulk,
  useBulkView,
  usePendingReviews,
} from "./bulkEngine";

// ─── معالجة كل المحاضرات ──────────────────────────────────────────────────────
// الإعداد هنا، والعمل كلّه في `bulkEngine.js` بالخلفية: إغلاق النافذة لا يوقفه.
//   مسح ← حفظ النص فوراً ← تدقيق بالخلفية ← صوت + علامة نابضة بجانب المحاضرة
//   ← مراجعتك و«طبّق» ← بطاقات وتحريري (Gemini) وملخص وأسئلة (Claude)
//   بالتوازي، وكلٌّ يُحفظ لحظة جاهزيته.
// كل خطوة تُطفأ لمحاضرةٍ بعينها أو للكل من رأس عمودها.

const MISTRAL_KEY_STORE = "mistral_api_key";
// نموذجا Gemini المختاران — يُتذكَّران في هذا الجهاز
const GEMINI_PREFS_STORE = "bulk_gemini_models_v1";
const readGeminiPrefs = () => {
  try {
    return JSON.parse(localStorage.getItem(GEMINI_PREFS_STORE) || "{}") || {};
  } catch {
    return {};
  }
};

// القيم المبدئية نفسها في نوافذ التوليد المفردة — موضوع التركيز كما جُدِّد
// آخر مرة من زرّ «تجديد» (يُقرأ عند فتح النافذة لا عند تحميل الصفحة)
const defaults = () => ({
  flashFocus: getFocusDefault("flash"),
  flashCount: 35,
  writtenFocus: getFocusDefault("written"),
  writtenCount: 12,
  mcqCount: 40,
  steps: Object.fromEntries(STEP_KEYS.map((k) => [k, true])),
});

const normName = (s) =>
  String(s || "")
    .replace(/\.pdf$/i, "")
    .replace(/[ً-ْٰـ]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[_\-.()[\]]+/g, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const CHIP = {
  off: "bg-gray-50 text-gray-300 line-through",
  wait: "bg-gray-100 text-gray-500",
  run: "bg-brand text-white font-bold",
  done: "bg-green-100 text-green-700",
  err: "bg-red-100 text-red-700 font-bold",
  review: "bg-amber-100 text-amber-800 font-bold",
};

const hasAny = (r) => STEP_KEYS.some((k) => r.steps[k]);
const rowProblem = (r) => {
  if (!hasAny(r)) return "كل الخطوات مطفأة — لن تُعالَج";
  if (r.steps.ocr && !r.file) return "المسح مفعَّل بلا ملف — اختر ملفاً، أو أطفئ المسح ليُستعمل النص المحفوظ";
  return null;
};

export default function BulkProcessor({ subjectId, subjectName, lectures }) {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState("setup"); // setup | run
  const [rows, setRows] = useState([]);
  const [apiKey, setApiKey] = useState(() => localStorage.getItem(MISTRAL_KEY_STORE) || "");
  const [unmatched, setUnmatched] = useState([]);
  const [geminiModels, setGeminiModels] = useState([]);
  const [spellModel, setSpellModel] = useState(() => readGeminiPrefs().spell || DEFAULT_GEMINI_MODEL);
  const [genModel, setGenModel] = useState(() => readGeminiPrefs().gen || DEFAULT_GEMINI_MODEL);

  const status = useClaudeStatus();
  const prefs = useClaudePrefs(status);
  const view = useBulkView(subjectId);
  const pending = usePendingReviews(subjectId);

  useEffect(() => {
    if (apiKey) localStorage.setItem(MISTRAL_KEY_STORE, apiKey);
  }, [apiKey]);

  useEffect(() => {
    try {
      localStorage.setItem(GEMINI_PREFS_STORE, JSON.stringify({ spell: spellModel, gen: genModel }));
    } catch {
      /* لا تخزين — يبقى الاختيار لهذه الجلسة */
    }
  }, [spellModel, genModel]);

  // قائمة النماذج من حساب Gemini نفسه — تُجلب عند أول فتحٍ للإعداد
  useEffect(() => {
    if (!open || phase !== "setup" || geminiModels.length) return;
    axios
      .post(`${API_BASE_URL}/production/gemini-models`, { PASSWORD })
      .then((r) => setGeminiModels(r.data?.models || []))
      .catch(() => setGeminiModels([]));
  }, [open, phase, geminiModels.length]);
  // المختار يظهر في القائمة دائماً حتى إن لم يُرجعه الحساب
  const modelOptions = useMemo(
    () => [...new Set([DEFAULT_GEMINI_MODEL, spellModel, genModel, ...geminiModels])],
    [geminiModels, spellModel, genModel],
  );

  const order = view.order || [];
  const jobsView = view.jobs || {};
  const stepsOf = (lid) => Object.values(jobsView[lid]?.steps || {});
  const busy = order.some((lid) => stepsOf(lid).some((s) => s === "run" || s === "wait"));
  const doneCount = order.filter((lid) => {
    const s = stepsOf(lid);
    return s.length && s.every((x) => x === "done" || x === "off");
  }).length;
  const pendingIds = Object.keys(pending);
  const errorCount = order.filter((lid) => stepsOf(lid).includes("err")).length;

  const openWindow = () => {
    if (order.length || pendingIds.length) {
      setPhase("run");
      setOpen(true);
      return;
    }
    newSetup();
  };

  const newSetup = () => {
    setRows(
      lectures.map((l) => ({
        lecture_id: l.lecture_id,
        name: l.name || "بلا اسم",
        filled: completedCount(l),
        // مشمولة بالمعالجة؟ كلها افتراضياً، وتُستثنى بإلغاء علامتها
        include: true,
        file: null,
        ...defaults(),
      })),
    );
    setUnmatched([]);
    setPhase("setup");
    setOpen(true);
  };

  const setRow = (id, patch) =>
    setRows((rs) => rs.map((r) => (r.lecture_id === id ? { ...r, ...patch } : r)));
  const setRowStep = (id, key, on) =>
    setRows((rs) =>
      rs.map((r) => (r.lecture_id === id ? { ...r, steps: { ...r.steps, [key]: on } } : r)),
    );

  const readFile = async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) });

  // ملفات متعددة دفعةً واحدة: تُطابَق بأسماء المحاضرات (ناتج «تقسيم المقرر»
  // يحمل أسماءها حرفياً)، وما لا يطابق يُعرض ليُسند يدوياً
  const pickMany = async (files) => {
    const left = [];
    const byName = {};
    for (const f of files) {
      const n = normName(f.name);
      const match = rows.find(
        (r) =>
          !byName[r.lecture_id] &&
          (normName(r.name) === n || (n && normName(r.name).includes(n)) || (n && n.includes(normName(r.name)))),
      );
      // eslint-disable-next-line no-await-in-loop
      if (match) byName[match.lecture_id] = await readFile(f);
      else left.push(f.name);
    }
    setRows((rs) => rs.map((r) => (byName[r.lecture_id] ? { ...r, file: byName[r.lecture_id] } : r)));
    setUnmatched(left);
  };

  // «للكل» يسري على المشمولة وحدها — المستثناة لن تُعالَج فلا معنى لتغييرها
  const applyDefaultsToAll = (field, value) =>
    setRows((rs) => rs.map((r) => (r.include ? { ...r, [field]: value } : r)));
  const setIncludeAll = (fn) => setRows((rs) => rs.map((r) => ({ ...r, include: fn(r) })));
  const included = rows.filter((r) => r.include);
  // رأس العمود: إن كانت الخطوة مفعّلةً في كل المشمولة أُطفئت فيها، وإلا فُعّلت
  const stepAllOn = (k) => included.length > 0 && included.every((r) => r.steps[k]);
  const toggleStepAll = (k) => {
    const on = !stepAllOn(k);
    setRows((rs) => rs.map((r) => (r.include ? { ...r, steps: { ...r.steps, [k]: on } } : r)));
  };

  const jobs = included.filter((r) => !rowProblem(r));
  const skipped = included.length - jobs.length;
  const excludedCount = rows.length - included.length;
  const allIncluded = rows.length > 0 && excludedCount === 0;
  const needOcr = jobs.some((j) => j.steps.ocr);
  const needClaude = jobs.some((j) => j.steps.summary || j.steps.mcq);
  const claudeReason = needClaude ? claudeDisabledReason(status) : null;
  const canStart =
    jobs.length > 0 &&
    !busy &&
    (!needOcr || apiKey.trim()) &&
    (!needClaude || (!claudeReason && prefs.model && prefs.effort));

  const start = () => {
    startBulk({
      subjectId,
      subjectName,
      apiKey: apiKey.trim(),
      cfg: { model: prefs.model, effort: prefs.effort, mode: prefs.mode, spellModel, genModel },
      jobs: jobs.map((j) => ({
        lecture_id: j.lecture_id,
        name: j.name,
        file: j.steps.ocr ? j.file : null,
        steps: j.steps,
        flashFocus: j.flashFocus,
        flashCount: j.flashCount,
        writtenFocus: j.writtenFocus,
        writtenCount: j.writtenCount,
        mcqCount: j.mcqCount,
      })),
    });
    setPhase("run");
  };

  const stopAll = () => {
    if (!window.confirm("إيقاف المعالجة؟ ما حُفظ يبقى محفوظاً، والجاري يتوقف عند أول فرصة.")) return;
    stopBulk(subjectId);
  };

  // المراجعات المعلّقة بعد تحديث الصفحة قد لا تكون في قائمة التشغيل الحالية
  const runList = useMemo(() => {
    const ids = [...order];
    pendingIds.forEach((id) => {
      if (!ids.includes(id)) ids.push(id);
    });
    return ids;
  }, [order, pendingIds]);

  const lectureName = (lid) =>
    jobsView[lid]?.name || pending[lid]?.name || lectures.find((l) => l.lecture_id === lid)?.name || "محاضرة";

  return (
    <>
      <ToolBtn
        icon={Workflow}
        busy={busy}
        color="#8C52FF"
        onClick={openWindow}
        disabled={!lectures.length}
        title={lectures.length ? "مسح وتدقيق وتوليد وحفظ لكل المحاضرات" : "لا محاضرات"}
      >
        {busy
          ? `معالجة جارية (${doneCount}/${order.length})`
          : pendingIds.length
            ? `معالجة — ${pendingIds.length} بانتظار المراجعة`
            : "معالجة كل المحاضرات"}
      </ToolBtn>

      {/* بوابةٌ إلى body: الزرّ في ترويسةٍ ذات backdrop-blur، وهذه تحصر أي
          عنصر fixed داخلها فيها بدل ملء الشاشة */}
      {open && createPortal(
        <div className="fixed inset-0 bg-white z-40 flex flex-col" dir="rtl">
          {/* الترويسة */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200">
            <Workflow size={18} className="text-brand" />
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-bold text-gray-800">معالجة كل المحاضرات — {subjectName}</h3>
              <p className="text-xs text-gray-400">
                {phase === "setup"
                  ? "اختر المحاضرات وخطوات كلٍّ منها، ثم ابدأ. العمل يجري بالخلفية — أغلق النافذة وتابع عملك."
                  : `اكتمل ${doneCount} · بانتظار المراجعة ${pendingIds.length} · فشل ${errorCount} — من ${runList.length}. إغلاق النافذة لا يوقف المعالجة.`}
              </p>
            </div>
            {phase === "run" && busy && (
              <button
                onClick={stopAll}
                className="text-xs font-semibold text-red-600 border border-red-200 rounded-lg px-3 py-1.5 flex items-center gap-1.5"
              >
                <Square size={13} /> إيقاف
              </button>
            )}
            {phase === "run" && !busy && (
              <button
                onClick={newSetup}
                className="text-xs font-semibold text-brand border border-brand/30 rounded-lg px-3 py-1.5"
              >
                إعداد جديد
              </button>
            )}
            <button onClick={() => setOpen(false)} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100">
              <X size={18} />
            </button>
          </div>

          {phase === "setup" ? (
            <>
              {/* الإعدادات العامة */}
              <div className="px-4 py-3 border-b border-gray-100 flex items-end gap-3 flex-wrap bg-gray-50">
                <label className="flex flex-col gap-1 text-xs text-gray-500">
                  <span className="flex items-center gap-1">
                    <KeyRound size={12} /> مفتاح Mistral (للمسح)
                  </span>
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    dir="ltr"
                    className="w-56 border border-gray-300 rounded-lg p-2 text-sm"
                  />
                </label>
                <ClaudeModelPicker status={status} prefs={prefs} />
                {[
                  ["Gemini — التدقيق", spellModel, setSpellModel],
                  ["Gemini — البطاقات والتحريري", genModel, setGenModel],
                ].map(([label, value, set]) => (
                  <label key={label} className="flex flex-col gap-1 text-xs text-gray-500">
                    {label}
                    <select
                      value={value}
                      onChange={(e) => set(e.target.value)}
                      dir="ltr"
                      className="border border-gray-300 rounded-lg p-2 text-sm bg-white min-w-[12rem]"
                    >
                      {modelOptions.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
                <label className="cursor-pointer text-sm font-semibold text-brand border border-brand/30 bg-white rounded-lg px-3 py-2 flex items-center gap-1.5">
                  <Files size={15} /> اختيار ملفات متعددة
                  <input
                    type="file"
                    accept="application/pdf,.pdf"
                    multiple
                    className="hidden"
                    onChange={async (e) => {
                      const fs = [...(e.target.files || [])];
                      e.target.value = "";
                      if (fs.length) await pickMany(fs);
                    }}
                  />
                </label>
                <p className="text-[11px] text-gray-400 max-w-xs">
                  الملفات المتعددة تُطابَق بأسماء المحاضرات تلقائياً. أطفئ «مسح» لمحاضرةٍ ليُستعمل
                  نصّها المحفوظ.
                </p>
              </div>
              {claudeReason && (
                <p className="mx-4 mt-2 text-xs text-red-600">{claudeReason}</p>
              )}
              {unmatched.length > 0 && (
                <p className="mx-4 mt-2 text-xs text-amber-700">
                  لم تُطابَق: {unmatched.join("، ")} — أسندها يدوياً من عمود الملف
                </p>
              )}

              {/* جدول المحاضرات */}
              <div className="flex-1 overflow-auto p-4">
                <div className="flex items-center gap-2 flex-wrap mb-2 text-xs">
                  <span className="text-gray-500">المحاضرات المشمولة:</span>
                  <button
                    onClick={() => setIncludeAll(() => true)}
                    className="rounded-lg border border-gray-200 px-2.5 py-1 hover:bg-gray-50"
                  >
                    تحديد الكل
                  </button>
                  <button
                    onClick={() => setIncludeAll(() => false)}
                    className="rounded-lg border border-gray-200 px-2.5 py-1 hover:bg-gray-50"
                  >
                    إلغاء الكل
                  </button>
                  <button
                    onClick={() => setIncludeAll((r) => !!r.file)}
                    className="rounded-lg border border-gray-200 px-2.5 py-1 hover:bg-gray-50"
                  >
                    ما له ملف فقط
                  </button>
                  <button
                    onClick={() => setIncludeAll((r) => r.filled === 0)}
                    className="rounded-lg border border-gray-200 px-2.5 py-1 hover:bg-gray-50"
                    title="المحاضرات التي لا محتوى فيها بعد — تحمي المكتمل من الاستبدال"
                  >
                    الفارغة فقط
                  </button>
                  <span className="text-gray-400">
                    {included.length} من {rows.length}
                  </span>
                </div>
                <table className="w-full text-sm border-separate border-spacing-y-1.5 min-w-[1300px]">
                  <thead>
                    <tr className="text-[11px] text-gray-500 text-right">
                      <th className="px-2 w-8">
                        <button
                          onClick={() => setIncludeAll(() => !allIncluded)}
                          title={allIncluded ? "إلغاء الكل" : "تحديد الكل"}
                          className="flex items-center"
                        >
                          {allIncluded ? (
                            <CheckSquare size={16} className="text-brand" />
                          ) : (
                            <Square size={16} className="text-gray-400" />
                          )}
                        </button>
                      </th>
                      <th className="font-bold px-2">المحاضرة</th>
                      <th className="font-bold px-2">الملف</th>
                      <th className="font-bold px-2">الخطوات</th>
                      <th className="font-bold px-2">تركيز البطاقات</th>
                      <th className="font-bold px-2 w-16">عدد البطاقات</th>
                      <th className="font-bold px-2">تركيز التحريري</th>
                      <th className="font-bold px-2 w-16">أسئلة التحريري</th>
                      <th className="font-bold px-2 w-16">أسئلة MCQ</th>
                    </tr>
                    {/* صفّ «للكل»: يسري على كل المشمولة */}
                    <tr className="text-[11px]">
                      <td className="px-2 text-gray-400" colSpan={3}>
                        تطبيق على كل المشمولة ←
                      </td>
                      <td className="px-1">
                        <div className="flex flex-wrap gap-1">
                          {STEP_KEYS.map((k) => (
                            <button
                              key={k}
                              onClick={() => toggleStepAll(k)}
                              title={stepAllOn(k) ? `أطفئ «${STEP_LABELS[k]}» في الكل` : `فعّل «${STEP_LABELS[k]}» في الكل`}
                              className={`rounded-full px-2 py-0.5 border border-dashed ${
                                stepAllOn(k)
                                  ? "border-brand/40 text-brand"
                                  : "border-gray-300 text-gray-400 line-through"
                              }`}
                            >
                              {STEP_LABELS[k]}
                            </button>
                          ))}
                        </div>
                      </td>
                      {[
                        ["flashFocus", "text"],
                        ["flashCount", "number"],
                        ["writtenFocus", "text"],
                        ["writtenCount", "number"],
                        ["mcqCount", "number"],
                      ].map(([f, t]) => (
                        <td key={f} className="px-1">
                          <input
                            type={t}
                            placeholder="للكل"
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && e.currentTarget.value !== "") {
                                applyDefaultsToAll(f, t === "number" ? Number(e.currentTarget.value) : e.currentTarget.value);
                              }
                            }}
                            onBlur={(e) => {
                              if (e.currentTarget.value !== "") {
                                applyDefaultsToAll(f, t === "number" ? Number(e.currentTarget.value) : e.currentTarget.value);
                                e.currentTarget.value = "";
                              }
                            }}
                            className="w-full border border-dashed border-gray-300 rounded-lg p-1.5 text-xs bg-gray-50"
                          />
                        </td>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const problem = r.include ? rowProblem(r) : null;
                      return (
                        <tr
                          key={r.lecture_id}
                          className={!r.include ? "opacity-40" : problem ? "opacity-80" : "bg-brand/[0.03]"}
                        >
                          <td className="px-2 py-1.5 rounded-r-lg">
                            <button
                              onClick={() => setRow(r.lecture_id, { include: !r.include })}
                              title={r.include ? "استثناء من المعالجة" : "شمول بالمعالجة"}
                              className="flex items-center"
                            >
                              {r.include ? (
                                <CheckSquare size={16} className="text-brand" />
                              ) : (
                                <Square size={16} className="text-gray-400" />
                              )}
                            </button>
                          </td>
                          <td className="px-2 py-1.5">
                            <p className="font-semibold text-gray-800 font-arabic">{r.name}</p>
                            {!r.include ? (
                              <p className="text-[10px] text-gray-500">مستثناة — لن تُمسّ</p>
                            ) : problem ? (
                              <p className="text-[10px] text-red-500">{problem}</p>
                            ) : (
                              r.filled > 0 && (
                                <p className="text-[10px] text-amber-700">
                                  فيها محتوى ({r.filled}/5) — المفعَّل يُستبدل
                                </p>
                              )
                            )}
                          </td>
                          <td className="px-2">
                            <label className="cursor-pointer text-xs border border-gray-200 bg-white rounded-lg px-2.5 py-1.5 flex items-center gap-1.5 max-w-[12rem]">
                              <FileUp size={13} className={r.file ? "text-green-600" : "text-gray-400"} />
                              <span className="truncate">{r.file ? r.file.name : "اختر ملفاً"}</span>
                              <input
                                type="file"
                                accept="application/pdf,.pdf"
                                className="hidden"
                                onChange={async (e) => {
                                  const f = e.target.files?.[0];
                                  e.target.value = "";
                                  // اختيار ملفٍ لها نيّةُ معالجتها — تُشمل تلقائياً
                                  if (f) setRow(r.lecture_id, { file: await readFile(f), include: true });
                                }}
                              />
                            </label>
                          </td>
                          <td className="px-1">
                            <div className="flex flex-wrap gap-1">
                              {STEP_KEYS.map((k) => (
                                <button
                                  key={k}
                                  onClick={() => setRowStep(r.lecture_id, k, !r.steps[k])}
                                  title={r.steps[k] ? `أطفئ «${STEP_LABELS[k]}» لهذه المحاضرة` : `فعّل «${STEP_LABELS[k]}»`}
                                  className={`text-[11px] rounded-full px-2 py-0.5 ${
                                    r.steps[k]
                                      ? "bg-brand/10 text-brand font-semibold"
                                      : "bg-gray-50 text-gray-300 line-through"
                                  }`}
                                >
                                  {STEP_LABELS[k]}
                                </button>
                              ))}
                            </div>
                          </td>
                          <td className="px-1">
                            <input
                              value={r.flashFocus}
                              disabled={!r.steps.flash}
                              onChange={(e) => setRow(r.lecture_id, { flashFocus: e.target.value })}
                              className="w-full border border-gray-300 rounded-lg p-1.5 text-xs font-arabic disabled:opacity-30"
                            />
                          </td>
                          <td className="px-1">
                            <input
                              type="number"
                              min={1}
                              max={50}
                              value={r.flashCount}
                              disabled={!r.steps.flash}
                              onChange={(e) => setRow(r.lecture_id, { flashCount: e.target.value })}
                              className="w-full border border-gray-300 rounded-lg p-1.5 text-xs text-center disabled:opacity-30"
                            />
                          </td>
                          <td className="px-1">
                            <input
                              value={r.writtenFocus}
                              disabled={!r.steps.written}
                              onChange={(e) => setRow(r.lecture_id, { writtenFocus: e.target.value })}
                              className="w-full border border-gray-300 rounded-lg p-1.5 text-xs font-arabic disabled:opacity-30"
                            />
                          </td>
                          <td className="px-1">
                            <input
                              type="number"
                              min={1}
                              max={50}
                              value={r.writtenCount}
                              disabled={!r.steps.written}
                              onChange={(e) => setRow(r.lecture_id, { writtenCount: e.target.value })}
                              className="w-full border border-gray-300 rounded-lg p-1.5 text-xs text-center disabled:opacity-30"
                            />
                          </td>
                          <td className="px-1 rounded-l-lg">
                            <input
                              type="number"
                              min={1}
                              max={200}
                              value={r.mcqCount}
                              disabled={!r.steps.mcq}
                              onChange={(e) => setRow(r.lecture_id, { mcqCount: e.target.value })}
                              className="w-full border border-gray-300 rounded-lg p-1.5 text-xs text-center disabled:opacity-30"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="px-4 py-3 border-t border-gray-200 flex items-center gap-3">
                <p className="text-xs text-gray-500 flex-1">
                  <span className="font-semibold text-gray-700">{jobs.length} محاضرة ستُعالَج</span>
                  {skipped > 0 && ` · ${skipped} مشمولة ستُتخطّى (انظر سببها)`}
                  {excludedCount > 0 && ` · ${excludedCount} مستثناة`}
                  {" — "}المسح والتدقيق بالخلفية؛ حين يجهز تدقيق محاضرة تسمع تنبيهاً وتنبض علامةٌ
                  بجانب اسمها. بعد «طبّق» يبدأ توليدها ويُحفظ كلُّ جزءٍ فور جاهزيته.
                </p>
                <button
                  onClick={start}
                  disabled={!canStart}
                  title={
                    busy
                      ? "معالجةٌ سابقة ما زالت جارية لهذه المادة"
                      : !jobs.length
                        ? "حدّد محاضرةً واحدة على الأقل بخطوةٍ مفعّلة"
                        : needOcr && !apiKey.trim()
                          ? "أدخل مفتاح Mistral"
                          : claudeReason || ""
                  }
                  className="bg-brand text-white text-sm font-bold rounded-xl px-6 py-2.5 disabled:opacity-40 flex items-center gap-2"
                >
                  <Play size={15} /> ابدأ ({jobs.length})
                </button>
              </div>
            </>
          ) : (
            /* ── المتابعة ── */
            <div className="flex-1 overflow-auto p-4 space-y-2">
              {runList.length === 0 && (
                <p className="text-sm text-gray-500">لا معالجة جارية.</p>
              )}
              {runList.map((lid) => {
                const j = jobsView[lid];
                const review = pending[lid];
                const steps = j?.steps || {};
                const vals = Object.values(steps);
                const hasErr = vals.includes("err");
                const finished = vals.length > 0 && vals.every((s) => s === "done" || s === "off");
                return (
                  <div
                    key={lid}
                    className={`rounded-xl border p-3 ${
                      finished
                        ? "border-green-200 bg-green-50/50"
                        : hasErr
                          ? "border-red-200 bg-red-50/50"
                          : review
                            ? "border-amber-200 bg-amber-50/40"
                            : "border-gray-200 bg-white"
                    }`}
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-800 font-arabic min-w-[10rem]">
                        {lectureName(lid)}
                      </span>
                      {j && (
                        <div className="flex items-center gap-1 flex-wrap">
                          {STEP_KEYS.map((k) => (
                            <span
                              key={k}
                              title={j.errors?.[k] || ""}
                              className={`text-[11px] rounded-full px-2 py-0.5 flex items-center gap-1 ${CHIP[steps[k] || "off"]}`}
                            >
                              {steps[k] === "run" && <Loader2 size={10} className="animate-spin" />}
                              {STEP_LABELS[k]}
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="mr-auto flex items-center gap-2">
                        {review && (
                          <>
                            <button
                              onClick={() => openReview(subjectId, lid)}
                              className="text-xs font-bold rounded-lg px-3 py-1.5 bg-amber-500 text-white flex items-center gap-1.5"
                            >
                              <SpellCheck2 size={13} /> راجع التدقيق ({review.count})
                            </button>
                            <button
                              onClick={() => {
                                if (window.confirm("إهمال نتائج التدقيق؟ لن يُطبَّق شيء ولن يبدأ التوليد لهذه المحاضرة.")) {
                                  discardReview(subjectId, lid);
                                }
                              }}
                              title="إهمال المراجعة"
                              className="p-1.5 rounded-lg text-gray-400 hover:text-red-600"
                            >
                              <Trash2 size={14} />
                            </button>
                          </>
                        )}
                        {finished && (
                          <span className="text-xs font-bold text-green-700 flex items-center gap-1">
                            <CheckCircle2 size={14} /> حُفظت
                          </span>
                        )}
                        {hasErr && (
                          <button
                            onClick={() => retryBulk(subjectId, lid)}
                            className="text-xs font-semibold rounded-lg px-3 py-1.5 border border-red-200 text-red-700 bg-white flex items-center gap-1.5"
                          >
                            <RotateCcw size={13} /> إعادة ما فشل
                          </button>
                        )}
                      </div>
                    </div>
                    {j?.note && <p className="text-[11px] text-gray-500 mt-1.5">{j.note}</p>}
                    {Object.entries(j?.errors || {}).map(([k, msg]) => (
                      <p key={k} className="text-xs text-red-600 mt-1.5 flex items-start gap-1.5">
                        <AlertTriangle size={13} className="shrink-0 mt-0.5" /> {STEP_LABELS[k]}: {msg}
                      </p>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>,
        document.body,
      )}
    </>
  );
}
