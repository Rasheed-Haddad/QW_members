import { Fragment, useEffect, useMemo, useState, useCallback } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useParams, Link } from "react-router-dom";
import {
  ArrowRightIcon,
  Plus,
  Save,
  Trash2,
  ArrowUp,
  ArrowDown,
  ChevronDown,
  ChevronLeft,
  Wand2,
  CheckCircle2,
  MinusCircle,
  FileText,
  BookOpen,
  HelpCircle,
  Layers,
  PenLine,
  BadgeCheck,
  Search,
} from "lucide-react";
import {
  fetch_exams,
  fetch_lecture_texts,
  update_lectures,
} from "../../store/examsSlice";

// ─── أدوات ────────────────────────────────────────────────────────────────────

const newId = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const getSummaryTitle = (obj) =>
  obj?.meta?.lecture_title || obj?.lecture_title || obj?.title || "";

// أعمدة شبكة الاكتمال — رمز + نص، لا لون وحده
const CONTENT_TYPES = [
  { key: "text", label: "المقرر", icon: BookOpen },
  { key: "summary", label: "الملخص", icon: FileText },
  { key: "questions", label: "الأسئلة", icon: HelpCircle },
  { key: "flash", label: "فلاش كاردز", icon: Layers },
  { key: "written", label: "التحريري", icon: PenLine },
];

// ─── خلية اكتمال ─────────────────────────────────────────────────────────────

const StatusCell = ({ ok, count }) => (
  <div
    className={`flex items-center justify-center gap-1 py-2 rounded-lg text-xs font-semibold ${
      ok ? "bg-green-50 text-green-700" : "bg-gray-50 text-gray-400"
    }`}
  >
    {ok ? <CheckCircle2 size={13} /> : <MinusCircle size={13} />}
    {ok ? (count !== undefined ? count : "مربوط") : "ناقص"}
  </div>
);

// ─── محرر فلاش كاردز لمحاضرة ─────────────────────────────────────────────────

const FlashCardsEditor = ({ cards, onChange }) => {
  const updateCard = (i, field, value) => {
    const next = cards.map((c, idx) =>
      idx === i ? { ...c, [field]: value } : c,
    );
    onChange(next);
  };
  const addCard = () =>
    onChange([...cards, { card_id: newId(), front: "", back: "" }]);
  const removeCard = (i) => onChange(cards.filter((_, idx) => idx !== i));
  const moveCard = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= cards.length) return;
    const next = [...cards];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  return (
    <div className="space-y-3">
      {cards.length === 0 && (
        <p className="text-xs text-gray-400 text-center py-3">
          لا بطاقات بعد — أضف أول بطاقة
        </p>
      )}
      {cards.map((card, i) => (
        <div
          key={card.card_id}
          className="border border-gray-200 rounded-xl p-3 bg-white space-y-2"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-500">
              بطاقة {i + 1}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => moveCard(i, -1)}
                disabled={i === 0}
                className="p-1 rounded text-gray-400 hover:text-gray-700 disabled:opacity-30"
                title="تحريك لأعلى"
              >
                <ArrowUp size={14} />
              </button>
              <button
                onClick={() => moveCard(i, 1)}
                disabled={i === cards.length - 1}
                className="p-1 rounded text-gray-400 hover:text-gray-700 disabled:opacity-30"
                title="تحريك لأسفل"
              >
                <ArrowDown size={14} />
              </button>
              <button
                onClick={() => removeCard(i)}
                className="p-1 rounded text-red-400 hover:text-red-600"
                title="حذف البطاقة"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <div>
              <span className="text-[11px] text-gray-500">الوجه (السؤال)</span>
              <textarea
                value={card.front}
                onChange={(e) => updateCard(i, "front", e.target.value)}
                rows={2}
                className="w-full border border-gray-200 rounded-lg p-2 text-sm"
                placeholder="مثال: ما وظيفة الميتوكوندريا؟"
              />
            </div>
            <div>
              <span className="text-[11px] text-gray-500">الظهر (الجواب)</span>
              <textarea
                value={card.back}
                onChange={(e) => updateCard(i, "back", e.target.value)}
                rows={2}
                className="w-full border border-gray-200 rounded-lg p-2 text-sm"
                placeholder="إنتاج الطاقة (ATP)"
              />
            </div>
          </div>
        </div>
      ))}
      <button
        onClick={addCard}
        className="w-full flex items-center justify-center gap-2 py-2 rounded-xl border-2 border-dashed border-gray-300 text-gray-500 hover:border-brand hover:text-brand text-sm font-semibold transition"
      >
        <Plus size={15} />
        إضافة بطاقة
      </button>
    </div>
  );
};

