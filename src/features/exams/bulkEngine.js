import { useSyncExternalStore } from "react";
import axios from "axios";
import { API_BASE_URL, PASSWORD } from "../../config";
import { saveLecture, getLecture } from "./v2api";
import { DEFAULT_GEMINI_MODEL, runSpellcheck, buildSpellReport } from "../production/components/AiActions";
import { scanLecture, checkR2 } from "../production/lib/mistralOcr";
import { generateMcq, generateSummary, claudeError } from "../production/lib/claudeRun";
import { parsePastedQuestions } from "../production/lib/parseQuestions";

// ─── محرّك «معالجة كل المحاضرات» ──────────────────────────────────────────────
// يعيش خارج أي مكوّن: إغلاق النافذة أو التنقّل بين المحاضرات لا يوقفه، ولا
// يُزعجك بنافذةٍ تقفز في وجهك.
//
// لكل محاضرة، بالخلفية وبالترتيب:
//   ① المسح ← يُحفظ النصّ في المحاضرة فوراً (نهائياً)
//   ② التدقيق يبدأ عليه فوراً ← حين ينتهي: صوت، والتصحيحات تُحفظ في
//      الذاكرة المحلية بانتظار مراجعتك، وتنبض علامةٌ بجانب اسم المحاضرة
//   المسح يتقدّم إلى التالية بينما التدقيق يعمل على السابقة.
//
// بعد «طبّق» في المراجعة: يُحفظ النصّ المصحَّح، ويبدأ بالتوازي:
//   Gemini: البطاقات ← التحريري · Claude: الملخص ← الأسئلة
//   وكلُّ ناتجٍ يُحفظ في المحاضرة لحظة جاهزيته — لا ينتظر غيره.
//
// كل خطوة تُطفأ لمحاضرةٍ بعينها أو للكل (steps). المراجعات المعلّقة تبقى بعد
// تحديث الصفحة؛ ما كان جارياً (مسح أو توليد) يتوقف معه ويُعاد يدوياً.

export const STEP_KEYS = ["ocr", "spell", "summary", "mcq", "flash", "written"];
export const STEP_LABELS = {
  ocr: "مسح",
  spell: "تدقيق",
  summary: "ملخص",
  mcq: "أسئلة",
  flash: "بطاقات",
  written: "تحريري",
};

const PENDING_KEY = "bulk_spell_pending_v1";
const EMPTY = Object.freeze({});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// تنبيه صوتي بلا ملفّات: نغمتان لتدقيقٍ جاهز، وثلاثٌ صاعدة لمحاضرةٍ اكتملت
export const beep = (kind) => {
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

// ─── المخزن ───────────────────────────────────────────────────────────────────
// ثلاث خرائط بالمادة، تُستبدل كائناتها عند كل تغيير (لا تُعدَّل في مكانها)
// كي يرى useSyncExternalStore التغيير:
//   view[sid]      = { order, jobs: { lid: { name, steps, errors, note } }, active, stopped }
//   pending[sid]   = { lid: { name, text, raw, count, cfg, job, at } }   ← محفوظ محلياً
//   reviewing[sid] = lid | null                                           ← المراجعة المفتوحة

const loadPending = () => {
  try {
    return JSON.parse(localStorage.getItem(PENDING_KEY) || "{}") || {};
  } catch {
    return {};
  }
};

let view = {};
let pending = loadPending();
let reviewing = {};
const listeners = new Set();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

const persistPending = () => {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
  } catch {
    // الذاكرة المحلية ممتلئة: تبقى المراجعة في الذاكرة لهذه الجلسة وحدها
    console.warn("تعذّر حفظ مراجعات التدقيق محلياً — امتلأت الذاكرة");
  }
};

export const useBulkView = (sid) => useSyncExternalStore(subscribe, () => view[sid] || EMPTY);
export const usePendingReviews = (sid) =>
  useSyncExternalStore(subscribe, () => pending[sid] || EMPTY);
export const useReviewing = (sid) => useSyncExternalStore(subscribe, () => reviewing[sid] || null);

const setView = (sid, fn) => {
  view = { ...view, [sid]: fn(view[sid] || { order: [], jobs: {} }) };
  emit();
};

const patchJob = (sid, lid, patch) =>
  setView(sid, (v) => {
    const j = v.jobs[lid] || { name: "", steps: {}, errors: {}, note: "" };
    return { ...v, jobs: { ...v.jobs, [lid]: { ...j, ...patch } } };
  });

