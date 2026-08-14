import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDispatch } from "react-redux";
import { useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import {
  ArrowRight,
  Save,
  AlignLeft,
  FileText,
  HelpCircle,
  Sparkles,
  PenLine,
  Plus,
  Trash2,
  Search,
  X,
  ArrowUp,
  ArrowDown,
  Check,
  Info,
  Loader2,
} from "lucide-react";
import { fetch_one_subject, save_lecture_part } from "../../store/examsSlice";
import SummaryEditor from "./SummaryEditor";
import {
  OcrAction,
  SpellAction,
  GenerateAction,
  TranscribeAction,
} from "../production/components/AiActions";
import PasteQuestions from "../production/components/PasteQuestions";
import { API_BASE_URL, PASSWORD } from "../../config";

// ─── محرّر المحاضرة والجزء ────────────────────────────────────────────────────
// شاشة واحدة لنطاقين: محاضرة كاملة (/exams/lecture/:id/:lectureId) أو جزء
// منها (/exams/lecture/:id/:lectureId/:part).
//
// المبدأ الحاكم: ما لم يُلمَس لا يُرسَل. نتتبّع الأجزاء المتّسخة، والحفظ يحمل
// تلك وحدها — فالخادم يقرأ غياب الجزء «لا تلمس» لا «احذف». هكذا يبقى الحفظ
// بحجم ما غيّرت، لا بحجم المادة.

const PARTS = [
  { key: "text", label: "نص المقرر", icon: AlignLeft, color: "#0ea5e9" },
  { key: "summary", label: "الملخص", icon: FileText, color: "#8C52FF" },
  { key: "questions", label: "الأسئلة", icon: HelpCircle, color: "#f59e0b" },
  { key: "flash", label: "البطاقات", icon: Sparkles, color: "#10b981" },
  { key: "written", label: "التحريري", icon: PenLine, color: "#ef4444" },
];

// تطبيع عربي للبحث — نفس منطق محرّر المادة
const normAr = (s) =>
  String(s == null ? "" : s)
    .replace(/[ً-ْٰـ]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[ؤئ]/g, "ء")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

// ─── أجزاء صغيرة مشتركة ───────────────────────────────────────────────────────

const Field = ({ label, hint, children }) => (
  <label className="block">
    <span className="block text-xs font-semibold text-gray-600 mb-1.5">
      {label}
      {hint && <span className="font-normal text-gray-400"> · {hint}</span>}
    </span>
    {children}
  </label>
);

const EmptyPart = ({ icon: Icon, color, text, action, onAction }) => (
  <div className="p-10 text-center rounded-2xl border border-dashed border-gray-300 bg-white">
    <span
      className="inline-flex w-12 h-12 rounded-xl items-center justify-center mb-3"
      style={{ backgroundColor: `${color}14` }}
    >
      <Icon size={22} color={color} />
    </span>
    <p className="text-sm text-gray-600">{text}</p>
    {action && (
      <button
        onClick={onAction}
        className="mt-4 px-4 py-2 rounded-lg text-sm font-semibold text-white"
        style={{ backgroundColor: color }}
      >
        {action}
      </button>
    )}
  </div>
);

// ─── نص المقرر ────────────────────────────────────────────────────────────────
// النص يعيش في كولكشن LectureText بمفتاح rel_path = "<القسم>/<المادة>/<الملف>"،
// ولا يُرسل مع المادة قطّ. نجلبه هنا وحده ونحفظه على مساره وحده.

const TextPart = ({
  textRef,
  text,
  loading,
  onChange,
  lectureName,
  subjectName,
}) => {
  if (!textRef) {
    return (
      <EmptyPart
        icon={AlignLeft}
        color="#0ea5e9"
        text="لا نص مقرر مربوط بهذه المحاضرة. الربط يتم من شاشة «المحاضرات»."
      />
    );
  }
  if (loading) {
    return (
      <div className="p-10 text-center text-sm text-gray-500">
        <Loader2 size={22} className="animate-spin inline-block mb-2" />
        <p>جارٍ جلب النص…</p>
      </div>
    );
  }
  const words = String(text || "").trim().split(/\s+/).filter(Boolean).length;
  return (
    <div className="space-y-3">
      {/* الأدوات نفسها التي في خطّ الإنتاج — المواد القديمة تحتاجها
          محاضرةً محاضرة لا بخطٍّ من تسع خطوات */}
      <div className="flex items-center gap-2 flex-wrap">
        <OcrAction
          lectureName={lectureName}
          subjectName={subjectName}
          onText={(md) => onChange(md)}
        />
        <TranscribeAction onText={(md) => onChange(md)} />
        <SpellAction text={text} onText={(t) => onChange(t)} />
      </div>
      <div className="flex items-center gap-2 flex-wrap text-xs">
        <span className="px-2.5 py-1 rounded-md bg-sky-50 text-sky-700 font-mono">
          {textRef}
        </span>
        <span className="text-gray-500">
          {words.toLocaleString("ar-EG")} كلمة · {(text || "").length} حرف
        </span>
      </div>
      <textarea
        value={text || ""}
        onChange={(e) => onChange(e.target.value)}
        dir="rtl"
        spellCheck={false}
        className="w-full h-[65vh] p-5 rounded-xl border border-gray-300 bg-white text-[17px] leading-9 font-arabic outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
        placeholder="نص المحاضرة بصيغة ماركداون…"
      />
      <p className="text-xs text-gray-400">
        الحفظ يكتب على {textRef} في كولكشن نصوص المحاضرات — لا يمسّ المادة.
      </p>
    </div>
  );
};

// ─── الأسئلة ──────────────────────────────────────────────────────────────────

const QuestionCard = ({ q, n, onChange, onRemove, onMove, isFirst, isLast }) => (
  <div className="p-4 rounded-xl border border-gray-200 bg-white">
    <div className="flex items-center gap-2 mb-3">
      <span className="text-base font-black text-[#f59e0b]">#{n}</span>
      <div className="mr-auto flex items-center gap-1">
        <button
          onClick={() => onMove(-1)}
          disabled={isFirst}
          title="لأعلى"
          className="p-1.5 rounded-md text-gray-400 hover:bg-gray-100 disabled:opacity-30"
        >
          <ArrowUp size={15} />
        </button>
        <button
          onClick={() => onMove(1)}
          disabled={isLast}
          title="لأسفل"
          className="p-1.5 rounded-md text-gray-400 hover:bg-gray-100 disabled:opacity-30"
        >
          <ArrowDown size={15} />
        </button>
        <button
          onClick={onRemove}
          title="حذف"
          className="p-1.5 rounded-md text-red-500 hover:bg-red-50"
        >
          <Trash2 size={15} />
        </button>
      </div>
    </div>

    <textarea
      value={q.question || ""}
      onChange={(e) => onChange({ ...q, question: e.target.value })}
      rows={2}
      dir="rtl"
      placeholder="نص السؤال"
      className="w-full p-2.5 mb-3 rounded-lg border border-gray-300 bg-gray-50 text-sm outline-none focus:border-amber-400"
    />

    <div className="space-y-2 mb-3">
      {[0, 1, 2, 3].map((i) => {
        const isCorrect = String(q.answer) === String(i + 1);
        return (
          <div key={i} className="flex items-center gap-2">
            <button
              onClick={() => onChange({ ...q, answer: String(i + 1) })}
              title="اجعله الصحيح"
              className={`w-8 h-8 shrink-0 rounded-lg text-xs font-bold flex items-center justify-center transition-colors ${
                isCorrect
                  ? "bg-green-500 text-white"
                  : "bg-gray-200 text-gray-600 hover:bg-gray-300"
              }`}
            >
              {isCorrect ? <Check size={15} /> : i + 1}
            </button>
            <input
              value={(q.options || [])[i] || ""}
              onChange={(e) => {
                const options = [...(q.options || ["", "", "", ""])];
                while (options.length < 4) options.push("");
                options[i] = e.target.value;
                onChange({ ...q, options });
              }}
              dir="rtl"
              placeholder={`الخيار ${i + 1}`}
              className={`flex-1 p-2 rounded-lg border text-sm outline-none ${
                isCorrect
                  ? "border-green-300 bg-green-50/50"
                  : "border-gray-300 bg-gray-50 focus:border-amber-400"
              }`}
            />
          </div>
        );
      })}
    </div>
  </div>
);

const QuestionsPart = ({ questions, onChange }) => {
  const [search, setSearch] = useState("");

  const visible = useMemo(() => {
    const all = questions.map((question, i) => ({ question, i }));
    const terms = normAr(search).split(" ").filter(Boolean);
    if (!terms.length) return all;
    return all.filter(({ question: q }) => {
      const hay = normAr(`${q.question || ""} ${(Array.isArray(q.options) ? q.options : []).join(" ")}`);
      return terms.every((t) => hay.includes(t));
    });
  }, [questions, search]);

  const setAt = (i, val) => {
    const next = [...questions];
    next[i] = val;
    onChange(next);
  };
  const removeAt = (i) => onChange(questions.filter((_, j) => j !== i));
  const moveAt = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= questions.length) return;
    const next = [...questions];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const add = () => {
    setSearch(""); // السؤال الجديد فارغ فلا يطابق بحثاً — نكشفه بدل أن يختفي
    onChange([
      ...questions,
      { question: "", options: ["", "", "", ""], answer: "1" },
    ]);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <PasteQuestions
          onAdd={(items) => {
            setSearch("");
            onChange([
              ...questions,
              ...items.map((q) => ({ ...q, answer: String(q.answer) })),
            ]);
          }}
        />
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search
            size={15}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            dir="rtl"
            placeholder="ابحث في نص السؤال أو الخيارات…"
            className="w-full pr-9 pl-8 py-2.5 rounded-xl border border-gray-300 bg-white text-sm outline-none focus:border-amber-400"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute left-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-gray-400 hover:bg-gray-100"
            >
              <X size={14} />
            </button>
          )}
        </div>
        <button
          onClick={add}
          className="px-3.5 py-2.5 rounded-xl bg-amber-500 text-white text-sm font-semibold flex items-center gap-1.5 hover:bg-amber-600 shrink-0"
        >
          <Plus size={16} /> سؤال
        </button>
      </div>

      {search.trim() && (
        <p className="text-xs text-gray-500 px-1">
          {visible.length} من {questions.length} · الترقيم أصلي
        </p>
      )}

      {questions.length === 0 ? (
        <EmptyPart
          icon={HelpCircle}
          color="#f59e0b"
          text="لا أسئلة لهذه المحاضرة"
          action="أضف أول سؤال"
          onAction={add}
        />
      ) : visible.length === 0 ? (
        <div className="p-8 text-center rounded-xl border border-dashed border-gray-300 bg-white">
          <p className="text-sm text-gray-600">لا سؤال يطابق «{search.trim()}»</p>
          <button
            onClick={() => setSearch("")}
            className="mt-2 text-xs font-semibold text-amber-600 hover:underline"
          >
            عرض الكل
          </button>
        </div>
      ) : (
        visible.map(({ question, i }) => (
          <QuestionCard
            key={i}
            q={question}
            n={i + 1}
            isFirst={i === 0}
            isLast={i === questions.length - 1}
            onChange={(v) => setAt(i, v)}
            onRemove={() => removeAt(i)}
            onMove={(d) => moveAt(i, d)}
          />
        ))
      )}
    </div>
  );
};

