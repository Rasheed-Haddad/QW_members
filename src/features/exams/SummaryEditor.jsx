import { memo, useState, useCallback, useRef, useEffect } from "react";
import {
  Trash2,
  ChevronDown,
  ChevronRight,
  ClipboardPaste,
  X,
  AlertCircle,
  CheckCircle2,
  Layers,
  AlertTriangle,
} from "lucide-react";

// ─── Design Tokens ────────────────────────────────────────────────────────────
const V = "#8c52ff";
const C = "#ff526f";
const T = "#009980";

// ─── Pill ─────────────────────────────────────────────────────────────────────
const Pill = ({ color = "gray", children }) => {
  const s = {
    v: { background: V + "20", color: V, border: `1.5px solid ${V}44` },
    c: { background: C + "20", color: C, border: `1.5px solid ${C}44` },
    t: { background: T + "20", color: T, border: `1.5px solid ${T}44` },
    gray: { background: "#f1f1f4", color: "#888", border: "1.5px solid #ddd" },
  };
  return (
    <span
      className="text-xs font-bold px-3 py-1 rounded-full whitespace-nowrap"
      style={s[color] || s.gray}
    >
      {children}
    </span>
  );
};

// ─── JSON Paste Modal ─────────────────────────────────────────────────────────
const JsonPasteModal = memo(({ onClose, onApply, replaces = false }) => {
  const [text, setText] = useState("");
  const [error, setError] = useState(null);
  const [preview, setPreview] = useState(null);

  const validate = (parsed) => {
    if (typeof parsed !== "object" || parsed === null)
      return "يجب أن يكون JSON كائناً";
    if (!parsed.meta?.lecture_title && !parsed.lecture_title && !parsed.title)
      return "لا يوجد عنوان محاضرة (meta.lecture_title)";
    if (parsed.sections && !Array.isArray(parsed.sections))
      return "حقل sections يجب أن يكون مصفوفة";
    return null;
  };

  const handleParse = () => {
    setError(null);
    setPreview(null);
    try {
      const parsed = JSON.parse(text.trim());
      const err = validate(parsed);
      if (err) {
        setError(err);
        return;
      }
      setPreview(parsed);
    } catch (e) {
      setError(`خطأ في صياغة JSON: ${e.message}`);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-6">
      <div
        dir="rtl"
        className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden"
      >
        <div className="flex items-center justify-between px-7 py-5 border-b-2 border-gray-100">
          <div>
            <h3 className="text-xl font-black text-gray-900">
              لصق JSON محاضرة
            </h3>
            <p className="text-sm text-gray-400 mt-0.5">
              {replaces
                ? "الصق JSON كما هو — سيحلّ محلّ ملخّص هذه المحاضرة"
                : "الصق JSON كما هو — سيتم حفظه بدون تعديل"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
          >
            <X size={22} color="#666" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-7 space-y-4">
          <textarea
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setError(null);
              setPreview(null);
            }}
            placeholder={`{\n  "meta": { "lecture_title": "اسم المحاضرة" },\n  "sections": [...]\n}`}
            rows={12}
            className="w-full font-mono text-sm border-2 border-gray-200 rounded-2xl p-5 focus:outline-none resize-none bg-gray-50 leading-relaxed"
            style={{ direction: "ltr" }}
            onFocus={(e) => (e.target.style.borderColor = V)}
            onBlur={(e) => (e.target.style.borderColor = "#e5e7eb")}
          />
          {error && (
            <div
              className="flex items-start gap-3 p-4 rounded-2xl border-2"
              style={{ background: "#fff0f3", borderColor: C + "44" }}
            >
              <AlertCircle
                size={18}
                style={{ color: C }}
                className="mt-0.5 shrink-0"
              />
              <span className="text-sm font-medium" style={{ color: C }}>
                {error}
              </span>
            </div>
          )}
          {preview && (
            <div
              className="p-5 rounded-2xl border-2 space-y-2"
              style={{ background: "#f0fff9", borderColor: "#52ffe288" }}
            >
              <div className="flex items-center gap-2">
                <CheckCircle2 size={18} style={{ color: T }} />
                <span className="text-sm font-bold" style={{ color: T }}>
                  JSON صالح ✓
                </span>
              </div>
              <p className="text-sm" style={{ color: T }}>
                المحاضرة:{" "}
                <strong>
                  {preview.meta?.lecture_title ||
                    preview.lecture_title ||
                    preview.title ||
                    "—"}
                </strong>
              </p>
              <p className="text-sm" style={{ color: T }}>
                عدد الأقسام: <strong>{(Array.isArray(preview.sections) ? preview.sections : []).length}</strong>
              </p>
            </div>
          )}
        </div>

        <div className="flex gap-3 px-7 py-5 border-t-2 border-gray-100">
          <button
            onClick={handleParse}
            className="flex-1 font-bold py-3 rounded-xl transition-colors text-sm"
            style={{ background: V + "22", color: V }}
            onMouseEnter={(e) => (e.currentTarget.style.background = V + "33")}
            onMouseLeave={(e) => (e.currentTarget.style.background = V + "22")}
          >
            معاينة
          </button>
          <button
            onClick={() => preview && onApply(preview)}
            disabled={!preview}
            className="flex-1 text-white font-bold py-3 rounded-xl transition-all text-sm disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: V }}
          >
            {replaces ? "استبدال الملخّص" : "إضافة المحاضرة"}
          </button>
        </div>
      </div>
    </div>
  );
});