const setStep = (sid, lid, key, status, error = null) =>
  setView(sid, (v) => {
    const j = v.jobs[lid];
    if (!j) return v;
    const errors = { ...j.errors };
    if (error) errors[key] = error;
    else delete errors[key];
    return {
      ...v,
      jobs: { ...v.jobs, [lid]: { ...j, steps: { ...j.steps, [key]: status }, errors } },
    };
  });

const setPending = (sid, lid, entry) => {
  const mine = { ...(pending[sid] || {}) };
  if (entry) mine[lid] = entry;
  else delete mine[lid];
  pending = { ...pending, [sid]: mine };
  persistPending();
  emit();
};

export const openReview = (sid, lid) => {
  reviewing = { ...reviewing, [sid]: lid };
  emit();
};
export const closeReview = (sid) => {
  reviewing = { ...reviewing, [sid]: null };
  emit();
};

// ─── ما يبقى في الذاكرة طوال الجلسة (لا يُرسم) ──────────────────────────────
// runs[sid] = { signal, cfg, apiKey, subjectName, jobs:{lid: إعدادها}, results:{lid}, bytes:{lid} }
const runs = {};
const savedHandlers = {};

/** شاشة المادة تسجّل هنا ما يُستدعى بعد كل حفظ (تحديث القائمة والمحاضرة المفتوحة) */
export const setBulkSavedHandler = (sid, fn) => {
  savedHandlers[sid] = fn;
  return () => {
    if (savedHandlers[sid] === fn) delete savedHandlers[sid];
  };
};
const saved = (sid, lid) => {
  try {
    savedHandlers[sid]?.(lid);
  } catch {
    /* الشاشة أُغلقت — لا شيء */
  }
};

/** بايتات الملف الأصلي لمراجعة التدقيق بجانبه — في الجلسة وحدها */
export const bulkBytes = (sid, lid) => runs[sid]?.bytes?.[lid] || null;

const costOf = (sid, lid) => ({ exam_id: sid, lecture_id: lid });

