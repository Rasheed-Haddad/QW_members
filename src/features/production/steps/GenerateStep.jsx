import { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import {
  Sparkles,
  PenLine,
  Play,
  Square,
  RotateCw,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  ArrowLeft,
  X,
  Trash2,
  Plus,
  UploadCloud,
  Target,
} from "lucide-react";
import { usePipeline } from "../pipelineStore";
import { API_BASE_URL, PASSWORD } from "../../../config";

// ─── توليد البطاقات والاختبار التحريري ────────────────────────────────────────
// مكوّن واحد لنوعين: النمط واحد تماماً (نموذج + موضوع تركيز + توليد للكل
// بفواصل + إعادة الفاشل + مراجعة + رفع)، والفارق شكل العنصر وحده.
// نسختان من الشيفرة كانتا ستفترقان عند أول تعديل.
const WAIT_BETWEEN = 6500;

// تُستعمل حين يتعذّر جلب القائمة من الحساب — لا نترك الحقل نصّياً
const FALLBACK_MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.5-pro", "gemini-2.0-flash"];

const KINDS = {
  flash: {
    key: "flash",
    label: "بطاقات الاسترجاع",
    icon: Sparkles,
    color: "#10b981",
    defaultCount: 10,
    stateKey: "flash",
    fields: [
      { name: "front", label: "الوجه — السؤال", rows: 2 },
      { name: "back", label: "الظهر — جواب قصير", rows: 2 },
    ],
    empty: { front: "", back: "" },
    listOf: (d) => d.cards || [],
    payload: (items, lectureId) => ({
      flash_cards: items.map((c, i) => ({
        card_id: `${lectureId}_c${i + 1}`,
        front: c.front,
        back: c.back,
      })),
    }),
    hint: "عشر بطاقات لكل محاضرة · السؤال يتطلّب استرجاعاً، والجواب كلمة أو رقم",
  },
  written: {
    key: "written",
    label: "الاختبار التحريري",
    icon: PenLine,
    color: "#ef4444",
    defaultCount: 5,
    stateKey: "written",
    fields: [
      { name: "question", label: "السؤال المقالي", rows: 2 },
      { name: "model_answer", label: "الجواب النموذجي — لوكيل التصحيح", rows: 4 },
    ],
    empty: { question: "", model_answer: "" },
    listOf: (d) => d.questions || [],
    payload: (items, lectureId) => ({
      written_exam: {
        duration_min: 30,
        questions: items.map((q, i) => ({
          q_id: `${lectureId}_w${i + 1}`,
          question: q.question,
          model_answer: q.model_answer,
        })),
      },
    }),
    hint: "الجواب النموذجي لا يصل تطبيق الطالب — وكيل التصحيح وحده يقرأه",
  },
};

export default function GenerateStep({ kind, nextStep }) {
  const K = KINDS[kind];
  const { state, dispatch } = usePipeline();
  const { lectures, markdown, target } = state;

  const ready = useMemo(
    () => lectures.filter((l) => markdown[l.id]),
    [lectures, markdown],
  );

  const [models, setModels] = useState([]);
  const [model, setModel] = useState("");
  const [focus, setFocus] = useState("");
  const [count, setCount] = useState(K.defaultCount);
  const [results, setResults] = useState({}); // id → {status, items[], error}
  const [running, setRunning] = useState(false);
  const [open, setOpen] = useState(null);
  const [uploads, setUploads] = useState({});
  const stopRef = useRef(false);

  useEffect(() => {
    axios
      .post(`${API_BASE_URL}/production/gemini-models`, { PASSWORD })
      .then((r) => {
        setModels(r.data?.models || []);
        setModel(r.data?.current || "");
      })
      .catch(() => {
        // تعذّر جلب القائمة من الحساب: نعرض قائمةً احتياطية معروفة بدل أن
        // نطالب المستخدم بكتابة اسم نموذجٍ عن ظهر قلب.
        setModels(FALLBACK_MODELS);
        setModel(FALLBACK_MODELS[0]);
      });
  }, []);

  const patch = (id, v) =>
    setResults((p) => ({ ...p, [id]: { ...(p[id] || {}), ...v } }));

  // ─── التوليد ────────────────────────────────────────────────────────────────
  const genOne = async (lec) => {
    patch(lec.id, { status: "running", error: null });
    try {
      const r = await axios.post(`${API_BASE_URL}/production/generate`, {
        PASSWORD,
        kind,
        text: markdown[lec.id],
        model,
        focus,
        count,
      });
      const items = K.listOf(r.data).map((x, i) => ({ ...x, key: `k${i}` }));
      if (!items.length) {
        patch(lec.id, { status: "error", error: "لم يُعِد النموذج أي عنصر" });
        return false;
      }
      patch(lec.id, { status: "done", items });
      return true;
    } catch (e) {
      patch(lec.id, {
        status: "error",
        error: e?.response?.data?.message || e.message,
      });
      return false;
    }
  };

  const genAll = async () => {
    stopRef.current = false;
    setRunning(true);
    const todo = ready.filter((l) => results[l.id]?.status !== "done");
    for (let i = 0; i < todo.length; i++) {
      if (stopRef.current) break;
      // eslint-disable-next-line no-await-in-loop
      await genOne(todo[i]);
      if (i < todo.length - 1 && !stopRef.current) {
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, WAIT_BETWEEN));
      }
    }
    setRunning(false);
  };

  // ─── الرفع ──────────────────────────────────────────────────────────────────
  /** المطابقة بـlecture_id وحده. محاضرات خط الإنتاج تحمل معرّفها الحقيقي
   *  منذ خطوة المراجعة (هي التي تنشئ الكيانات في القاعدة)، فلا حاجة
   *  لتخمين الأسماء. أربع محاولات تخمين كانت تربط أحياناً محاضرةً بأخرى
   *  فتُكتب أسئلة محاضرةٍ فوق جارتها. */
  const dbLectureOf = (lec) => {
    const list = target?.lectures || [];
    const lid = lec.lecture_id || lec.db_lecture_id;
    if (lid) {
      const hit = list.find((d) => d.lecture_id === lid);
      if (hit) return hit;
    }
    // الاسم الحرفي فقط (بلا احتواء جزئي) — للمحاضرات التي أُنشئت يدوياً
    const exact = String(lec.name || "").trim();
    return list.find(
      (d) => String(d.name || d.title || "").trim() === exact && exact,
    );
  };

  const uploadOne = async (lec) => {
    const rep = results[lec.id];
    if (!rep?.items?.length || !target?.subjectId) return false;
    const db = dbLectureOf(lec);
    if (!db) {
      setUploads((p) => ({
        ...p,
        [lec.id]: {
          status: "error",
          error: `لا محاضرة باسم «${lec.name}» في المادة. ارفع النصوص من خطوة المراجعة أولاً (فهي تُنشئ كيانات المحاضرات)، أو أنشئها من شاشة «المحاضرات».`,
        },
      }));
      return false;
    }
    setUploads((p) => ({ ...p, [lec.id]: { status: "running" } }));
    try {
      // الهيكل الموحَّد: الكتابة داخل كائن المحاضرة بـlecture_id وحده
      await axios.put(`${API_BASE_URL}/v2/lecture/save`, {
        PASSWORD,
        _id: target.subjectId,
        lecture_id: db.lecture_id,
        payload: K.payload(rep.items, db.lecture_id),
      });
      setUploads((p) => ({ ...p, [lec.id]: { status: "done" } }));
      return true;
    } catch (e) {
      setUploads((p) => ({
        ...p,
        [lec.id]: {
          status: "error",
          error: e?.response?.data?.message || e.message,
        },
      }));
      return false;
    }
  };

  const uploadAll = async () => {
    setRunning(true);
    for (const l of ready) {
      if (results[l.id]?.status !== "done") continue;
      if (uploads[l.id]?.status === "done") continue;
      // eslint-disable-next-line no-await-in-loop
      await uploadOne(l);
    }
    setRunning(false);
  };

  const setItem = (id, key, field, value) =>
    setResults((p) => ({
      ...p,
      [id]: {
        ...p[id],
        items: p[id].items.map((it) =>
          it.key === key ? { ...it, [field]: value } : it,
        ),
      },
    }));

  const removeItem = (id, key) =>
    setResults((p) => ({
      ...p,
      [id]: { ...p[id], items: p[id].items.filter((it) => it.key !== key) },
    }));

  const addItem = (id) =>
    setResults((p) => ({
      ...p,
      [id]: {
        ...p[id],
        items: [
          ...p[id].items,
          { ...K.empty, key: `n${Date.now()}` },
        ],
      },
    }));

  const done = ready.filter((l) => results[l.id]?.status === "done").length;
  const failed = ready.filter((l) => results[l.id]?.status === "error").length;
  const uploaded = ready.filter((l) => uploads[l.id]?.status === "done").length;

  if (!ready.length) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center">
        <K.icon size={24} className="text-gray-300 mx-auto mb-3" />
        <p className="text-sm text-gray-500">
          لا نصوص جاهزة — ارجع إلى خطوة المسح الضوئي
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* الإعدادات */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: `${K.color}1A` }}
          >
            <K.icon size={17} style={{ color: K.color }} />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-800">{K.label}</p>
            <p className="text-xs text-gray-400">{K.hint}</p>
          </div>
        </div>

        <div className="flex items-end gap-2 flex-wrap">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-gray-400">النموذج</span>
            {models.length > 0 && (
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
              className="px-3 py-2 rounded-xl border border-gray-200 text-sm outline-none focus:border-brand"
            />
          </label>

          <label className="flex flex-col gap-1 flex-1 min-w-[220px]">
            <span className="text-xs text-gray-400 flex items-center gap-1">
              <Target size={12} /> موضوع التركيز — اختياري
            </span>
            <input
              value={focus}
              onChange={(e) => setFocus(e.target.value)}
              dir="rtl"
              placeholder="مثلاً: التصنيفات والأرقام، أو المضاعفات"
              className="px-3 py-2 rounded-xl border border-gray-200 text-sm outline-none focus:border-brand"
            />
          </label>
        </div>
      </div>

      {/* التحكّم */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center gap-3 flex-wrap">
        <span className="text-sm text-gray-600">
          {done} من {ready.length} مولَّدة
          {failed > 0 && <span className="text-red-600"> · {failed} فشلت</span>}
          {uploaded > 0 && (
            <span className="text-green-700"> · {uploaded} مرفوعة</span>
          )}
        </span>

        <div className="mr-auto flex items-center gap-2">
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
            <>
              {failed > 0 && (
                <button
                  onClick={genAll}
                  className="text-sm font-medium text-brand bg-brand/10 rounded-xl px-4 py-2.5 flex items-center gap-2"
                >
                  <RotateCw size={15} /> أعد الفاشلة
                </button>
              )}
              {done > 0 && target?.subjectId && (
                <button
                  onClick={uploadAll}
                  className="text-sm font-medium text-brand bg-brand/10 rounded-xl px-4 py-2.5 flex items-center gap-2"
                >
                  <UploadCloud size={15} /> ارفع الكل
                </button>
              )}
              <button
                onClick={genAll}
                className="text-white text-sm font-bold rounded-xl px-5 py-2.5 flex items-center gap-2"
                style={{ backgroundColor: K.color }}
              >
                <Play size={15} /> ولّد للكل
              </button>
            </>
          )}
        </div>
      </div>

      {!target?.subjectId && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-4 py-2.5">
          لم تُحدَّد المادة الهدف في خطوة المراجعة — يمكنك التوليد والمراجعة
          الآن، لكن الرفع يحتاجها.
        </p>
      )}

      {/* المحاضرات */}
      <div className="flex flex-col gap-2">
        {ready.map((l, i) => {
          const r = results[l.id] || {};
          const up = uploads[l.id] || {};
          return (
            <div
              key={l.id}
              className={`bg-white rounded-xl border p-3.5 ${
                r.status === "error" || up.status === "error"
                  ? "border-red-200"
                  : "border-gray-100"
              }`}
            >
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-xs font-bold text-gray-400 w-5">
                  {i + 1}
                </span>
                <span className="text-sm font-semibold text-gray-800 truncate max-w-[220px]">
                  {l.name}
                </span>
                {r.status === "done" && (
                  <span className="text-xs text-gray-600">
                    {r.items.length} عنصراً
                  </span>
                )}
                {up.status === "done" && (
                  <span className="text-xs text-green-700 flex items-center gap-1">
                    <CheckCircle2 size={13} /> رُفعت
                  </span>
                )}

                <div className="mr-auto flex items-center gap-2">
                  {r.status === "done" && (
                    <button
                      onClick={() => setOpen(l.id)}
                      className="text-xs font-medium text-brand bg-brand/10 rounded-lg px-3 py-1.5"
                    >
                      اعرض النتيجة
                    </button>
                  )}
                  {r.status === "done" && target?.subjectId && (
                    <button
                      onClick={() => uploadOne(l)}
                      disabled={running}
                      className="text-xs text-gray-600 border border-gray-200 rounded-lg px-3 py-1.5 flex items-center gap-1.5 disabled:opacity-40"
                    >
                      <UploadCloud size={13} /> ارفع
                    </button>
                  )}
                  <button
                    onClick={() => genOne(l)}
                    disabled={running || r.status === "running"}
                    className="text-xs text-gray-600 border border-gray-200 rounded-lg px-3 py-1.5 flex items-center gap-1.5 disabled:opacity-40"
                  >
                    {r.status === "running" ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : (
                      <Sparkles size={13} />
                    )}
                    {r.status === "done" ? "أعد التوليد" : "ولّد"}
                  </button>
                </div>
              </div>
              {(r.error || up.error) && (
                <p className="text-xs text-red-600 mt-2 flex items-start gap-1.5">
                  <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                  {r.error || up.error}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center gap-3">
        <p className="text-sm text-gray-500">
          {uploaded} مرفوعة من {done} مولَّدة
        </p>
        <button
          onClick={() => dispatch({ type: "step", step: nextStep })}
          disabled={running}
          className="mr-auto bg-brand text-white text-sm font-bold rounded-xl px-6 py-2.5 disabled:opacity-40 flex items-center gap-2"
        >
          <ArrowLeft size={16} /> متابعة
        </button>
      </div>

      {open && results[open]?.items && (
        <ItemsModal
          K={K}
          name={lectures.find((l) => l.id === open)?.name}
          items={results[open].items}
          onField={(key, field, v) => setItem(open, key, field, v)}
          onRemove={(key) => removeItem(open, key)}
          onAdd={() => addItem(open)}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}

const ItemsModal = ({ K, name, items, onField, onRemove, onAdd, onClose }) => (
  <div
    className="fixed inset-0 bg-black/45 flex items-center justify-center z-50 p-4"
    onClick={onClose}
  >
    <div
      dir="rtl"
      className="bg-white rounded-2xl w-full max-w-3xl max-h-[88vh] flex flex-col overflow-hidden"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-3 p-4 border-b border-gray-100">
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-bold text-gray-800 truncate">{name}</h3>
          <p className="text-xs text-gray-400">
            {items.length} عنصراً · عدّل أو احذف أو أضف قبل الرفع
          </p>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100"
        >
          <X size={18} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
        {items.map((it, i) => (
          <div
            key={it.key}
            className="p-3.5 rounded-xl border border-gray-200 bg-white"
          >
            <div className="flex items-center gap-2 mb-2.5">
              <span
                className="text-sm font-black"
                style={{ color: K.color }}
              >
                #{i + 1}
              </span>
              <button
                onClick={() => onRemove(it.key)}
                className="mr-auto p-1.5 rounded-md text-red-500 hover:bg-red-50"
                title="حذف"
              >
                <Trash2 size={14} />
              </button>
            </div>
            {K.fields.map((f) => (
              <label key={f.name} className="block mb-2 last:mb-0">
                <span className="block text-xs text-gray-400 mb-1">
                  {f.label}
                </span>
                <textarea
                  value={it[f.name] || ""}
                  onChange={(e) => onField(it.key, f.name, e.target.value)}
                  rows={f.rows}
                  dir="rtl"
                  className="w-full p-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm outline-none focus:border-brand"
                />
              </label>
            ))}
          </div>
        ))}
      </div>

      <div className="p-4 border-t border-gray-100 flex items-center gap-3">
        <button
          onClick={onAdd}
          className="text-sm text-gray-600 border border-gray-200 rounded-xl px-4 py-2.5 flex items-center gap-2"
        >
          <Plus size={15} /> أضف عنصراً
        </button>
        <button
          onClick={onClose}
          className="mr-auto bg-brand text-white text-sm font-bold rounded-xl px-6 py-2.5 flex items-center gap-2"
        >
          <CheckCircle2 size={15} /> تمّ
        </button>
      </div>
    </div>
  </div>
);