// ─── SectionCard — single section editor with its own JSON state ──────────────
const SectionCard = memo(
  ({ section, sectionIndex, totalSections, onChange, onDelete }) => {
    const [sectionJson, setSectionJson] = useState(() =>
      JSON.stringify(section, null, 2),
    );
    const [sectionError, setSectionError] = useState(false);
    const [open, setOpen] = useState(false);

    // sync from parent only on first render (prop identity change = lecture-level save)
    const mountedRef = useRef(false);
    useEffect(() => {
      if (!mountedRef.current) {
        mountedRef.current = true;
        return;
      }
      setSectionJson(JSON.stringify(section, null, 2));
      setSectionError(false);
    }, [section]);

    const title =
      section?.title ||
      section?.section_title ||
      section?.name ||
      `قسم ${sectionIndex + 1}`;
    const blockCount = section?.content_blocks?.length ?? 0;

    const handleChange = (val) => {
      setSectionJson(val);
      try {
        const parsed = JSON.parse(val.trim());
        if (typeof parsed === "object" && parsed !== null) {
          setSectionError(false);
          onChange(parsed);
        } else setSectionError(true);
      } catch {
        setSectionError(true);
      }
    };

    return (
      <div
        className="rounded-2xl overflow-hidden transition-all"
        style={{ border: `2px solid ${sectionError ? C + "66" : "#e0d9ff"}` }}
      >
        {/* Section header — div لا button: بداخله زرّ الحذف، والزرّ لا يُحتضن في زرّ */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => setOpen((v) => !v)}
          className="w-full flex items-center gap-3 px-4 py-3 text-right transition-colors cursor-pointer"
          style={{
            background: sectionError
              ? `linear-gradient(120deg, ${C}12 0%, ${C}04 100%)`
              : `linear-gradient(120deg, #f3eeff 0%, #faf8ff 100%)`,
            borderBottom: open
              ? `1.5px solid ${sectionError ? C + "22" : "#e0d9ff"}`
              : "none",
          }}
        >
          {/* Section number badge */}
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-xs font-black text-white"
            style={{
              background: sectionError
                ? C
                : `linear-gradient(135deg, ${V}cc 0%, ${V} 100%)`,
            }}
          >
            {sectionIndex + 1}
          </div>

          {/* Title */}
          <span className="flex-1 text-sm font-bold text-gray-800 text-right truncate">
            {title}
          </span>

          {/* Meta */}
          <div className="flex items-center gap-2 shrink-0">
            {blockCount > 0 && (
              <span
                className="text-xs px-2 py-0.5 rounded-full font-bold"
                style={{ background: T + "15", color: T }}
              >
                {blockCount} blocks
              </span>
            )}
            {sectionError && <AlertTriangle size={14} style={{ color: C }} />}
            {onDelete && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                title="حذف هذا القسم"
                className="p-1.5 rounded-lg hover:bg-red-50"
              >
                <Trash2 size={14} color={C} />
              </button>
            )}
            {open ? (
              <ChevronDown size={15} color={sectionError ? C : V} />
            ) : (
              <ChevronRight size={15} color={sectionError ? C : V} />
            )}
          </div>
        </div>

        {/* JSON editor for this section */}
        {open && (
          <div className="p-3" style={{ background: "#fdfcff" }}>
            <div
              className="flex items-center justify-between px-3 py-1.5 rounded-t-xl mb-0"
              style={{
                background: sectionError ? C + "0d" : V + "08",
                border: `1.5px solid ${sectionError ? C + "33" : V + "18"}`,
                borderBottom: "none",
                borderRadius: "10px 10px 0 0",
              }}
            >
              <span
                className="text-xs font-bold"
                style={{ color: sectionError ? C : V }}
              >
                {sectionError
                  ? "⚠️ JSON غير صالح"
                  : `JSON القسم ${sectionIndex + 1}`}
              </span>
              <span className="text-xs text-gray-400">
                {sectionJson.length} حرف
              </span>
            </div>
            <textarea
              value={sectionJson}
              onChange={(e) => handleChange(e.target.value)}
              className="w-full text-lg p-3 focus:outline-none resize-none"
              style={{
                background: "white",
                color: sectionError ? C : "#222",
                direction: "rtl",
                textAlign: "right",
                minHeight: "400px",
                lineHeight: 1.6,
                border: `1.5px solid ${sectionError ? C + "44" : V + "18"}`,
                borderTop: "none",
                borderRadius: "0 0 10px 10px",
              }}
              spellCheck={false}
            />
          </div>
        )}
      </div>
    );
  },
);