/** توليد بطاقات أو تحريري بـGemini — يُعاد عند الفشل حتى خمس مرات */
const geminiGenerate = async (kind, text, focus, count, signal, cost, model) => {
  for (let attempt = 1; ; attempt++) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const r = await axios.post(`${API_BASE_URL}/production/generate`, {
        PASSWORD,
        kind,
        text,
        model: model || DEFAULT_GEMINI_MODEL,
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

const errText = (e) => claudeError(e).message;

// ─── المراحل ──────────────────────────────────────────────────────────────────

/** ① نصّ المحاضرة: مسحٌ يُحفظ فوراً، أو النصّ المحفوظ إن أُطفئ المسح */
const sourceText = async (sid, lid) => {
  const run = runs[sid];
  const job = run.jobs[lid];
  if (job.steps.ocr) {
    const bytes = run.bytes[lid];
    if (!bytes) throw Object.assign(new Error("الملف غير متاح في هذه الجلسة — اختره من إعدادٍ جديد"), { step: "ocr" });
    setStep(sid, lid, "ocr", "run");
    try {
      if (run.r2 === undefined) run.r2 = await checkR2();
      const r = await scanLecture({
        apiKey: run.apiKey,
        subject: run.subjectName || "مادة",
        name: job.name,
        bytes,
        withImages: run.r2?.ready !== false,
        onStage: (note) => patchJob(sid, lid, { note }),
        cost: costOf(sid, lid),
      });
      patchJob(sid, lid, { note: "حفظ النص في المحاضرة…" });
      // النصّ يُحفظ نهائياً قبل أي شيء: المسح أغلى ما في السلسلة
      await saveLecture(sid, lid, { curriculum: { text: r.markdown } });
      saved(sid, lid);
      setStep(sid, lid, "ocr", "done");
      patchJob(sid, lid, { note: "" });
      return r.markdown;
    } catch (e) {
      throw Object.assign(new Error(e?.response?.data?.message || e?.message || "تعذّر المسح"), { step: "ocr" });
    }
  }
  const r = await getLecture(sid, lid);
  const text = String(r?.lecture?.curriculum?.text || "");
  if (!text.trim()) {
    throw Object.assign(new Error("لا نصّ مقرَّر محفوظ لهذه المحاضرة — فعّل المسح واختر ملفها"), {
      step: STEP_KEYS.find((k) => k !== "ocr" && job.steps[k]) || "spell",
    });
  }
  return text;
};

/** ② التدقيق في الخلفية: حين ينتهي تُحفظ تصحيحاته للمراجعة، أو يُتابَع فوراً إن لم يجد شيئاً */
const spellStage = async (sid, lid, text) => {
  const run = runs[sid];
  const job = run.jobs[lid];
  // يُحفظ لإعادة التدقيق أو التوليد دون مسحٍ جديد
  (run.results[lid] || (run.results[lid] = {})).text = text;
  if (!job.steps.spell) {
    runChain(sid, lid, text);
    return;
  }
  setStep(sid, lid, "spell", "run");
  try {
    const { raw } = await runSpellcheck(text, {
      model: run.cfg.spellModel || DEFAULT_GEMINI_MODEL,
      cost: costOf(sid, lid),
      onProgress: (p) =>
        patchJob(sid, lid, {
          note: p.retry
            ? `تدقيق: إعادة الدفعة ${p.done + 1} بعد ${p.retry.seconds} ث (${p.retry.reason})`
            : `تدقيق: دفعة ${p.done + 1} من ${p.total}`,
        }),
      isCancelled: () => run.signal.cancelled,
    });
    const count = buildSpellReport(raw, text).accepted.length;
    patchJob(sid, lid, { note: "" });
    if (!count) {
      setStep(sid, lid, "spell", "done");
      runChain(sid, lid, text);
      return;
    }
    setPending(sid, lid, {
      name: job.name,
      text,
      raw,
      count,
      cfg: run.cfg,
      job,
      at: Date.now(),
    });
    setStep(sid, lid, "spell", "review");
    beep("ready");
  } catch (e) {
    patchJob(sid, lid, { note: "" });
    setStep(sid, lid, "spell", "err", errText(e));
  }
};

/** خطوة واحدة: حالتها، وحفظ ناتجها فور جاهزيته */
const runStep = async (sid, lid, key, fn) => {
  const run = runs[sid];
  if (run.signal.cancelled) {
    setStep(sid, lid, key, "err", "أُوقفت المعالجة");
    return false;
  }
  setStep(sid, lid, key, "run");
  try {
    await fn();
    setStep(sid, lid, key, "done");
    saved(sid, lid);
    return true;
  } catch (e) {
    setStep(sid, lid, key, "err", errText(e));
    return false;
  } finally {
    patchJob(sid, lid, { note: "" });
  }
};

/**
 * ③ التوليد بعد التدقيق — مساران متوازيان، كلُّ ناتجٍ يُحفظ وحده لحظة جاهزيته.
 * only: إعادة خطواتٍ بعينها (فشلت) لا كل المفعَّل.
 */
const runChain = async (sid, lid, text, only = null) => {
  const run = runs[sid];
  const job = run.jobs[lid];
  const res = run.results[lid] || (run.results[lid] = {});
  res.text = text;
  const on = (k) => job.steps[k] && (!only || only.includes(k));
  const cost = costOf(sid, lid);
  const base = {
    model: run.cfg.model,
    effort: run.cfg.effort,
    lecture_name: job.name,
    subject_name: run.subjectName,
    cost,
  };
  const opts = { signal: run.signal, onStatus: (note) => patchJob(sid, lid, { note }) };

  const gemini = (async () => {
    if (on("flash")) {
      await runStep(sid, lid, "flash", async () => {
        const cards = await geminiGenerate("flash", text, job.flashFocus, job.flashCount, run.signal, cost, run.cfg.genModel);
        await saveLecture(sid, lid, {
          flash_cards: cards.map((c, i) => ({ card_id: `${lid}_ai${i + 1}`, front: c.front, back: c.back })),
        });
      });
    }
    if (on("written")) {
      await runStep(sid, lid, "written", async () => {
        const qs = await geminiGenerate("written", text, job.writtenFocus, job.writtenCount, run.signal, cost, run.cfg.genModel);
        await saveLecture(sid, lid, {
          written_exam: {
            duration_min: 30,
            questions: qs.map((q, i) => ({
              q_id: `${lid}_aiw${i + 1}`,
              question: q.question,
              model_answer: q.model_answer,
            })),
          },
        });
      });
    }
  })();

  const claude = (async () => {
    let summaryOk = true;
    if (on("summary")) {
      summaryOk = await runStep(sid, lid, "summary", async () => {
        const r = await generateSummary(run.cfg.mode, { ...base, curriculum: text }, opts);
        res.sections = r.sections;
        await saveLecture(sid, lid, { summary: { sections: r.sections } });
      });
    }
    if (on("mcq")) {
      if (!summaryOk) {
        setStep(sid, lid, "mcq", "err", "الأسئلة تُبنى على الملخص — أعد الملخص أولاً");
        return;
      }
      await runStep(sid, lid, "mcq", async () => {
        // الملخص المولَّد الآن، أو المحفوظ في المحاضرة إن أُطفئ توليده
        let sections = res.sections;
        if (!sections?.length) {
          const l = await getLecture(sid, lid);
          sections = l?.lecture?.summary?.sections || [];
        }
        if (!sections.length) throw new Error("لا ملخص للمحاضرة تُبنى عليه الأسئلة — فعّل الملخص");
        const r = await generateMcq(
          run.cfg.mode,
          { ...base, summary: sections, number_of_questions: job.mcqCount },
          opts,
        );
        const qs = parsePastedQuestions(r.text).slice(0, Number(job.mcqCount) || 40);
        if (!qs.length) throw new Error("لم تُستخرج أسئلة من ردّ Claude");
        await saveLecture(sid, lid, {
          questions: qs.map(({ question, options, answer }) => ({
            question,
            options,
            answer: String(answer),
          })),
        });
      });
    }
  })();

  await Promise.all([gemini, claude]);
  const steps = view[sid]?.jobs?.[lid]?.steps || {};
  const ran = STEP_KEYS.filter((k) => job.steps[k]);
  if (ran.length && ran.every((k) => steps[k] === "done")) beep("done");
};

/** يعيد تقويم «نشطة»: هل بقي في المادة شيءٌ يعمل؟ */
const refreshActive = (sid) =>
  setView(sid, (v) => ({
    ...v,
    active: Object.values(v.jobs).some((j) => Object.values(j.steps).some((s) => s === "run" || s === "wait")),
  }));

// ─── الواجهة العامة ───────────────────────────────────────────────────────────

/**
 * jobs: [{ lecture_id, name, file?, steps:{ocr,spell,summary,mcq,flash,written},
 *          flashFocus, flashCount, writtenFocus, writtenCount, mcqCount }]
 * cfg: { model, effort, mode } لـClaude · { spellModel, genModel } لـGemini
 */
export const startBulk = ({ subjectId: sid, subjectName, jobs, cfg, apiKey }) => {
  const run = {
    signal: { cancelled: false },
    cfg,
    apiKey,
    subjectName,
    jobs: {},
    results: {},
    bytes: {},
  };
  runs[sid] = run;
  jobs.forEach((j) => {
    const { file, ...rest } = j;
    run.jobs[j.lecture_id] = rest;
    run.results[j.lecture_id] = {};
    if (file?.bytes) run.bytes[j.lecture_id] = file.bytes;
  });
  view = {
    ...view,
    [sid]: {
      order: jobs.map((j) => j.lecture_id),
      active: true,
      stopped: false,
      jobs: Object.fromEntries(
        jobs.map((j) => [
          j.lecture_id,
          {
            name: j.name,
            note: "",
            errors: {},
            steps: Object.fromEntries(STEP_KEYS.map((k) => [k, j.steps[k] ? "wait" : "off"])),
          },
        ]),
      ),
    },
  };
  emit();

  const ids = jobs.map((j) => j.lecture_id);
  const texts = ids.map(() => deferred());
  // إشارة هذا التشغيل وحده: تطبيق مراجعةٍ أو إعادةُ خطوةٍ بعد «إيقاف» تأخذ
  // إشارةً جديدة، فلا يعود المسح المتوقف إلى العمل معها
  const sig = run.signal;

  // المسح: محاضرةً محاضرة، بلا انتظار التدقيق
  (async () => {
    for (let i = 0; i < ids.length; i++) {
      if (sig.cancelled) {
        texts[i].reject(new Error("أُوقف"));
        // eslint-disable-next-line no-continue
        continue;
      }
      try {
        // eslint-disable-next-line no-await-in-loop
        texts[i].resolve(await sourceText(sid, ids[i]));
      } catch (e) {
        setStep(sid, ids[i], e.step || "ocr", "err", e.message);
        patchJob(sid, ids[i], { note: "" });
        texts[i].reject(e);
      }
    }
  })();

  // التدقيق: بالترتيب على ما انتهى مسحه، والتوليد يبدأ وحده بعد المراجعة
  (async () => {
    for (let i = 0; i < ids.length; i++) {
      let text;
      try {
        // eslint-disable-next-line no-await-in-loop
        text = await texts[i].promise;
      } catch {
        // eslint-disable-next-line no-continue
        continue;
      }
      if (sig.cancelled) break;
      // eslint-disable-next-line no-await-in-loop
      await spellStage(sid, ids[i], text);
    }
    refreshActive(sid);
  })();
};

/** يوقف ما لم يبدأ ويُنهي الجاري عند أول فرصة. ما حُفظ يبقى. */
export const stopBulk = (sid) => {
  if (runs[sid]) runs[sid].signal.cancelled = true;
  setView(sid, (v) => ({
    ...v,
    stopped: true,
    jobs: Object.fromEntries(
      Object.entries(v.jobs).map(([lid, j]) => [
        lid,
        {
          ...j,
          steps: Object.fromEntries(
            Object.entries(j.steps).map(([k, s]) => [k, s === "wait" ? "off" : s]),
          ),
        },
      ]),
    ),
  }));
  refreshActive(sid);
};

/** تُستعاد إعدادات المحاضرة من المراجعة المحفوظة بعد تحديث الصفحة */
const ensureRun = (sid, entry) => {
  if (!runs[sid]) {
    runs[sid] = {
      signal: { cancelled: false },
      cfg: entry.cfg,
      apiKey: "",
      subjectName: entry.subjectName || "",
      jobs: {},
      results: {},
      bytes: {},
    };
  }
  const run = runs[sid];
  if (run.signal.cancelled) run.signal = { cancelled: false };
  if (!run.jobs[entry.lid]) run.jobs[entry.lid] = entry.job;
  if (!run.cfg) run.cfg = entry.cfg;
  if (!view[sid]?.jobs?.[entry.lid]) {
    setView(sid, (v) => ({
      ...v,
      order: v.order.includes(entry.lid) ? v.order : [...v.order, entry.lid],
      jobs: {
        ...v.jobs,
        [entry.lid]: {
          name: entry.name,
          note: "",
          errors: {},
          steps: Object.fromEntries(
            STEP_KEYS.map((k) => [
              k,
              !entry.job.steps[k] ? "off" : k === "ocr" ? "done" : k === "spell" ? "review" : "wait",
            ]),
          ),
        },
      },
    }));
  }
};

/**
 * «طبّق» في المراجعة: يُحفظ النصّ المصحَّح ثم يبدأ التوليد بالخلفية.
 * finalText: النصّ بعد التصحيحات المختارة (أو كما هو إن لم يُختر شيء).
 */
export const applyReview = async (sid, lid, finalText, subjectName) => {
  const entry = pending[sid]?.[lid];
  if (!entry) return;
  ensureRun(sid, { ...entry, lid, subjectName });
  if (subjectName && !runs[sid].subjectName) runs[sid].subjectName = subjectName;
  setPending(sid, lid, null);
  closeReview(sid);
  setView(sid, (v) => ({ ...v, active: true }));
  setStep(sid, lid, "spell", "run");
  patchJob(sid, lid, { note: "حفظ النص المصحَّح…" });
  try {
    if (finalText !== entry.text) {
      await saveLecture(sid, lid, { curriculum: { text: finalText } });
      saved(sid, lid);
    }
    setStep(sid, lid, "spell", "done");
    patchJob(sid, lid, { note: "" });
  } catch (e) {
    // الحفظ فشل: المراجعة تعود معلّقةً كما كانت، فلا يضيع ما اخترته
    setPending(sid, lid, entry);
    setStep(sid, lid, "spell", "review", `تعذّر حفظ النص: ${errText(e)}`);
    patchJob(sid, lid, { note: "" });
    return;
  }
  await runChain(sid, lid, finalText);
  refreshActive(sid);
};

/** يتجاهل مراجعةً معلّقة نهائياً — بلا تطبيق ولا توليد */
export const discardReview = (sid, lid) => {
  setPending(sid, lid, null);
  closeReview(sid);
  if (view[sid]?.jobs?.[lid]) setStep(sid, lid, "spell", "err", "أُهملت المراجعة");
};

/** إعادة ما فشل: المسح أو التدقيق يُعادان مع ما بعدهما، والتوليد خطوته وحدها */
export const retryBulk = async (sid, lid) => {
  const run = runs[sid];
  const j = view[sid]?.jobs?.[lid];
  if (!run || !j) return;
  if (run.signal.cancelled) run.signal = { cancelled: false };
  const failed = STEP_KEYS.filter((k) => j.steps[k] === "err");
  if (!failed.length) return;
  setView(sid, (v) => ({ ...v, active: true, stopped: false }));
  try {
    if (failed.includes("ocr") || failed.includes("spell")) {
      const text = failed.includes("ocr") ? await sourceText(sid, lid) : run.results[lid]?.text || (await sourceText(sid, lid));
      await spellStage(sid, lid, text);
    } else {
      let text = run.results[lid]?.text;
      if (!text) {
        const l = await getLecture(sid, lid);
        text = String(l?.lecture?.curriculum?.text || "");
      }
      await runChain(sid, lid, text, failed);
    }
  } catch (e) {
    setStep(sid, lid, e.step || failed[0], "err", e.message);
  }
  refreshActive(sid);
};
