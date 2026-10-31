import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import axios from "axios";
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
} from "lucide-react";
import { API_BASE_URL, PASSWORD } from "../../config";
import { saveLecture, completedCount } from "./v2api";
import { SpellAction, DEFAULT_GEMINI_MODEL } from "../production/components/AiActions";
import {
  ClaudeModelPicker,
  claudeDisabledReason,
  useClaudePrefs,
  useClaudeStatus,
} from "../production/components/ClaudeModelPicker";
import { ToolBtn } from "../production/components/ToolBtn";
import { scanLecture, checkR2 } from "../production/lib/mistralOcr";
import { generateMcq, generateSummary, claudeError } from "../production/lib/claudeRun";
import { parsePastedQuestions } from "../production/lib/parseQuestions";
import { CostScope } from "../production/lib/costScope";

// ─── معالجة كل المحاضرات ──────────────────────────────────────────────────────
// ملفٌ لكل محاضرة ← مسح ضوئي ← تدقيق (يراجعه المحرِّر) ← ملخّص (Claude) ←
// أسئلة (Claude) ← بطاقات وتحريري (Gemini) ← حفظ.
//
// مساران متوازيان كي لا ينتظر المحرِّر بلا عمل:
//   ① التفاعلي: المسح يتقدّم محاضرةً محاضرة، والتدقيق يُفتح لكلٍّ بالترتيب.
//      المسح يسبق التدقيق، فحين تنتهي من مراجعة محاضرة تكون التالية جاهزة.
//   ② الآلي: ما إن تُطبّق التدقيق حتى تبدأ سلسلة المحاضرة في الخلفية،
//      وأنت تراجع التي بعدها. في Batch قد تطول السلسلة — ولا تعطّل شيئاً.
//
// نصّ المقرَّر يُحفظ فور التدقيق: المسح أغلى ما في السلسلة، وفشل خطوةٍ
// لاحقة لا يضيّعه. وكل خطوةٍ فاشلة تُعاد من مكانها لا من أول السلسلة.

const MISTRAL_KEY_STORE = "mistral_api_key";

// القيم المبدئية نفسها في نوافذ التوليد المفردة
const DEFAULTS = {
  flashFocus: "قلل الأرقام والنسب وركز على المعلومات المهمة",
  flashCount: 35,
  writtenFocus: "تعداد, شرح, مقارنة",
  writtenCount: 12,
  mcqCount: 40,
};

const STEPS = [
  { key: "ocr", label: "مسح" },
  { key: "spell", label: "تدقيق" },
  { key: "save_text", label: "حفظ النص" },
  { key: "summary", label: "ملخص" },
  { key: "mcq", label: "أسئلة" },
  { key: "flash", label: "بطاقات" },
  { key: "written", label: "تحريري" },
  { key: "save", label: "حفظ" },
];
// خطوات السلسلة الآلية — ما بعد التدقيق
const CHAIN = ["save_text", "summary", "mcq", "flash", "written", "save"];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// تنبيه صوتي بلا ملفّات: نغمتان للتدقيق الجاهز، وثلاثٌ صاعدة لمحاضرةٍ حُفظت
const beep = (kind) => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const notes = kind === "done" ? [523, 659, 784] : [880, 660];
    notes.forEach((f, i) => {
      const t = ctx.currentTime + i * 0.2;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.35, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.19);
      o.connect(g).connect(ctx.destination);
      o.start(t);
      o.stop(t + 0.21);
    });
    setTimeout(() => ctx.close(), 1500);
  } catch {
    /* لا صوت متاح — لا شيء */
  }
};

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

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  promise.catch(() => {}); // الرفض يُعالَج حيث يُنتظر
  return { promise, resolve, reject };
};