// ─── محرر الاختبار التحريري لمحاضرة ──────────────────────────────────────────

const WrittenExamEditor = ({ writtenExam, onChange }) => {
  const questions = Array.isArray(writtenExam.questions) ? writtenExam.questions : [];
  const updateQuestion = (i, field, value) => {
    const next = questions.map((q, idx) =>
      idx === i ? { ...q, [field]: value } : q,
    );
    onChange({ ...writtenExam, questions: next });
  };
  const addQuestion = () =>
    onChange({
      ...writtenExam,
      questions: [
        ...questions,
        { q_id: newId(), question: "", model_answer: "" },
      ],
    });
  const removeQuestion = (i) =>
    onChange({
      ...writtenExam,
      questions: questions.filter((_, idx) => idx !== i),
    });

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-600">مدة الاختبار (دقيقة):</span>
        <input
          type="number"
          min={5}
          value={writtenExam.duration_min}
          onChange={(e) =>
            onChange({
              ...writtenExam,
              duration_min: Number(e.target.value) || 30,
            })
          }
          className="w-20 border border-gray-200 rounded-lg p-1.5 text-sm text-center"
        />
      </div>
      <p className="text-[11px] text-amber-600 bg-amber-50 rounded-lg px-3 py-2 leading-relaxed">
        الجواب النموذجي يبقى في السيرفر لوكيل التصحيح فقط — لا يصل للطالب أبداً.
      </p>
      {questions.length === 0 && (
        <p className="text-xs text-gray-400 text-center py-3">
          لا أسئلة بعد — أضف أول سؤال تحريري
        </p>
      )}
      {questions.map((q, i) => (
        <div
          key={q.q_id}
          className="border border-gray-200 rounded-xl p-3 bg-white space-y-2"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-500">
              سؤال {i + 1}
            </span>
            <button
              onClick={() => removeQuestion(i)}
              className="p-1 rounded text-red-400 hover:text-red-600"
              title="حذف السؤال"
            >
              <Trash2 size={14} />
            </button>
          </div>
          <div>
            <span className="text-[11px] text-gray-500">نص السؤال</span>
            <textarea
              value={q.question}
              onChange={(e) => updateQuestion(i, "question", e.target.value)}
              rows={2}
              className="w-full border border-gray-200 rounded-lg p-2 text-sm"
            />
          </div>
          <div>
            <span className="text-[11px] text-gray-500">
              الجواب النموذجي (للتصحيح الآلي)
            </span>
            <textarea
              value={q.model_answer}
              onChange={(e) =>
                updateQuestion(i, "model_answer", e.target.value)
              }
              rows={3}
              className="w-full border border-gray-200 rounded-lg p-2 text-sm bg-amber-50/40"
            />
          </div>
        </div>
      ))}
      <button
        onClick={addQuestion}
        className="w-full flex items-center justify-center gap-2 py-2 rounded-xl border-2 border-dashed border-gray-300 text-gray-500 hover:border-brand hover:text-brand text-sm font-semibold transition"
      >
        <Plus size={15} />
        إضافة سؤال تحريري
      </button>
    </div>
  );
};

// ─── الصفحة الرئيسية ─────────────────────────────────────────────────────────

