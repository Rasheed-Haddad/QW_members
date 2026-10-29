import axios from "axios";
import { API_BASE_URL, PASSWORD } from "../../../config";

// ─── تشغيل Claude: عادي أو Batch بواجهةٍ واحدة ────────────────────────────────
// المستدعي لا يعرف الفرق: يطلب ملخّصاً أو أسئلة ويأخذ النتيجة نفسها.
//   عادي (regular): طلبٌ واحد ينتظر الردّ.
//   Batch: إرسال يعود فوراً بمعرّف، ثم سؤالٌ عن النتيجة كل POLL_MS — نصف
//   السعر، والانتظار قد يطول دقائق أو ساعات بلا أن يُعلَّق شيء: كل سؤالٍ
//   طلبٌ قصير، وما بينها مؤقّتٌ في المتصفّح لا يحجز الخادم ولا الواجهة.
//
// `signal`: كائن { cancelled } — يوقف الانتظار عند الإلغاء.
// `onStatus(text)`: سطرُ حالةٍ للعرض.

export const MODES = [
  { id: "regular", label: "عادي — فوري" },
  { id: "batch", label: "Batch — نصف السعر، قد يتأخر" },
];

const POLL_MS = 15000;
const post = (path, body) =>
  axios.post(`${API_BASE_URL}${path}`, { PASSWORD, ...body }).then((r) => r.data);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** يرسل دفعة وينتظر نتيجتها بالسؤال الدوري */
const runBatch = async (kind, body, { signal, onStatus, label }) => {
  onStatus?.(`${label}: إرسال الدفعة…`);
  const { batch_id } = await post("/production/claude-batch/submit", { ...body, kind });
  const started = Date.now();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (signal?.cancelled) throw new Error("أُلغي");
    const mins = Math.floor((Date.now() - started) / 60000);
    onStatus?.(`${label}: الدفعة قيد المعالجة لدى Claude${mins ? ` (${mins} د)` : ""}…`);
    // eslint-disable-next-line no-await-in-loop
    await sleep(POLL_MS);
    if (signal?.cancelled) throw new Error("أُلغي");
    let r;
    try {
      // eslint-disable-next-line no-await-in-loop
      r = await post("/production/claude-batch/result", { batch_id, kind });
    } catch (e) {
      // انقطاع شبكةٍ عابر في السؤال لا يُسقط دفعةً تعمل — يُعاد في الدورة
      // التالية. ردٌّ صريح من الخادم (فشل الدفعة، مفتاح مرفوض…) خطأٌ حقيقي.
      if (!e?.response) continue;
      throw e;
    }
    if (r.done) return r;
  }
};

/**
 * أسئلة MCQ. body: { summary, number_of_questions, model, effort, lecture_name, subject_name }
 * يعيد { text, model, stop_reason }
 */
export const generateMcq = async (mode, body, opts = {}) => {
  if (mode === "batch") {
    return runBatch("mcq", body, { ...opts, label: "الأسئلة" });
  }
  opts.onStatus?.("الأسئلة: Claude يصوغها…");
  return post("/production/claude-mcq", body);
};

/**
 * الملخّص (مرحلتان). body: { curriculum, model, effort, lecture_name, subject_name }
 * يعيد { sections, facts, model, stop_reason }
 */
export const generateSummary = async (mode, body, opts = {}) => {
  if (mode === "batch") {
    const facts = await runBatch("summary_facts", body, { ...opts, label: "الملخص ①" });
    if (!facts.text) throw new Error("لم تُرجع المرحلة الأولى أي نص");
    try {
      const json = await runBatch(
        "summary_json",
        { ...body, curriculum: undefined, facts: facts.text },
        { ...opts, label: "الملخص ②" },
      );
      return { ...json, facts: facts.text };
    } catch (e) {
      // الحقائق تبقى متاحة للعرض حتى إن فشلت المرحلة الثانية
      e.facts = facts.text;
      throw e;
    }
  }
  opts.onStatus?.("الملخص: Claude يستخرج الحقائق ثم يبني القالب…");
  return post("/production/claude-summary", body);
};

/** رسالة الخطأ وما يرافقها (الحقائق/الردّ الخام) بصيغة واحدة */
export const claudeError = (e) => {
  const d = e?.response?.data || {};
  return {
    message: d.message || e?.message || "تعذّر الاتصال بالخادم",
    facts: d.facts || e?.facts,
    raw: d.raw,
  };
};