// ─── البطاقات ─────────────────────────────────────────────────────────────────

const FlashPart = ({ cards, onChange, lectureId, sourceText }) => {
  const add = () =>
    onChange([
      ...cards,
      { card_id: `${lectureId}_c${cards.length + 1}_${cards.length}`, front: "", back: "" },
    ]);

  const fromAi = (items) =>
    onChange([
      ...cards,
      ...items.map((c, i) => ({
        card_id: `${lectureId}_ai${cards.length + i + 1}_${Date.now()}`,
        front: c.front,
        back: c.back,
      })),
    ]);

  const tools = (
    <div className="flex items-center gap-2 flex-wrap">
      <GenerateAction kind="flash" text={sourceText} onItems={fromAi} />
    </div>
  );

  if (cards.length === 0) {
    return (
      <div className="space-y-3">
        {tools}
        <EmptyPart
          icon={Sparkles}
          color="#10b981"
          text="لا بطاقات استرجاع لهذه المحاضرة"
          action="أضف أول بطاقة"
          onAction={add}
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {tools}
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-500">{cards.length} بطاقة</span>
        <button
          onClick={add}
          className="px-3.5 py-2 rounded-xl bg-emerald-500 text-white text-sm font-semibold flex items-center gap-1.5 hover:bg-emerald-600"
        >
          <Plus size={16} /> بطاقة
        </button>
      </div>
      {cards.map((c, i) => (
        <div key={i} className="p-4 rounded-xl border border-gray-200 bg-white">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-sm font-black text-emerald-600">#{i + 1}</span>
            <button
              onClick={() => onChange(cards.filter((_, j) => j !== i))}
              className="mr-auto p-1.5 rounded-md text-red-500 hover:bg-red-50"
              title="حذف"
            >
              <Trash2 size={15} />
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="الوجه" hint="السؤال">
              <textarea
                value={c.front || ""}
                onChange={(e) => {
                  const next = [...cards];
                  next[i] = { ...c, front: e.target.value };
                  onChange(next);
                }}
                rows={3}
                dir="rtl"
                className="w-full p-2.5 rounded-lg border border-gray-300 bg-gray-50 text-sm outline-none focus:border-emerald-400"
              />
            </Field>
            <Field label="الظهر" hint="إجابة قصيرة ودقيقة">
              <textarea
                value={c.back || ""}
                onChange={(e) => {
                  const next = [...cards];
                  next[i] = { ...c, back: e.target.value };
                  onChange(next);
                }}
                rows={3}
                dir="rtl"
                className="w-full p-2.5 rounded-lg border border-gray-300 bg-gray-50 text-sm outline-none focus:border-emerald-400"
              />
            </Field>
          </div>
        </div>
      ))}
    </div>
  );
};

// ─── التحريري ─────────────────────────────────────────────────────────────────

const WrittenPart = ({ written, onChange, lectureId, sourceText }) => {
  const qs = written?.questions || [];
  const setQs = (questions) => onChange({ ...written, questions });
  const add = () =>
    setQs([
      ...qs,
      { q_id: `${lectureId}_w${qs.length + 1}_${qs.length}`, question: "", model_answer: "" },
    ]);

  const fromAi = (items) =>
    setQs([
      ...qs,
      ...items.map((q, i) => ({
        q_id: `${lectureId}_ai${qs.length + i + 1}_${Date.now()}`,
        question: q.question,
        model_answer: q.model_answer,
      })),
    ]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <GenerateAction kind="written" text={sourceText} onItems={fromAi} />
      </div>
      <div className="flex items-end gap-3 flex-wrap">
        <div className="w-40">
          <Field label="مدة الاختبار" hint="دقيقة">
            <input
              type="number"
              min={1}
              value={written?.duration_min ?? 30}
              onChange={(e) =>
                onChange({ ...written, duration_min: Number(e.target.value) })
              }
              className="w-full p-2.5 rounded-lg border border-gray-300 bg-white text-sm outline-none focus:border-red-400"
            />
          </Field>
        </div>
        <span className="text-sm text-gray-500 pb-3">{qs.length} سؤال</span>
        <button
          onClick={add}
          className="mr-auto px-3.5 py-2.5 rounded-xl bg-red-500 text-white text-sm font-semibold flex items-center gap-1.5 hover:bg-red-600"
        >
          <Plus size={16} /> سؤال
        </button>
      </div>

      {qs.length === 0 ? (
        <EmptyPart
          icon={PenLine}
          color="#ef4444"
          text="لا أسئلة تحريرية لهذه المحاضرة"
          action="أضف أول سؤال"
          onAction={add}
        />
      ) : (
        qs.map((q, i) => (
          <div key={i} className="p-4 rounded-xl border border-gray-200 bg-white">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-sm font-black text-red-600">#{i + 1}</span>
              <button
                onClick={() => setQs(qs.filter((_, j) => j !== i))}
                className="mr-auto p-1.5 rounded-md text-red-500 hover:bg-red-50"
                title="حذف"
              >
                <Trash2 size={15} />
              </button>
            </div>
            <div className="space-y-3">
              <Field label="السؤال">
                <textarea
                  value={q.question || ""}
                  onChange={(e) => {
                    const next = [...qs];
                    next[i] = { ...q, question: e.target.value };
                    setQs(next);
                  }}
                  rows={2}
                  dir="rtl"
                  className="w-full p-2.5 rounded-lg border border-gray-300 bg-gray-50 text-sm outline-none focus:border-red-400"
                />
              </Field>
              <Field
                label="الجواب النموذجي"
                hint="لوكيل التصحيح — لا يُرسَل لتطبيق الطالب أبداً"
              >
                <textarea
                  value={q.model_answer || ""}
                  onChange={(e) => {
                    const next = [...qs];
                    next[i] = { ...q, model_answer: e.target.value };
                    setQs(next);
                  }}
                  rows={4}
                  dir="rtl"
                  className="w-full p-2.5 rounded-lg border border-amber-200 bg-amber-50/40 text-sm outline-none focus:border-amber-400"
                />
              </Field>
            </div>
          </div>
        ))
      )}
    </div>
  );
};

// ─── الشاشة ───────────────────────────────────────────────────────────────────

/** يعمل بنمطين: صفحةً مستقلة (يقرأ المعرّفات من الرابط)، أو مضمَّناً داخل
 *  مساحة عمل المادة (تُمرَّر إليه بالخصائص). المنطق واحد والفارق العرض. */
const LectureScopeEditor = ({
  examId: examIdProp,
  lectureId: lectureIdProp,
  part: partProp,
  embedded = false,
  onSaved,
}) => {
  const params = useParams();
  const id = examIdProp ?? params.id;
  const lectureId = lectureIdProp ?? params.lectureId;
  const urlPart = partProp ?? params.part;
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const scoped = Boolean(urlPart); // نطاق جزء واحد من الرابط
  const [tab, setTab] = useState(urlPart || "text");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(null); // رسالة نجاح آخر حفظ

  const [meta, setMeta] = useState(null); // { name, lecture, total_questions }
  const [draft, setDraft] = useState({
    summary: null,
    questions: [],
    flash_cards: [],
    written_exam: { duration_min: 30, questions: [] },
    text: "",
  });
  const [textLoading, setTextLoading] = useState(false);
  // علَمٌ منفصل عن محتوى النص: لو حكمنا بالمحتوى وحده، لأعاد المحرّرُ جلبَ
  // النص كلّما أفرغه المستخدم عمداً — فيعود ما حذفه أمام عينيه.
  const [textLoaded, setTextLoaded] = useState(false);
  // الأجزاء المتّسخة — الحفظ يحمل هذه وحدها
  const [dirty, setDirty] = useState(() => new Set());
  const askedRef = useRef(false);

  const markDirty = useCallback((k) => {
    setDirty((prev) => {
      if (prev.has(k)) return prev;
      const next = new Set(prev);
      next.add(k);
      return next;
    });
    setSaved(null);
  }, []);

  // ─── الجلب ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    // المفتاح يشمل المحاضرة: تبديلها داخل مساحة العمل يجب أن يُعيد الجلب،
    // وحارسٌ منطقي بسيط كان يمنع ذلك فتبقى المحاضرة الأولى معروضة أبداً.
    const key = `${id}|${lectureId}|${urlPart || ""}`;
    if (askedRef.current === key) return;
    askedRef.current = key;
    setDirty(new Set());
    setTextLoaded(false);
    setDraft({
      summary: null,
      questions: [],
      flash_cards: [],
      written_exam: { duration_min: 30, questions: [] },
      text: "",
    });
    setLoading(true);
    dispatch(
      fetch_one_subject({
        _id: id,
        scope: scoped ? "part" : "lecture",
        lecture_id: lectureId,
        part: urlPart,
      }),
    )
      .unwrap()
      .then(({ data }) => {
        setMeta({
          name: data.name,
          lecture: data.lecture,
          total_questions: data.total_questions,
        });
        const next = {
          summary: data.summary ?? null,
          questions: (Array.isArray(data.questions) ? data.questions : []).map((x) => x.question),
          flash_cards: data.flash_cards || [],
          written_exam: data.written_exam || { duration_min: 30, questions: [] },
        };
        setDraft((d) => ({ ...d, ...next }));

        // نفتح على أول جزء فيه شيء. الهبوط على شاشة فارغة يوحي بأن
        // المحاضرة فارغة كلّها، والعدّادات وحدها لا تُرى قبل أن يُنظر إليها.
        if (!scoped) {
          const filled =
            (data.lecture?.text_ref && "text") ||
            (next.summary && "summary") ||
            (next.questions.length && "questions") ||
            (next.flash_cards.length && "flash") ||
            (next.written_exam.questions?.length && "written") ||
            "text";
          setTab(filled);
        }
        setLoading(false);
      })
      .catch((e) => {
        setError(typeof e === "string" ? e : "تعذّر جلب المحاضرة");
        setLoading(false);
      });
  }, [dispatch, id, lectureId, urlPart, scoped]);

  // نص المقرر يُجلب منفصلاً: يعيش في كولكشن آخر ولا يُرسَل مع المادة
  useEffect(() => {
    const ref = meta?.lecture?.text_ref;
    // النصّ يُجلَب لأي تبويب يحتاجه، لا لتبويب «نص المقرر» وحده:
    // توليد البطاقات والتحريري يقرأ منه، وكان يجده فارغاً فيتعطّل الزرّ
    // بلا سبب ظاهر — فيُظنّ العطل في Gemini وهو في الجلب.
    const needsText = tab === "text" || tab === "flash" || tab === "written";
    if (!ref || !needsText || textLoaded || textLoading) return;
    setTextLoading(true);
    axios
      .post(`${API_BASE_URL}/getlecturetext`, { PASSWORD, rel_path: ref })
      .then((r) => {
        setDraft((d) => ({ ...d, text: r.data?.text || "" }));
        setTextLoaded(true);
      })
      .catch(() => {
        // 404 يعني «مربوط بمسار بلا وثيقة» — نعدّه محمَّلاً وفارغاً حتى لا
        // ندور في محاولات، ونُبقي المحرّر صالحاً لكتابة النص من الصفر.
        setDraft((d) => ({ ...d, text: "" }));
        setTextLoaded(true);
      })
      .finally(() => setTextLoading(false));
  }, [meta, tab, textLoaded, textLoading]);

  // تحذير المغادرة بتغييرات غير محفوظة — الحارس الوحيد بين عملِ ساعةٍ وضياعه
  useEffect(() => {
    if (dirty.size === 0) return undefined;
    const h = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  // ─── الحفظ ──────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (dirty.size === 0 || saving) return;
    setSaving(true);
    setError(null);
    try {
      // النص يُحفظ على كولكشن نصوص المحاضرات لا على المادة
      if (dirty.has("text") && meta?.lecture?.text_ref) {
        const parts = meta.lecture.text_ref.split("/");
        const file = parts.pop();
        const subject = parts.pop();
        const section = parts.join("/");
        await axios.post(`${API_BASE_URL}/agent/upload-lectures`, {
          PASSWORD,
          lectures: [{ section, subject, file, text: draft.text }],
        });
      }

      // بقية الأجزاء تذهب للمادة — وما لم يُلمَس لا يُذكَر في الحمولة
      const payload = {};
      if (dirty.has("summary")) payload.summary = draft.summary;
      if (dirty.has("questions")) {
        payload.questions = draft.questions;
        payload.total_at_fetch = meta?.total_questions;
      }
      if (dirty.has("flash")) payload.flash_cards = draft.flash_cards;
      if (dirty.has("written")) payload.written_exam = draft.written_exam;

      if (Object.keys(payload).length > 0) {
        const r = await dispatch(
          save_lecture_part({
            _id: id,
            lecture_id: lectureId,
            part: scoped ? urlPart : "all",
            payload,
          }),
        ).unwrap();
        // العدد الجديد يصير مرجع حارس التزامن، فلا يُرفض الحفظ التالي
        if (r?.data?.total_questions !== undefined) {
          setMeta((m) => ({ ...m, total_questions: r.data.total_questions }));
        }
      }

      setDirty(new Set());
      onSaved?.();
      setSaved(`تم حفظ ${dirty.size === 1 ? "الجزء" : `${dirty.size} أجزاء`}`);
      setTimeout(() => setSaved(null), 4000);
    } catch (e) {
      setError(typeof e === "string" ? e : "تعذّر الحفظ");
    } finally {
      setSaving(false);
    }
  };

  const goBack = () => {
    if (dirty.size > 0 && !window.confirm("لديك تغييرات غير محفوظة. أتغادر؟")) {
      return;
    }
    navigate("/exams");
  };

  // ─── العرض ──────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 size={28} className="animate-spin mx-auto text-[#8C52FF]" />
          <p className="text-sm text-gray-500 mt-3">جارٍ جلب المحاضرة…</p>
        </div>
      </div>
    );
  }

  if (error && !meta) {
    return (
      <div className="min-h-screen bg-gray-50 p-6" dir="rtl">
        <button
          onClick={() => navigate("/exams")}
          className="mb-4 flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900"
        >
          <ArrowRight size={17} /> رجوع
        </button>
        <div className="p-6 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
          {error}
        </div>
      </div>
    );
  }

  const counts = {
    text: meta?.lecture?.text_ref ? "مربوط" : "—",
    summary: draft.summary ? `${draft.summary.sections?.length || 0} قسم` : "—",
    questions: draft.questions.length || "—",
    flash: draft.flash_cards.length || "—",
    written: draft.written_exam?.questions?.length || "—",
  };
  const visibleParts = scoped ? PARTS.filter((p) => p.key === urlPart) : PARTS;
  const active = PARTS.find((p) => p.key === tab) || PARTS[0];

  return (
    <div className={embedded ? "" : "min-h-screen bg-gray-50"} dir="rtl">
      {/* الترويسة */}
      <div className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-gray-200">
        <div className="px-4 py-3 flex items-center gap-3">
          {!embedded && (
          <button
            onClick={goBack}
            className="p-2 rounded-lg text-gray-500 hover:bg-gray-100"
            title="رجوع"
          >
            <ArrowRight size={18} />
          </button>
          )}
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-bold text-gray-900 truncate">
              {meta?.lecture?.title || "محاضرة"}
            </h1>
            <p className="text-xs text-gray-500 truncate">
              {meta?.name}
              {scoped && ` · ${active.label} فقط`}
            </p>
          </div>

          {saved && (
            <span className="text-xs font-semibold text-green-700 bg-green-50 border border-green-200 px-2.5 py-1.5 rounded-lg flex items-center gap-1.5">
              <Check size={14} /> {saved}
            </span>
          )}
          {dirty.size > 0 && !saved && (
            <span className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1.5 rounded-lg">
              {dirty.size} تغيير غير محفوظ
            </span>
          )}

          <button
            onClick={handleSave}
            disabled={dirty.size === 0 || saving}
            className="px-4 py-2.5 rounded-xl bg-[#8C52FF] text-white text-sm font-bold flex items-center gap-1.5 hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
          >
            {saving ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Save size={16} />
            )}
            حفظ
          </button>
        </div>

        {/* التبويبات — العدّاد يقول ما ينقص المحاضرة قبل أن تفتحه */}
        <div className="px-3 pb-2 flex items-center gap-1.5 overflow-x-auto">
          {visibleParts.map((p) => {
            const isActive = tab === p.key;
            const isDirty = dirty.has(p.key);
            return (
              <button
                key={p.key}
                onClick={() => setTab(p.key)}
                className={`px-3 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 shrink-0 transition-colors border ${
                  isActive
                    ? "border-transparent text-white"
                    : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                }`}
                style={isActive ? { backgroundColor: p.color } : undefined}
              >
                <p.icon size={15} />
                {p.label}
                <span
                  className={`text-[11px] font-normal ${
                    isActive ? "text-white/75" : "text-gray-400"
                  }`}
                >
                  {counts[p.key]}
                </span>
                {isDirty && (
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      isActive ? "bg-white" : "bg-amber-500"
                    }`}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* شريط النطاق — وعدٌ صريح بما ستكتبه هذه الشاشة وما لن تقترب منه */}
      <div className="mx-4 mt-3 px-3.5 py-2.5 rounded-xl bg-purple-50 border border-purple-100 text-xs text-purple-900 flex items-start gap-2">
        <Info size={14} className="mt-0.5 shrink-0 text-purple-500" />
        <span>
          {dirty.size === 0
            ? "لم تغيّر شيئاً بعد — لن يُرسَل شيء."
            : `الحفظ سيكتب: ${[...dirty]
                .map((k) => PARTS.find((p) => p.key === k)?.label || k)
                .join("، ")}.`}{" "}
          بقيّة المادة — الأسئلة والملخصات والمحاضرات الأخرى — لا تُمَسّ.
        </span>
      </div>

      {error && (
        <div className="mx-4 mt-3 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* المحتوى */}
      <div className="p-4 pb-24">
        {tab === "text" && (
          <TextPart
            textRef={meta?.lecture?.text_ref}
            text={draft.text}
            loading={textLoading}
            lectureName={meta?.lecture?.title}
            subjectName={meta?.name}
            onChange={(v) => {
              setDraft((d) => ({ ...d, text: v }));
              markDirty("text");
            }}
          />
        )}

        {tab === "summary" &&
          (draft.summary ? (
            // SummaryEditor يعمل على مصفوفة ملخصات المادة؛ نمرّر ملخص هذه
            // المحاضرة وحده ونعيد الأول — فلا يرى محاضرةً غيرها ولا يحرّكها.
            <SummaryEditor
              formData={{ summary: [draft.summary] }}
              handleChange={(name, val) => {
                if (name !== "summary") return;
                setDraft((d) => ({ ...d, summary: val[0] ?? null }));
                markDirty("summary");
              }}
            />
          ) : (
            <EmptyPart
              icon={FileText}
              color="#8C52FF"
              text="لا ملخص مربوط بهذه المحاضرة"
              action="أنشئ ملخصاً فارغاً"
              onAction={() => {
                setDraft((d) => ({
                  ...d,
                  summary: {
                    meta: {
                      lecture_id: lectureId,
                      lecture_title: meta?.lecture?.title || "",
                    },
                    sections: [],
                  },
                }));
                markDirty("summary");
              }}
            />
          ))}

        {tab === "questions" && (
          <QuestionsPart
            questions={draft.questions}
            onChange={(v) => {
              setDraft((d) => ({ ...d, questions: v }));
              markDirty("questions");
            }}
          />
        )}

        {tab === "flash" && (
          <FlashPart
            cards={draft.flash_cards}
            lectureId={lectureId}
            sourceText={draft.text}
            onChange={(v) => {
              setDraft((d) => ({ ...d, flash_cards: v }));
              markDirty("flash");
            }}
          />
        )}

        {tab === "written" && (
          <WrittenPart
            written={draft.written_exam}
            lectureId={lectureId}
            sourceText={draft.text}
            onChange={(v) => {
              setDraft((d) => ({ ...d, written_exam: v }));
              markDirty("written");
            }}
          />
        )}
      </div>
    </div>
  );
};

export default LectureScopeEditor;