/** توليد بطاقات أو تحريري بـGemini — يُعاد عند الفشل حتى خمس مرات */
const geminiGenerate = async (kind, text, focus, count, signal, cost) => {
  for (let attempt = 1; ; attempt++) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const r = await axios.post(`${API_BASE_URL}/production/generate`, {
        PASSWORD,
        kind,
        text,
        model: DEFAULT_GEMINI_MODEL,
        focus,
        count: Number(count),
        cost,
      });
      const items = kind === "flash" ? r.data?.cards : r.data?.questions;
      if (!items?.length) throw new Error("لم يُعِد النموذج أي عنصر");
      return items;
    } catch (e) {
      if (signal.cancelled || attempt >= 5) throw e;
      const asked = Number(e?.response?.data?.retryAfter) || 0;
      // eslint-disable-next-line no-await-in-loop
      await sleep(Math.min(90, Math.max(6, asked)) * 1000);
    }
  }
};

export default function BulkProcessor({ subjectId, subjectName, lectures, onLectureSaved }) {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState("setup"); // setup | run
  const [rows, setRows] = useState([]);
  const [apiKey, setApiKey] = useState(() => localStorage.getItem(MISTRAL_KEY_STORE) || "");
  const [unmatched, setUnmatched] = useState([]);
  const [state, setState] = useState({}); // lecture_id → { stage, note, error, failed }
  const [spellJob, setSpellJob] = useState(null);
  const [running, setRunning] = useState(false);

  const status = useClaudeStatus();
  const prefs = useClaudePrefs(status);

  const results = useRef({}); // lecture_id → { text, sections, questions, flash, written }
  const signal = useRef({ cancelled: false });
  const spellTextRef = useRef("");
  const spellResolveRef = useRef(null);
  const configRef = useRef(null); // لقطة الإعداد لحظة البدء

  useEffect(() => {
    if (apiKey) localStorage.setItem(MISTRAL_KEY_STORE, apiKey);
  }, [apiKey]);

  const openSetup = () => {
    if (running) {
      setOpen(true);
      return;
    }
    setRows(
      lectures.map((l) => ({
        lecture_id: l.lecture_id,
        name: l.name || "بلا اسم",
        filled: completedCount(l),
        // مشمولة بالمعالجة؟ كلها افتراضياً، وتُستثنى بإلغاء علامتها
        include: true,
        file: null,
        ...DEFAULTS,
      })),
    );
    setUnmatched([]);
    setState({});
    setPhase("setup");
    setOpen(true);
  };

  const setRow = (id, patch) =>
    setRows((rs) => rs.map((r) => (r.lecture_id === id ? { ...r, ...patch } : r)));

  const patchState = (id, patch) =>
    setState((s) => ({ ...s, [id]: { ...(s[id] || {}), ...patch } }));

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

  // تُعالَج المحاضرة إن كانت مشمولةً ولها ملف
  const jobs = rows.filter((r) => r.include && r.file);
  const includedNoFile = rows.filter((r) => r.include && !r.file).length;
  const excludedCount = rows.filter((r) => !r.include).length;
  const allIncluded = rows.length > 0 && excludedCount === 0;
  const claudeReason = claudeDisabledReason(status);
  const canStart = jobs.length > 0 && apiKey.trim() && !claudeReason && prefs.model && prefs.effort;

  // ── السلسلة الآلية لمحاضرة: تُستأنف من خطوةٍ بعينها ──
  const runChain = async (job, from = "save_text") => {
    const cfg = configRef.current;
    const id = job.lecture_id;
    const res = results.current[id];
    const opts = { signal: signal.current, onStatus: (note) => patchState(id, { note }) };
    const base = {
      model: cfg.model,
      effort: cfg.effort,
      lecture_name: job.name,
      subject_name: subjectName,
      cost: { exam_id: subjectId, lecture_id: id },
    };
    let step = from;
    try {
      for (step of CHAIN.slice(CHAIN.indexOf(from))) {
        if (signal.current.cancelled) throw new Error("أُلغي");
        patchState(id, { stage: step, note: "", error: null, failed: null });
        if (step === "save_text") {
          // eslint-disable-next-line no-await-in-loop
          await saveLecture(subjectId, id, { curriculum: { text: res.text } });
        } else if (step === "summary") {
          // eslint-disable-next-line no-await-in-loop
          const r = await generateSummary(cfg.mode, { ...base, curriculum: res.text }, opts);
          res.sections = r.sections;
        } else if (step === "mcq") {
          // eslint-disable-next-line no-await-in-loop
          const r = await generateMcq(
            cfg.mode,
            { ...base, summary: res.sections, number_of_questions: job.mcqCount },
            opts,
          );
          const qs = parsePastedQuestions(r.text).slice(0, Number(job.mcqCount) || 40);
          if (!qs.length) throw new Error("لم تُستخرج أسئلة من ردّ Claude");
          res.questions = qs.map(({ question, options, answer }) => ({
            question,
            options,
            answer: String(answer),
          }));
        } else if (step === "flash") {
          patchState(id, { note: `Gemini (${DEFAULT_GEMINI_MODEL})` });
          // eslint-disable-next-line no-await-in-loop
          const cards = await geminiGenerate("flash", res.text, job.flashFocus, job.flashCount, signal.current, base.cost);
          res.flash = cards.map((c, i) => ({
            card_id: `${id}_ai${i + 1}`,
            front: c.front,
            back: c.back,
          }));
        } else if (step === "written") {
          patchState(id, { note: `Gemini (${DEFAULT_GEMINI_MODEL})` });
          // eslint-disable-next-line no-await-in-loop
          const qs = await geminiGenerate("written", res.text, job.writtenFocus, job.writtenCount, signal.current, base.cost);
          res.written = qs.map((q, i) => ({
            q_id: `${id}_aiw${i + 1}`,
            question: q.question,
            model_answer: q.model_answer,
          }));
        } else if (step === "save") {
          // eslint-disable-next-line no-await-in-loop
          await saveLecture(subjectId, id, {
            summary: { sections: res.sections },
            questions: res.questions,
            flash_cards: res.flash,
            written_exam: { duration_min: 30, questions: res.written },
          });
        }
      }
      patchState(id, { stage: "done", note: "" });
      beep("done");
      onLectureSaved?.(id);
    } catch (e) {
      patchState(id, { stage: "error", failed: step, error: claudeError(e).message, note: "" });
    }
  };

  // ── التدقيق التفاعلي لمحاضرة: يعود بالنصّ بعد التطبيق (أو كما هو إن أُغلق) ──
  const reviewSpell = (job, text) =>
    new Promise((resolve) => {
      spellTextRef.current = text;
      spellResolveRef.current = resolve;
      setSpellJob({ key: `${job.lecture_id}:${Date.now()}`, id: job.lecture_id, text, bytes: job.file.bytes });
    });

  const start = async () => {
    const cfg = { model: prefs.model, effort: prefs.effort, mode: prefs.mode };
    configRef.current = cfg;
    const list = jobs.map((j) => ({ ...j }));
    signal.current = { cancelled: false };
    results.current = {};
    list.forEach((j) => {
      results.current[j.lecture_id] = {};
    });
    setState(Object.fromEntries(list.map((j) => [j.lecture_id, { stage: "queued" }])));
    setPhase("run");
    setRunning(true);

    const r2 = await checkR2();
    const ocr = list.map(() => deferred());

    // ① المسح يتقدّم وحده محاضرةً محاضرة
    (async () => {
      for (let i = 0; i < list.length; i++) {
        const j = list[i];
        if (signal.current.cancelled) {
          ocr[i].reject(new Error("أُلغي"));
          // eslint-disable-next-line no-continue
          continue;
        }
        patchState(j.lecture_id, { stage: "ocr", note: "" });
        try {
          // eslint-disable-next-line no-await-in-loop
          const r = await scanLecture({
            apiKey: apiKey.trim(),
            subject: subjectName || "مادة",
            name: j.name,
            bytes: j.file.bytes,
            withImages: r2?.ready !== false,
            onStage: (note) => patchState(j.lecture_id, { note }),
            cost: { exam_id: subjectId, lecture_id: j.lecture_id },
          });
          patchState(j.lecture_id, { stage: "ocr_done", note: "بانتظار دوره في التدقيق" });
          ocr[i].resolve(r.markdown);
        } catch (e) {
          patchState(j.lecture_id, {
            stage: "error",
            failed: "ocr",
            error: e?.response?.data?.message || e?.message || "تعذّر المسح",
            note: "",
          });
          ocr[i].reject(e);
        }
      }
    })();

    // ② التدقيق بالترتيب، ثم السلسلة الآلية في الخلفية
    for (let i = 0; i < list.length; i++) {
      const j = list[i];
      let text;
      try {
        // eslint-disable-next-line no-await-in-loop
        text = await ocr[i].promise;
      } catch {
        // eslint-disable-next-line no-continue
        continue; // فشل مسحها — تبقى بخطئها وزرّ إعادتها
      }
      if (signal.current.cancelled) break;
      patchState(j.lecture_id, { stage: "spell", note: "" });
      // eslint-disable-next-line no-await-in-loop
      results.current[j.lecture_id].text = await reviewSpell(j, text);
      runChain(j); // لا ننتظرها: التالية تبدأ تدقيقها الآن
    }
    setRunning(false);
  };

  // إعادة محاضرةٍ فشلت: المسح يُعاد مع تدقيقه، وما بعدهما يُستأنف من مكانه
  const retry = async (job) => {
    const st = state[job.lecture_id];
    if (!st?.failed) return;
    signal.current.cancelled = false;
    if (st.failed === "ocr") {
      patchState(job.lecture_id, { stage: "ocr", error: null, failed: null });
      try {
        const r2 = await checkR2();
        const r = await scanLecture({
          apiKey: apiKey.trim(),
          subject: subjectName || "مادة",
          name: job.name,
          bytes: job.file.bytes,
          withImages: r2?.ready !== false,
          onStage: (note) => patchState(job.lecture_id, { note }),
          cost: { exam_id: subjectId, lecture_id: job.lecture_id },
        });
        if (spellJob) {
          // تدقيقٌ آخر مفتوح الآن — تنتظر دورها بعده
          patchState(job.lecture_id, { stage: "ocr_done", note: "بانتظار انتهاء التدقيق الجاري" });
          while (spellResolveRef.current) {
            // eslint-disable-next-line no-await-in-loop
            await sleep(1000);
          }
        }
        patchState(job.lecture_id, { stage: "spell", note: "" });
        results.current[job.lecture_id] = { text: await reviewSpell(job, r.markdown) };
        runChain(job);
      } catch (e) {
        patchState(job.lecture_id, {
          stage: "error",
          failed: "ocr",
          error: e?.response?.data?.message || e?.message || "تعذّر المسح",
        });
      }
      return;
    }
    runChain(job, st.failed);
  };

  const stopAll = () => {
    if (!window.confirm("إيقاف المعالجة؟ ما حُفظ يبقى محفوظاً، والجاري يتوقف.")) return;
    signal.current.cancelled = true;
  };

  const runJobs = useMemo(() => rows.filter((r) => state[r.lecture_id]), [rows, state]);
  const doneCount = runJobs.filter((r) => state[r.lecture_id]?.stage === "done").length;
  const errorCount = runJobs.filter((r) => state[r.lecture_id]?.stage === "error").length;
  const busyCount = runJobs.length - doneCount - errorCount;

  const close = () => {
    if (phase === "run" && busyCount > 0) {
      if (!window.confirm("المعالجة جارية. إغلاق النافذة يوقفها (ما حُفظ يبقى). إغلاق؟")) return;
      signal.current.cancelled = true;
      // تدقيقٌ مفتوح يُغلق معها — بلا تطبيق
      if (spellResolveRef.current) {
        const resolve = spellResolveRef.current;
        spellResolveRef.current = null;
        setSpellJob(null);
        resolve(spellTextRef.current);
      }
    }
    setOpen(false);
  };

  const stepIndex = (stage) => {
    if (stage === "ocr_done") return 1;
    const i = STEPS.findIndex((s) => s.key === stage);
    return i < 0 ? -1 : i;
  };

  return (
    <>
      <ToolBtn
        icon={Workflow}
        busy={running || busyCount > 0}
        color="#8C52FF"
        onClick={openSetup}
        disabled={!lectures.length}
        title={lectures.length ? "مسح وتدقيق وتوليد وحفظ لكل المحاضرات" : "لا محاضرات"}
      >
        {running || busyCount > 0 ? `معالجة جارية (${doneCount}/${runJobs.length})` : "معالجة كل المحاضرات"}
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
                  ? "اختر ملف كل محاضرة واضبط القيم، ثم ابدأ. المحاضرات بلا ملف تُتخطّى."
                  : `اكتمل ${doneCount} · جارٍ ${busyCount} · فشل ${errorCount} — من ${runJobs.length}`}
              </p>
            </div>
            {phase === "run" && busyCount > 0 && (
              <button
                onClick={stopAll}
                className="text-xs font-semibold text-red-600 border border-red-200 rounded-lg px-3 py-1.5 flex items-center gap-1.5"
              >
                <Square size={13} /> إيقاف
              </button>
            )}
            <button onClick={close} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100">
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
                  الملفات المتعددة تُطابَق بأسماء المحاضرات تلقائياً (ملفات «تقسيم المقرر» تحمل أسماءها).
                  البطاقات والتحريري بـ {DEFAULT_GEMINI_MODEL}.
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
                {/* انتقاء المحاضرات المشمولة */}
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
                    {rows.length - excludedCount} من {rows.length}
                  </span>
                </div>
                <table className="w-full text-sm border-separate border-spacing-y-1.5 min-w-[1100px]">
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
                      <th className="font-bold px-2">تركيز البطاقات</th>
                      <th className="font-bold px-2 w-20">عدد البطاقات</th>
                      <th className="font-bold px-2">تركيز التحريري</th>
                      <th className="font-bold px-2 w-20">أسئلة التحريري</th>
                      <th className="font-bold px-2 w-20">أسئلة MCQ</th>
                    </tr>
                    {/* صفّ «للكل»: تغيير قيمته يسري على كل المحاضرات */}
                    <tr className="text-[11px]">
                      <td className="px-2 text-gray-400" colSpan={3}>
                        تطبيق قيمة على كل المشمولة ←
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
                    {rows.map((r) => (
                      <tr
                        key={r.lecture_id}
                        className={
                          !r.include ? "opacity-40" : r.file ? "bg-brand/[0.03]" : "opacity-80"
                        }
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
                          ) : (
                            r.filled > 0 && (
                              <p className="text-[10px] text-amber-700">فيها محتوى ({r.filled}/5) — سيُستبدل</p>
                            )
                          )}
                          {r.include && !r.file && (
                            <p className="text-[10px] text-red-500">بلا ملف — ستُتخطّى</p>
                          )}
                        </td>
                        <td className="px-2">
                          <label className="cursor-pointer text-xs border border-gray-200 bg-white rounded-lg px-2.5 py-1.5 flex items-center gap-1.5 max-w-[14rem]">
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
                          <input
                            value={r.flashFocus}
                            onChange={(e) => setRow(r.lecture_id, { flashFocus: e.target.value })}
                            className="w-full border border-gray-300 rounded-lg p-1.5 text-xs font-arabic"
                          />
                        </td>
                        <td className="px-1">
                          <input
                            type="number"
                            min={1}
                            max={50}
                            value={r.flashCount}
                            onChange={(e) => setRow(r.lecture_id, { flashCount: e.target.value })}
                            className="w-full border border-gray-300 rounded-lg p-1.5 text-xs text-center"
                          />
                        </td>
                        <td className="px-1">
                          <input
                            value={r.writtenFocus}
                            onChange={(e) => setRow(r.lecture_id, { writtenFocus: e.target.value })}
                            className="w-full border border-gray-300 rounded-lg p-1.5 text-xs font-arabic"
                          />
                        </td>
                        <td className="px-1">
                          <input
                            type="number"
                            min={1}
                            max={50}
                            value={r.writtenCount}
                            onChange={(e) => setRow(r.lecture_id, { writtenCount: e.target.value })}
                            className="w-full border border-gray-300 rounded-lg p-1.5 text-xs text-center"
                          />
                        </td>
                        <td className="px-1 rounded-l-lg">
                          <input
                            type="number"
                            min={1}
                            max={200}
                            value={r.mcqCount}
                            onChange={(e) => setRow(r.lecture_id, { mcqCount: e.target.value })}
                            className="w-full border border-gray-300 rounded-lg p-1.5 text-xs text-center"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="px-4 py-3 border-t border-gray-200 flex items-center gap-3">
                <p className="text-xs text-gray-500 flex-1">
                  <span className="font-semibold text-gray-700">{jobs.length} محاضرة ستُعالَج</span>
                  {includedNoFile > 0 && ` · ${includedNoFile} مشمولة بلا ملف ستُتخطّى`}
                  {excludedCount > 0 && ` · ${excludedCount} مستثناة`}
                  {" — "}المسح يتقدّم وحده، والتدقيق يُفتح لكل محاضرة بالترتيب مع تنبيه صوتي، ثم
                  تكمل البقية في الخلفية وأنت تراجع التالية.
                </p>
                <button
                  onClick={start}
                  disabled={!canStart}
                  title={
                    !jobs.length
                      ? "حدّد محاضرةً واحدة على الأقل واختر ملفها"
                      : !apiKey.trim()
                        ? "أدخل مفتاح Mistral"
                        : claudeReason
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
              {runJobs.map((r) => {
                const st = state[r.lecture_id] || {};
                const cur = stepIndex(st.stage === "error" ? st.failed : st.stage);
                return (
                  <div
                    key={r.lecture_id}
                    className={`rounded-xl border p-3 ${
                      st.stage === "done"
                        ? "border-green-200 bg-green-50/50"
                        : st.stage === "error"
                          ? "border-red-200 bg-red-50/50"
                          : "border-gray-200 bg-white"
                    }`}
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-800 font-arabic min-w-[10rem]">{r.name}</span>
                      <div className="flex items-center gap-1 flex-wrap">
                        {STEPS.map((s, i) => {
                          const done = st.stage === "done" || i < cur;
                          const active = i === cur && st.stage !== "done";
                          return (
                            <span
                              key={s.key}
                              className={`text-[11px] rounded-full px-2 py-0.5 flex items-center gap-1 ${
                                done
                                  ? "bg-green-100 text-green-700"
                                  : active
                                    ? st.stage === "error"
                                      ? "bg-red-100 text-red-700 font-bold"
                                      : "bg-brand text-white font-bold"
                                    : "bg-gray-100 text-gray-400"
                              }`}
                            >
                              {active && st.stage !== "error" && <Loader2 size={10} className="animate-spin" />}
                              {s.label}
                            </span>
                          );
                        })}
                      </div>
                      {st.stage === "done" && (
                        <span className="mr-auto text-xs font-bold text-green-700 flex items-center gap-1">
                          <CheckCircle2 size={14} /> حُفظت
                        </span>
                      )}
                      {st.stage === "error" && (
                        <button
                          onClick={() => retry(r)}
                          className="mr-auto text-xs font-semibold rounded-lg px-3 py-1.5 border border-red-200 text-red-700 bg-white flex items-center gap-1.5"
                        >
                          <RotateCcw size={13} /> إعادة من «{STEPS.find((s) => s.key === st.failed)?.label}»
                        </button>
                      )}
                    </div>
                    {st.note && <p className="text-[11px] text-gray-500 mt-1.5">{st.note}</p>}
                    {st.error && (
                      <p className="text-xs text-red-600 mt-1.5 flex items-start gap-1.5">
                        <AlertTriangle size={13} className="shrink-0 mt-0.5" /> {st.error}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>,
        document.body,
      )}

      {/* نافذة التدقيق لمحاضرة الدور — تعلو المتابعة وتفتح وحدها */}
      {spellJob && createPortal(
        <CostScope.Provider value={{ exam_id: subjectId, lecture_id: spellJob.id }}>
        <SpellAction
          key={spellJob.key}
          autoRunKey={spellJob.key}
          hideTrigger
          text={spellJob.text}
          onText={(t) => {
            spellTextRef.current = t;
          }}
          pdfBytes={spellJob.bytes}
          onPdfBytes={() => {}}
          onReady={() => {
            patchState(spellJob.id, { stage: "spell", note: "التصحيحات جاهزة لمراجعتك" });
            beep("ready");
          }}
          onFinish={() => {
            const resolve = spellResolveRef.current;
            spellResolveRef.current = null;
            const t = spellTextRef.current;
            setSpellJob(null);
            resolve?.(t);
          }}
        />
        </CostScope.Provider>,
        document.body,
      )}
    </>
  );
}