// ─── LectureCard ──────────────────────────────────────────────────────────────
const LectureCard = memo(({ lecture, index, onChange, onDelete }) => {
  const [open, setOpen] = useState(false);
  const [hasError, setHasError] = useState(false);

  const currentTitle =
    lecture.meta?.lecture_title ||
    lecture.lecture_title ||
    lecture.title ||
    "—";
  const sections = Array.isArray(lecture.sections) ? lecture.sections : [];
  const sectionCount = sections.length;
  const blockCount = sections.reduce(
    (acc, s) => acc + (s.content_blocks?.length || 0),
    0,
  );

  // Update a single section inside the lecture
  const handleSectionChange = useCallback(
    (sIdx, updatedSection) => {
      const newSections = [...sections];
      newSections[sIdx] = updatedSection;
      const updatedLecture = { ...lecture, sections: newSections };
      // Validate whole lecture still parses
      try {
        JSON.stringify(updatedLecture); // will always succeed (it's already an object)
        setHasError(false);
        onChange(updatedLecture);
      } catch {
        setHasError(true);
      }
    },
    [lecture, sections, onChange],
  );

  // حذف قسمٍ واحد. التطبيق (EXAMS/frontend) يعرّف القسم بـ`id`: عليه تُحفظ
  // ملاحظات الطلاب وتُربط الشكاوى، فمعرّفات الباقي **لا تُمسّ**. أما `number`
  // فيُعرض للطالب رقماً للقسم، فيُعاد تسلسله 1..n كي لا تظهر فجوة.
  const handleSectionDelete = useCallback(
    (sIdx) => {
      const sec = sections[sIdx];
      const name = sec?.title || sec?.section_title || sec?.name || `قسم ${sIdx + 1}`;
      const notes = (sec?.notes || []).filter((n) => String(n?.note || "").trim()).length;
      if (
        !window.confirm(
          `حذف القسم ${sIdx + 1}: «${name}»؟` +
            (notes ? `\nستُحذف معه ${notes} ملاحظة طلاب مكتوبة عليه.` : ""),
        )
      ) {
        return;
      }
      const newSections = sections
        .filter((_, j) => j !== sIdx)
        .map((s, j) => ({ ...s, number: j + 1 }));
      onChange({ ...lecture, sections: newSections });
    },
    [lecture, sections, onChange],
  );

  return (
    <div
      className="group rounded-3xl overflow-hidden shadow-sm transition-all"
      style={{ border: `2.5px solid ${hasError ? C + "66" : V + "33"}` }}
    >
      {/* ── Lecture header ── */}
      <div
        className="flex items-center gap-4 px-6 py-5 cursor-pointer"
        style={{
          background: `linear-gradient(120deg, ${hasError ? C + "18" : V + "18"} 0%, ${hasError ? C + "05" : V + "05"} 100%)`,
          borderBottom: open
            ? `2px solid ${hasError ? C + "22" : V + "22"}`
            : "none",
        }}
        onClick={() => setOpen((v) => !v)}
      >
        {/* Index bubble */}
        <div
          className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 font-black text-white text-lg"
          style={{
            background: hasError
              ? `linear-gradient(135deg, ${C} 0%, #ff8a8a 100%)`
              : `linear-gradient(135deg, ${V} 0%, ${C} 100%)`,
            boxShadow: `0 4px 14px ${hasError ? C : V}44`,
          }}
        >
          {index + 1}
        </div>

        {/* Title */}
        <div className="flex-1 min-w-0">
          <p className="font-black text-xl text-gray-900 leading-relaxed truncate">
            {currentTitle}
          </p>
          {hasError && (
            <p className="text-xs font-bold mt-0.5" style={{ color: C }}>
              ⚠️ يوجد قسم فيه خطأ
            </p>
          )}
        </div>

        {/* Stats + controls */}
        <div className="flex items-center gap-3 shrink-0">
          <Pill color="v">{sectionCount} أقسام</Pill>
          <Pill color="t">{blockCount} blocks</Pill>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="opacity-0 group-hover:opacity-100 transition-all p-2 rounded-xl"
            onMouseEnter={(e) => {
              e.currentTarget.style.background = C;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
            }}
          >
            <Trash2 size={17} color={C} />
          </button>
          {open ? (
            <ChevronDown size={20} color={hasError ? C : V} />
          ) : (
            <ChevronRight size={20} color={hasError ? C : V} />
          )}
        </div>
      </div>

      {/* ── Sections list ── */}
      {open && (
        <div className="p-4 space-y-2" style={{ background: "#fdfcff" }}>
          {sectionCount === 0 ? (
            <div
              className="text-center py-6 rounded-2xl"
              style={{ background: V + "08", border: `1.5px dashed ${V}33` }}
            >
              <Layers size={20} color={V} className="mx-auto mb-2 opacity-40" />
              <p className="text-xs text-gray-400 font-semibold">
                لا يوجد أقسام في هذه المحاضرة
              </p>
            </div>
          ) : (
            <>
              {/* Sections navigation pills */}
              <div
                className="flex flex-wrap gap-1.5 pb-2 mb-1"
                style={{ borderBottom: `1.5px dashed ${V}22` }}
              >
                {sections.map((sec, sIdx) => {
                  const secTitle =
                    sec?.title ||
                    sec?.section_title ||
                    sec?.name ||
                    `${sIdx + 1}`;
                  return (
                    <span
                      key={sIdx}
                      className="text-xs font-bold px-2.5 py-1 rounded-lg cursor-default"
                      style={{
                        background: V + "12",
                        color: V,
                        border: `1px solid ${V}25`,
                      }}
                    >
                      {sIdx + 1}.{" "}
                      {secTitle.length > 18
                        ? secTitle.slice(0, 18) + "…"
                        : secTitle}
                    </span>
                  );
                })}
              </div>

              {/* Section cards */}
              <div className="space-y-2">
                {sections.map((sec, sIdx) => (
                  <SectionCard
                    // المفتاح يجمع الموضع والمعرّف: بعد الحذف تُعاد تهيئة ما
                    // بعده من بطاقات فلا يرث قسمٌ حالةَ (فتح/نصّ JSON) الذي حُذف
                    key={`${sIdx}:${sec?.id ?? ""}`}
                    section={sec}
                    sectionIndex={sIdx}
                    totalSections={sectionCount}
                    onChange={(updated) => handleSectionChange(sIdx, updated)}
                    onDelete={() => handleSectionDelete(sIdx)}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
});

// ─── SummaryEditor (Main Export) ──────────────────────────────────────────────
// `singleLecture`: المحرّر مفتوحٌ على نطاق محاضرةٍ واحدة (تبويب الملخّص في
// تعديل المادة، وورشة المحاضرة). المستدعي هناك يقرأ العنصر الأول وحده، فلو
// أضفنا محاضرةً ثانيةً لسقطت صامتةً ولبدا الزرّ معطَّلاً. في هذا النطاق يحلّ
// الملصوق محلّ المحاضرة بدل أن يُلحَق بها.
const SummaryEditor = memo(({ formData, handleChange, singleLecture = false }) => {
  const summary = Array.isArray(formData.summary) ? formData.summary : [];
  const [showJsonModal, setShowJsonModal] = useState(false);

  const updateSummary = useCallback(
    (newSummary) => handleChange("summary", newSummary),
    [handleChange],
  );

  const updateLecture = (i, val) => {
    const updated = [...summary];
    updated[i] = val;
    updateSummary(updated);
  };

  const removeLecture = (i) => {
    const updated = [...summary];
    updated.splice(i, 1);
    updateSummary(updated);
  };

  const handleJsonApply = (lecture) => {
    if (singleLecture) {
      // نحفظ ربط المحاضرة (lecture_id وغيره) إن لم يذكره الملصوق، فالنطاق
      // محاضرةٌ بعينها ولا يصحّ أن يفقد هويّتها بلصق ملخّصها.
      const prevMeta = summary[0]?.meta;
      updateSummary([
        prevMeta ? { ...lecture, meta: { ...prevMeta, ...lecture.meta } } : lecture,
      ]);
    } else {
      updateSummary([...summary, lecture]);
    }
    setShowJsonModal(false);
  };

  const totalSections = summary.reduce(
    (acc, s) => acc + (s.sections?.length || 0),
    0,
  );
  const totalBlocks = summary.reduce(
    (acc, s) =>
      acc +
      (Array.isArray(s.sections) ? s.sections : []).reduce(
        (a, sec) => a + (sec.content_blocks?.length || 0),
        0,
      ),
    0,
  );

  return (
    <div className="space-y-6 px-4 pb-10" dir="rtl">
      {/* ── Stats bar ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-lg font-black text-gray-700">الملخص</span>
          <Pill color="v">{summary.length} محاضرات</Pill>
          <Pill color="t">{totalSections} أقسام</Pill>
          <Pill color="gray">{totalBlocks} blocks</Pill>
        </div>
        <button
          onClick={() => setShowJsonModal(true)}
          className="flex items-center gap-2 text-sm font-bold px-5 py-2.5 rounded-xl transition-all"
          style={{ color: V, background: V + "15", border: `2px solid ${V}33` }}
          onMouseEnter={(e) => (e.currentTarget.style.background = V + "25")}
          onMouseLeave={(e) => (e.currentTarget.style.background = V + "15")}
        >
          <ClipboardPaste size={17} />
          لصق JSON
        </button>
      </div>

      {/* ── Empty state ── */}
      {summary.length === 0 && (
        <div
          className="text-center py-20 rounded-3xl"
          style={{ background: "#f7f3ff", border: `2px dashed ${V}33` }}
        >
          <p className="text-2xl mb-2">📚</p>
          <p className="text-base font-semibold text-gray-400">
            لا يوجد ملخص بعد
          </p>
          <p className="text-sm text-gray-300 mt-1">اضغط "لصق JSON" للبدء</p>
        </div>
      )}

      {/* ── Lectures list ── */}
      <div className="space-y-4">
        {summary.map((lecture, i) => (
          <LectureCard
            key={i}
            index={i}
            lecture={lecture}
            onChange={(val) => updateLecture(i, val)}
            onDelete={() => removeLecture(i)}
          />
        ))}
      </div>

      {/* ── Add button ── */}
      <div className="flex gap-3">
        <button
          onClick={() => setShowJsonModal(true)}
          className="flex-1 py-4 rounded-2xl text-base font-bold flex items-center justify-center gap-2 transition-all"
          style={{
            border: `2.5px dashed ${V}55`,
            color: V,
            background: V + "08",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = V + "18")}
          onMouseLeave={(e) => (e.currentTarget.style.background = V + "08")}
        >
          <ClipboardPaste size={18} />
          {singleLecture ? "لصق JSON لهذا الملخّص" : "لصق JSON محاضرة جديدة"}
        </button>
      </div>

      {/* ── JSON Paste Modal ── */}
      {showJsonModal && (
        <JsonPasteModal
          onClose={() => setShowJsonModal(false)}
          onApply={handleJsonApply}
          replaces={singleLecture}
        />
      )}
    </div>
  );
});

export default SummaryEditor;