const LecturesManager = () => {
  const { id } = useParams();
  const dispatch = useDispatch();
  const { exams, lecture_texts, loading, error } = useSelector(
    (state) => state.exams,
  );
  const exam = exams.find((e) => e._id === id);

  const [lectures, setLectures] = useState([]);
  const [expanded, setExpanded] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [initialized, setInitialized] = useState(false);
  const [textsSearch, setTextsSearch] = useState("");

  // بحث نصوص المقررات — بتأخير قصير حتى لا نرسل طلباً مع كل حرف
  useEffect(() => {
    const t = setTimeout(() => {
      dispatch(fetch_lecture_texts(textsSearch.trim()));
    }, 400);
    return () => clearTimeout(t);
  }, [textsSearch, dispatch]);

  // جلب المادة عند فتح الصفحة مباشرة (النصوص يجلبها تأثير البحث أعلاه)
  useEffect(() => {
    if (!exam) dispatch(fetch_exams(""));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // تهيئة الحالة المحلية من المادة (مرة واحدة عند توفرها)
  useEffect(() => {
    if (!exam || initialized) return;
    const summaryArr = Array.isArray(exam.summary) ? exam.summary : [];
    const takenSummary = new Set();
    const fromDb = (Array.isArray(exam.lectures) ? exam.lectures : []).map((l) => {
      // المعرّف أولاً، فإن لم يوجد فالعنوان: «أنشئ تلقائياً» يولّد معرّفات
      // جديدة فتبدو كل الملخصات مفقودة رغم أنها مرتبطة بعناوينها.
      let summary_index = summaryArr.findIndex(
        (s) => s?.meta?.lecture_id && s.meta.lecture_id === l.lecture_id,
      );
      if (summary_index < 0) {
        const title = String(l.title || "").trim();
        summary_index = summaryArr.findIndex(
          (s, i) =>
            !takenSummary.has(i) &&
            String(s?.meta?.lecture_title || "").trim() === title &&
            title !== "",
        );
      }
      if (summary_index >= 0) takenSummary.add(summary_index);
      return {
        lecture_id: l.lecture_id,
        title: l.title || "",
        order: l.order ?? 0,
        text_ref: l.text_ref || "",
        questions_lecture_name: l.questions_lecture_name || "",
        summary_index: summary_index >= 0 ? summary_index : -1,
        flash_cards: (Array.isArray(l.flash_cards) ? l.flash_cards : []).map((c) => ({ ...c })),
        written_exam: {
          duration_min: l.written_exam?.duration_min ?? 30,
          questions: (l.written_exam?.questions || []).map((q) => ({ ...q })),
        },
      };
    });
    setLectures(fromDb.sort((a, b) => a.order - b.order));
    setInitialized(true);
  }, [exam, initialized]);

  // ── مشتقات ──
  const summaryOptions = useMemo(() => {
    if (!exam?.summary) return [];
    return (Array.isArray(exam.summary) ? exam.summary : []).map((s, i) => ({
      index: i,
      title: getSummaryTitle(s) || `ملخص بلا عنوان (${i + 1})`,
    }));
  }, [exam]);

  const questionGroups = useMemo(() => {
    const counts = new Map();
    (exam?.questions || []).forEach((q) => {
      const name = (q.lecture || "").trim();
      if (name) counts.set(name, (counts.get(name) || 0) + 1);
    });
    return Array.from(counts.entries()).map(([name, count]) => ({
      name,
      count,
    }));
  }, [exam]);

  const questionCountByName = useMemo(
    () => new Map(questionGroups.map((g) => [g.name, g.count])),
    [questionGroups],
  );

  const wordCountByRef = useMemo(
    () => new Map((lecture_texts || []).map((t) => [t.rel_path, t.chars])),
    [lecture_texts],
  );

  // اكتمال كل محاضرة — يُحسب حياً ليعكس ما لم يُحفظ بعد
  const completeness = useMemo(
    () =>
      lectures.map((l) => ({
        lecture_id: l.lecture_id,
        text: Boolean(l.text_ref),
        summary: l.summary_index >= 0,
        questions:
          Boolean(l.questions_lecture_name) &&
          (questionCountByName.get(l.questions_lecture_name) || 0) > 0,
        questions_count:
          questionCountByName.get(l.questions_lecture_name) || 0,
        flash: (Array.isArray(l.flash_cards) ? l.flash_cards : []).filter((c) => c.front.trim() && c.back.trim())
          .length,
        written: (Array.isArray(l.written_exam.questions) ? l.written_exam.questions : []).filter(
          (q) => q.question.trim() && q.model_answer.trim(),
        ).length,
      })),
    [lectures, questionCountByName],
  );

  const moadalReady =
    completeness.length > 0 &&
    completeness.every(
      (c) => c.text && c.summary && c.questions && c.flash > 0 && c.written > 0,
    );

  // ── تعديلات الحالة ──
  const patchLecture = useCallback((lecture_id, patch) => {
    setLectures((prev) =>
      prev.map((l) => (l.lecture_id === lecture_id ? { ...l, ...patch } : l)),
    );
    setDirty(true);
    setSaveMessage("");
  }, []);

  const addLecture = () => {
    const l = {
      lecture_id: newId(),
      title: "",
      order: lectures.length,
      text_ref: "",
      questions_lecture_name: "",
      summary_index: -1,
      flash_cards: [],
      written_exam: { duration_min: 30, questions: [] },
    };
    setLectures((prev) => [...prev, l]);
    setExpanded(l.lecture_id);
    setDirty(true);
  };

  const removeLecture = (lecture_id) => {
    const target = lectures.find((l) => l.lecture_id === lecture_id);
    const hasContent =
      target &&
      ((Array.isArray(target.flash_cards) ? target.flash_cards : []).length > 0 ||
        (Array.isArray(target.written_exam.questions) ? target.written_exam.questions : []).length > 0);
    if (
      hasContent &&
      !window.confirm(
        `حذف «${target.title || "محاضرة بلا اسم"}» سيحذف بطاقاتها وأسئلتها التحريرية أيضاً. متابعة؟`,
      )
    )
      return;
    setLectures((prev) => prev.filter((l) => l.lecture_id !== lecture_id));
    setDirty(true);
  };

  const moveLecture = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= lectures.length) return;
    setLectures((prev) => {
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next.map((l, idx) => ({ ...l, order: idx }));
    });
    setDirty(true);
  };

  // إنشاء تلقائي: محاضرة لكل عنوان ملخص + ربط مجموعة الأسئلة المطابقة بالاسم،
  // ثم مجموعات الأسئلة التي لم تُطابق تصبح محاضرات إضافية
  const autoCreate = () => {
    const created = [];
    const usedGroups = new Set();
    summaryOptions.forEach((s) => {
      const match = questionGroups.find((g) => g.name === s.title);
      if (match) usedGroups.add(match.name);
      created.push({
        lecture_id: newId(),
        title: s.title,
        order: created.length,
        text_ref: "",
        questions_lecture_name: match ? match.name : "",
        summary_index: s.index,
        flash_cards: [],
        written_exam: { duration_min: 30, questions: [] },
      });
    });
    questionGroups.forEach((g) => {
      if (usedGroups.has(g.name)) return;
      created.push({
        lecture_id: newId(),
        title: g.name,
        order: created.length,
        text_ref: "",
        questions_lecture_name: g.name,
        summary_index: -1,
        flash_cards: [],
        written_exam: { duration_min: 30, questions: [] },
      });
    });
    setLectures(created);
    setDirty(true);
  };

  // ── الحفظ ──
  const handleSave = async () => {
    const noTitle = lectures.filter((l) => !l.title.trim());
    if (noTitle.length > 0) {
      alert("كل محاضرة تحتاج اسماً قبل الحفظ");
      return;
    }
    try {
      const payload = {
        _id: id,
        lectures: lectures.map(({ summary_index, ...l }, i) => ({
          ...l,
          order: i,
        })),
        summary_links: lectures
          .filter((l) => l.summary_index >= 0)
          .map((l) => ({
            lecture_id: l.lecture_id,
            summary_index: l.summary_index,
          })),
      };
      await dispatch(update_lectures(payload)).unwrap();
      setDirty(false);
      setSaveMessage("تم الحفظ");
    } catch (e) {
      setSaveMessage("");
      alert(`تعذر الحفظ: ${e}`);
    }
  };

  // ── حالات الشاشة ──
  if (!exam) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        {loading ? (
          <p className="text-gray-500">جارٍ تحميل المادة…</p>
        ) : (
          <>
            <p className="text-xl text-gray-600">لم يتم العثور على المادة</p>
            <Link
              to="/exams"
              className="text-brand flex items-center hover:underline"
            >
              <ArrowRightIcon size={16} className="ml-1" />
              العودة إلى قائمة المواد
            </Link>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 sm:gap-4">
          <Link
            to={`/exams/${id}`}
            className="p-2 rounded-xl bg-brand/10 text-brand hover:bg-brand/20 transition"
          >
            <ArrowRightIcon size={20} />
          </Link>
          <div>
            <h1 className="text-lg sm:text-2xl font-bold text-brand">
              محاضرات المادة
            </h1>
            <p className="text-xs text-gray-500 mt-0.5">{exam.name}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* حالة أهلية معدل — رمز + نص */}
          <div
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold ${
              moadalReady
                ? "bg-green-50 text-green-700"
                : "bg-gray-100 text-gray-500"
            }`}
            title={
              moadalReady
                ? "كل المحاضرات مكتملة — خطة معدل ستتفعل عند الحفظ"
                : "خطة معدل تتطلب اكتمال الأنواع الخمسة لكل محاضرة"
            }
          >
            <BadgeCheck size={14} />
            {moadalReady ? "مؤهلة لخطة معدل" : "غير مؤهلة لمعدل بعد"}
          </div>

          <button
            onClick={handleSave}
            disabled={loading || !dirty}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition ${
              dirty
                ? "bg-brand text-white hover:opacity-90"
                : "bg-gray-100 text-gray-400"
            }`}
          >
            <Save size={15} />
            {loading ? "جارٍ الحفظ…" : dirty ? "حفظ التغييرات" : saveMessage || "محفوظ"}
          </button>
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3">
          {error}
        </p>
      )}

      {/* شبكة الاكتمال — نظرة واحدة تكفي لمعرفة الناقص */}
      {lectures.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-4 overflow-x-auto">
          <div
            className="grid gap-2 min-w-[560px]"
            style={{
              gridTemplateColumns: `minmax(140px, 1.4fr) repeat(${CONTENT_TYPES.length}, 1fr)`,
            }}
          >
            <div className="text-xs font-bold text-gray-500 py-2">
              المحاضرة
            </div>
            {CONTENT_TYPES.map((t) => (
              <div
                key={t.key}
                className="flex items-center justify-center gap-1 text-xs font-bold text-gray-500 py-2"
              >
                <t.icon size={13} />
                {t.label}
              </div>
            ))}
            {lectures.map((l, i) => {
              const c = completeness[i];
              return (
                <Fragment key={l.lecture_id}>
                  <button
                    onClick={() => setExpanded(l.lecture_id)}
                    className="text-right text-sm font-semibold text-gray-800 hover:text-brand truncate py-2"
                    title={l.title}
                  >
                    {i + 1}. {l.title || "بلا اسم"}
                  </button>
                  <StatusCell ok={c.text} />
                  <StatusCell ok={c.summary} />
                  <StatusCell
                    ok={c.questions}
                    count={c.questions ? c.questions_count : undefined}
                  />
                  <StatusCell
                    ok={c.flash > 0}
                    count={c.flash > 0 ? c.flash : undefined}
                  />
                  <StatusCell
                    ok={c.written > 0}
                    count={c.written > 0 ? c.written : undefined}
                  />
                </Fragment>
              );
            })}
          </div>
        </div>
      )}

      {/* بحث نصوص المقررات — يضيّق قوائم «نص المقرر» في كل المحاضرات */}
      <div className="bg-white rounded-xl border border-gray-100 p-3 flex items-center gap-2">
        <Search size={15} className="text-gray-400 flex-shrink-0" />
        <input
          value={textsSearch}
          onChange={(e) => setTextsSearch(e.target.value)}
          placeholder="ابحث في نصوص المقررات باسم المادة (مثال: مرضي عام)…"
          className="flex-1 text-sm outline-none bg-transparent"
        />
        <span className="text-[11px] text-gray-400 flex-shrink-0">
          {(lecture_texts || []).length} ملف
        </span>
      </div>

      {/* حالة فارغة: الإنشاء التلقائي هو الطريق الأساسي */}
      {lectures.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-8 text-center space-y-4">
          <p className="text-gray-600">
            لا محاضرات معرّفة لهذه المادة بعد.
          </p>
          {(summaryOptions.length > 0 || questionGroups.length > 0) && (
            <button
              onClick={autoCreate}
              className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-brand text-white text-sm font-bold hover:opacity-90 transition"
            >
              <Wand2 size={16} />
              أنشئ المحاضرات تلقائياً من الملخص والأسئلة (
              {summaryOptions.length || questionGroups.length} محاضرة)
            </button>
          )}
          <div>
            <button
              onClick={addLecture}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 text-gray-600 text-sm font-semibold hover:border-brand hover:text-brand transition"
            >
              <Plus size={15} />
              أو أضف محاضرة يدوياً
            </button>
          </div>
        </div>
      )}

      {/* بطاقات المحاضرات */}
      <div className="space-y-3">
        {lectures.map((l, i) => {
          const isOpen = expanded === l.lecture_id;
          const c = completeness[i];
          return (
            <div
              key={l.lecture_id}
              className="bg-white rounded-xl border border-gray-100"
            >
              {/* رأس البطاقة */}
              <div className="flex items-center gap-2 p-3">
                <button
                  onClick={() => setExpanded(isOpen ? null : l.lecture_id)}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-brand"
                  title={isOpen ? "طي" : "فتح"}
                >
                  {isOpen ? (
                    <ChevronDown size={17} />
                  ) : (
                    <ChevronLeft size={17} />
                  )}
                </button>
                <span className="w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-full bg-brand/10 text-brand text-xs font-bold">
                  {i + 1}
                </span>
                <input
                  value={l.title}
                  onChange={(e) =>
                    patchLecture(l.lecture_id, { title: e.target.value })
                  }
                  placeholder="اسم المحاضرة (موحّد عبر كل الشاشات)"
                  className="flex-1 border border-transparent hover:border-gray-200 focus:border-brand rounded-lg p-2 text-sm font-semibold outline-none transition"
                />
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => moveLecture(i, -1)}
                    disabled={i === 0}
                    className="p-1.5 rounded text-gray-400 hover:text-gray-700 disabled:opacity-30"
                    title="تحريك لأعلى"
                  >
                    <ArrowUp size={15} />
                  </button>
                  <button
                    onClick={() => moveLecture(i, 1)}
                    disabled={i === lectures.length - 1}
                    className="p-1.5 rounded text-gray-400 hover:text-gray-700 disabled:opacity-30"
                    title="تحريك لأسفل"
                  >
                    <ArrowDown size={15} />
                  </button>
                  <button
                    onClick={() => removeLecture(l.lecture_id)}
                    className="p-1.5 rounded text-red-400 hover:text-red-600"
                    title="حذف المحاضرة"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>

              {/* جسم البطاقة */}
              {isOpen && (
                <div className="border-t border-gray-100 p-4 space-y-5">
                  {/* الربط الثلاثي */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                    {/* نص المقرر */}
                    <div>
                      <span className="text-xs font-bold text-gray-600 flex items-center gap-1 mb-1">
                        <BookOpen size={13} />
                        نص المقرر
                      </span>
                      <select
                        value={l.text_ref}
                        onChange={(e) =>
                          patchLecture(l.lecture_id, {
                            text_ref: e.target.value,
                          })
                        }
                        className="w-full border border-gray-200 rounded-lg p-2 text-sm bg-white"
                      >
                        <option value="">— غير مربوط —</option>
                        {/* الربط الحالي يبقى ظاهراً حتى لو خرج من نتائج البحث */}
                        {l.text_ref &&
                          !(lecture_texts || []).some(
                            (t) => t.rel_path === l.text_ref,
                          ) && (
                            <option value={l.text_ref}>{l.text_ref}</option>
                          )}
                        {(lecture_texts || []).map((t) => (
                          <option key={t.rel_path} value={t.rel_path}>
                            {t.subject} / {t.file}
                          </option>
                        ))}
                      </select>
                      {l.text_ref && (
                        <p className="text-[11px] text-gray-400 mt-1">
                          {wordCountByRef.get(l.text_ref)
                            ? `${wordCountByRef.get(l.text_ref)} حرفاً`
                            : ""}
                        </p>
                      )}
                    </div>

                    {/* الملخص */}
                    <div>
                      <span className="text-xs font-bold text-gray-600 flex items-center gap-1 mb-1">
                        <FileText size={13} />
                        الملخص
                      </span>
                      <select
                        value={l.summary_index}
                        onChange={(e) =>
                          patchLecture(l.lecture_id, {
                            summary_index: Number(e.target.value),
                          })
                        }
                        className="w-full border border-gray-200 rounded-lg p-2 text-sm bg-white"
                      >
                        <option value={-1}>— غير مربوط —</option>
                        {summaryOptions.map((s) => {
                          const takenBy = lectures.find(
                            (other) =>
                              other.lecture_id !== l.lecture_id &&
                              other.summary_index === s.index,
                          );
                          return (
                            <option
                              key={s.index}
                              value={s.index}
                              disabled={Boolean(takenBy)}
                            >
                              {s.title}
                              {takenBy
                                ? ` (مربوط بـ ${takenBy.title || "محاضرة أخرى"})`
                                : ""}
                            </option>
                          );
                        })}
                      </select>
                    </div>

                    {/* الأسئلة */}
                    <div>
                      <span className="text-xs font-bold text-gray-600 flex items-center gap-1 mb-1">
                        <HelpCircle size={13} />
                        مجموعة الأسئلة
                      </span>
                      <select
                        value={l.questions_lecture_name}
                        onChange={(e) =>
                          patchLecture(l.lecture_id, {
                            questions_lecture_name: e.target.value,
                          })
                        }
                        className="w-full border border-gray-200 rounded-lg p-2 text-sm bg-white"
                      >
                        <option value="">— غير مربوطة —</option>
                        {questionGroups.map((g) => {
                          const takenBy = lectures.find(
                            (other) =>
                              other.lecture_id !== l.lecture_id &&
                              other.questions_lecture_name === g.name,
                          );
                          return (
                            <option
                              key={g.name}
                              value={g.name}
                              disabled={Boolean(takenBy)}
                            >
                              {g.name} ({g.count} سؤال)
                              {takenBy
                                ? ` — مربوطة بـ ${takenBy.title || "محاضرة أخرى"}`
                                : ""}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  </div>

                  {/* فلاش كاردز */}
                  <div>
                    <h4 className="text-sm font-bold text-gray-700 flex items-center gap-1.5 mb-2">
                      <Layers size={15} className="text-brand" />
                      فلاش كاردز ({c.flash})
                    </h4>
                    <FlashCardsEditor
                      cards={l.flash_cards}
                      onChange={(cards) =>
                        patchLecture(l.lecture_id, { flash_cards: cards })
                      }
                    />
                  </div>

                  {/* الاختبار التحريري */}
                  <div>
                    <h4 className="text-sm font-bold text-gray-700 flex items-center gap-1.5 mb-2">
                      <PenLine size={15} className="text-brand" />
                      الاختبار التحريري ({c.written})
                    </h4>
                    <WrittenExamEditor
                      writtenExam={l.written_exam}
                      onChange={(we) =>
                        patchLecture(l.lecture_id, { written_exam: we })
                      }
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {lectures.length > 0 && (
        <button
          onClick={addLecture}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-gray-300 text-gray-500 hover:border-brand hover:text-brand text-sm font-bold transition"
        >
          <Plus size={16} />
          إضافة محاضرة
        </button>
      )}
    </div>
  );
};

export default LecturesManager;
