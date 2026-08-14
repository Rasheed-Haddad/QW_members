import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlignLeft,
  FileText,
  HelpCircle,
  Sparkles,
  PenLine,
  Save,
  Loader2,
  Check,
  Info,
  Plus,
  Trash2,
  Search,
  X,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { getLecture, saveLecture, PARTS } from "./v2api";
import SummaryPane from "./SummaryPane";
import {
  OcrAction,
  SpellAction,
  GenerateAction,
  TranscribeAction,
} from "../production/components/AiActions";
import PasteQuestions from "../production/components/PasteQuestions";
import CurriculumWorkspace from "../production/components/CurriculumWorkspace";

// ─── تبويبات محتوى المحاضرة — الهيكل الموحَّد ─────────────────────────────────
// كل شيء يأتي من كائن المحاضرة الواحد ويُحفظ إليه بـlecture_id.
// لا كولكشن نصوص، ولا مطابقة أسماء، ولا حارس تزامن على فهارس مصفوفة عامة.
//
// «ما لم يُلمَس لا يُرسَل»: نتتبّع الأجزاء المتّسخة، والحفظ يحملها وحدها.

const ICONS = {
  curriculum: AlignLeft,
  summary: FileText,
  questions: HelpCircle,
  flash: Sparkles,
  written: PenLine,
};

const normAr = (s) =>
  String(s == null ? "" : s)
    .replace(/[ً-ْٰـ]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const Empty = ({ icon: Icon, color, text, action, onAction }) => (
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

const QCard = ({ q, n, onChange, onRemove, onMove, isFirst, isLast }) => (
  <div className="p-4 rounded-xl border border-gray-200 bg-white">
    <div className="flex items-center gap-2 mb-3">
      <span className="text-base font-black text-[#f59e0b]">#{n}</span>
      <div className="mr-auto flex items-center gap-1">
        <button onClick={() => onMove(-1)} disabled={isFirst} title="لأعلى"
          className="p-1.5 rounded-md text-gray-400 hover:bg-gray-100 disabled:opacity-30">
          <ArrowUp size={15} />
        </button>
        <button onClick={() => onMove(1)} disabled={isLast} title="لأسفل"
          className="p-1.5 rounded-md text-gray-400 hover:bg-gray-100 disabled:opacity-30">
          <ArrowDown size={15} />
        </button>
        <button onClick={onRemove} title="حذف"
          className="p-1.5 rounded-md text-red-500 hover:bg-red-50">
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
      className="w-full p-2.5 mb-3 rounded-lg border border-gray-300 bg-gray-50 text-[15px] font-arabic outline-none focus:border-amber-400"
    />
    <div className="space-y-2">
      {[0, 1, 2, 3].map((i) => {
        const ok = String(q.answer) === String(i + 1);
        return (
          <div key={i} className="flex items-center gap-2">
            <button
              onClick={() => onChange({ ...q, answer: String(i + 1) })}
              title="اجعله الصحيح"
              className={`w-8 h-8 shrink-0 rounded-lg text-xs font-bold flex items-center justify-center ${
                ok ? "bg-green-500 text-white" : "bg-gray-200 text-gray-600 hover:bg-gray-300"
              }`}
            >
              {ok ? <Check size={15} /> : i + 1}
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
              className={`flex-1 p-2 rounded-lg border text-[15px] font-arabic outline-none ${
                ok ? "border-green-300 bg-green-50/50" : "border-gray-300 bg-gray-50 focus:border-amber-400"
              }`}
            />
          </div>
        );
      })}
    </div>
  </div>
);

export default function LectureTabs({
  subjectId,
  subjectName,
  lectureId,
  onSaved,
  // تبويبٌ مطلوب صراحةً من الرابط. null = اختر تلقائياً أول جزءٍ فيه محتوى.
  initialTab = null,
}) {
  const [tab, setTab] = useState(initialTab || "curriculum");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(null);
  const [error, setError] = useState(null);
  const [lecture, setLecture] = useState(null);
  // بايتات الملفّ الأصلي إن مُسح في هذه الجلسة — مرجع المقارنة البصرية.
  // لا تُحفَظ في الخادم: ملفّ المقرَّر بمئات الميغابايتات، والمقارنة تُجرى
  // ساعةَ التحرير لا بعد شهر.
  const [pdfBytes, setPdfBytes] = useState(null);
  const [draft, setDraft] = useState(null);
  const [dirty, setDirty] = useState(() => new Set());
  const [search, setSearch] = useState("");
  const askedRef = useRef(null);

  const markDirty = useCallback((k) => {
    setDirty((prev) => {
      if (prev.has(k)) return prev;
      const next = new Set(prev);
      next.add(k);
      return next;
    });
    setSaved(null);
  }, []);

  useEffect(() => {
    const key = `${subjectId}|${lectureId}`;
    if (askedRef.current === key) return;
    askedRef.current = key;
    setLoading(true);
    setError(null);
    setDirty(new Set());
    getLecture(subjectId, lectureId)
      .then((r) => {
        const l = r.lecture || {};
        setLecture(l);
        setDraft({
          curriculum: String(l.curriculum?.text || ""),
          summary: l.summary?.sections || [],
          questions: l.questions || [],
          flash_cards: l.flash_cards || [],
          written_exam: l.written_exam || { duration_min: 30, questions: [] },
        });
        // تبويبٌ طلبه المستخدم صراحةً يُحترَم؛ وإلا نفتح على أول جزء فيه
        // شيء — الهبوط على فارغٍ يوحي بأن الكل فارغ.
        if (initialTab) {
          setTab(initialTab);
          return;
        }
        const filled =
          (String(l.curriculum?.text || "").trim() && "curriculum") ||
          ((l.summary?.sections || []).length && "summary") ||
          ((l.questions || []).length && "questions") ||
          ((l.flash_cards || []).length && "flash") ||
          ((l.written_exam?.questions || []).length && "written") ||
          "curriculum";
        setTab(filled);
      })
      .catch((e) =>
        setError(e?.response?.data?.message || "تعذّر جلب المحاضرة"),
      )
      .finally(() => setLoading(false));
  }, [subjectId, lectureId, initialTab]);

  // تحذير المغادرة بتغييرات غير محفوظة
  useEffect(() => {
    if (dirty.size === 0) return undefined;
    const h = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const visibleQ = useMemo(() => {
    if (!draft) return [];
    const all = draft.questions.map((q, i) => ({ q, i }));
    const terms = normAr(search).split(" ").filter(Boolean);
    if (!terms.length) return all;
    return all.filter(({ q }) => {
      const hay = normAr(`${q.question || ""} ${(q.options || []).join(" ")}`);
      return terms.every((t) => hay.includes(t));
    });
  }, [draft, search]);

  const save = async () => {
    if (!draft || dirty.size === 0 || saving) return;
    setSaving(true);
    setError(null);
    try {
      const payload = {};
      if (dirty.has("curriculum")) payload.curriculum = { text: draft.curriculum };
      if (dirty.has("summary")) payload.summary = { sections: draft.summary };
      if (dirty.has("questions")) payload.questions = draft.questions;
      if (dirty.has("flash")) payload.flash_cards = draft.flash_cards;
      if (dirty.has("written")) payload.written_exam = draft.written_exam;
      const n = dirty.size;
      await saveLecture(subjectId, lectureId, payload);
      setDirty(new Set());
      setSaved(`حُفظ ${n === 1 ? "الجزء" : `${n} أجزاء`}`);
      setTimeout(() => setSaved(null), 4000);
      onSaved?.();
    } catch (e) {
      setError(e?.response?.data?.message || e.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="py-20 text-center">
        <Loader2 size={26} className="animate-spin mx-auto text-brand" />
        <p className="text-sm text-gray-500 mt-3">جارٍ جلب المحاضرة…</p>
      </div>
    );
  }
  if (error && !draft) {
    return (
      <div className="m-4 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
        {error}
      </div>
    );
  }
  if (!draft) return null;

  const counts = {
    curriculum: draft.curriculum.trim()
      ? `${draft.curriculum.trim().split(/\s+/).length.toLocaleString("ar-EG")} كلمة`
      : "—",
    summary: draft.summary.length ? `${draft.summary.length} قسم` : "—",
    questions: draft.questions.length || "—",
    flash: draft.flash_cards.length || "—",
    written: draft.written_exam?.questions?.length || "—",
  };

  return (
    <div dir="rtl">
      {/* الترويسة */}
      <div className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-gray-200">
        <div className="px-4 py-3 flex items-center gap-3 flex-wrap">
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold text-gray-900 truncate">
              {lecture?.name || "محاضرة"}
            </h2>
            <p className="text-xs text-gray-400">{subjectName}</p>
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
            onClick={save}
            disabled={dirty.size === 0 || saving}
            className="px-4 py-2.5 rounded-xl bg-brand text-white text-sm font-bold flex items-center gap-1.5 disabled:opacity-40"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            حفظ
          </button>
        </div>

        <div className="px-3 pb-2 flex items-center gap-1.5 overflow-x-auto">
          {PARTS.map((p) => {
            const Icon = ICONS[p.key];
            const active = tab === p.key;
            return (
              <button
                key={p.key}
                onClick={() => setTab(p.key)}
                className={`px-3 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 shrink-0 border ${
                  active ? "border-transparent text-white" : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                }`}
                style={active ? { backgroundColor: p.color } : undefined}
              >
                <Icon size={15} />
                {p.label}
                <span className={`text-[11px] font-normal ${active ? "text-white/75" : "text-gray-400"}`}>
                  {counts[p.key]}
                </span>
                {dirty.has(p.key) && (
                  <span className={`w-1.5 h-1.5 rounded-full ${active ? "bg-white" : "bg-amber-500"}`} />
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mx-4 mt-3 px-3.5 py-2.5 rounded-xl bg-brand/5 border border-brand/20 text-xs text-gray-700 flex items-start gap-2">
        <Info size={14} className="mt-0.5 shrink-0 text-brand" />
        <span>
          {dirty.size === 0
            ? "لم تغيّر شيئاً — لن يُرسَل شيء."
            : `الحفظ سيكتب: ${[...dirty].map((k) => PARTS.find((p) => p.key === k)?.label || k).join("، ")}.`}{" "}
          بقيّة المحاضرات لا تُمَسّ.
        </span>
      </div>

      {error && (
        <div className="mx-4 mt-3 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="p-4 pb-24">
        {/* ① نص المقرر */}
        {tab === "curriculum" && (
          <div className="space-y-3">
            <CurriculumWorkspace
              toolbar={
                <>
                  <OcrAction
                    lectureName={lecture?.name}
                    subjectName={subjectName}
                    onFile={setPdfBytes}
                    onText={(md) => {
                      setDraft((d) => ({ ...d, curriculum: md }));
                      markDirty("curriculum");
                    }}
                  />
                  <TranscribeAction
                    onText={(md) => {
                      setDraft((d) => ({ ...d, curriculum: md }));
                      markDirty("curriculum");
                    }}
                  />
                  <SpellAction
                    text={draft.curriculum}
                    onText={(t) => {
                      setDraft((d) => ({ ...d, curriculum: t }));
                      markDirty("curriculum");
                    }}
                  />
                </>
              }
              text={draft.curriculum}
              onChange={(t) => {
                setDraft((d) => ({ ...d, curriculum: t }));
                markDirty("curriculum");
              }}
              pdfBytes={pdfBytes}
            />
          </div>
        )}

        {/* ② الملخص */}
        {tab === "summary" && (
          <SummaryPane
            sections={draft.summary}
            onChange={(sections) => {
              setDraft((d) => ({ ...d, summary: sections }));
              markDirty("summary");
            }}
          />
        )}

        {/* ③ الأسئلة */}
        {tab === "questions" && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <PasteQuestions
                onAdd={(items) => {
                  setSearch("");
                  setDraft((d) => ({
                    ...d,
                    questions: [
                      ...d.questions,
                      ...items.map((q) => ({ ...q, answer: String(q.answer) })),
                    ],
                  }));
                  markDirty("questions");
                }}
              />
            </div>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  dir="rtl"
                  placeholder="ابحث في نص السؤال أو الخيارات…"
                  className="w-full pr-9 pl-8 py-2.5 rounded-xl border border-gray-300 bg-white text-sm font-arabic outline-none focus:border-amber-400"
                />
                {search && (
                  <button onClick={() => setSearch("")}
                    className="absolute left-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-gray-400 hover:bg-gray-100">
                    <X size={14} />
                  </button>
                )}
              </div>
              <button
                onClick={() => {
                  setSearch("");
                  setDraft((d) => ({
                    ...d,
                    questions: [...d.questions, { question: "", options: ["", "", "", ""], answer: "1" }],
                  }));
                  markDirty("questions");
                }}
                className="px-3.5 py-2.5 rounded-xl bg-amber-500 text-white text-sm font-semibold flex items-center gap-1.5 shrink-0"
              >
                <Plus size={16} /> سؤال
              </button>
            </div>
            {search.trim() && (
              <p className="text-xs text-gray-500 px-1">
                {visibleQ.length} من {draft.questions.length} · الترقيم أصلي
              </p>
            )}
            {draft.questions.length === 0 ? (
              <Empty icon={HelpCircle} color="#f59e0b" text="لا أسئلة لهذه المحاضرة" />
            ) : (
              visibleQ.map(({ q, i }) => (
                <QCard
                  key={i}
                  q={q}
                  n={i + 1}
                  isFirst={i === 0}
                  isLast={i === draft.questions.length - 1}
                  onChange={(v) => {
                    const next = [...draft.questions];
                    next[i] = v;
                    setDraft((d) => ({ ...d, questions: next }));
                    markDirty("questions");
                  }}
                  onRemove={() => {
                    setDraft((d) => ({ ...d, questions: d.questions.filter((_, j) => j !== i) }));
                    markDirty("questions");
                  }}
                  onMove={(dir) => {
                    const j = i + dir;
                    if (j < 0 || j >= draft.questions.length) return;
                    const next = [...draft.questions];
                    [next[i], next[j]] = [next[j], next[i]];
                    setDraft((d) => ({ ...d, questions: next }));
                    markDirty("questions");
                  }}
                />
              ))
            )}
          </div>
        )}

        {/* ④ البطاقات */}
        {tab === "flash" && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <GenerateAction
                kind="flash"
                text={draft.curriculum}
                onItems={(items) => {
                  setDraft((d) => ({
                    ...d,
                    flash_cards: [
                      ...d.flash_cards,
                      ...items.map((c, i) => ({
                        card_id: `${lectureId}_ai${d.flash_cards.length + i + 1}`,
                        front: c.front,
                        back: c.back,
                      })),
                    ],
                  }));
                  markDirty("flash");
                }}
              />
              <button
                onClick={() => {
                  setDraft((d) => ({
                    ...d,
                    flash_cards: [...d.flash_cards, { card_id: `${lectureId}_c${d.flash_cards.length + 1}`, front: "", back: "" }],
                  }));
                  markDirty("flash");
                }}
                className="text-xs font-semibold rounded-lg px-3 py-2 flex items-center gap-1.5 border border-emerald-200 bg-emerald-50 text-emerald-700"
              >
                <Plus size={13} /> بطاقة
              </button>
            </div>
            {!draft.curriculum.trim() && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                التوليد يحتاج نصّ المقرَّر — امسحه أو فرّغه من تبويب «نص المقرر».
              </p>
            )}
            {draft.flash_cards.length === 0 ? (
              <Empty icon={Sparkles} color="#10b981" text="لا بطاقات لهذه المحاضرة" />
            ) : (
              draft.flash_cards.map((c, i) => (
                <div key={i} className="p-4 rounded-xl border border-gray-200 bg-white">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-sm font-black text-emerald-600">#{i + 1}</span>
                    <button
                      onClick={() => {
                        setDraft((d) => ({ ...d, flash_cards: d.flash_cards.filter((_, j) => j !== i) }));
                        markDirty("flash");
                      }}
                      className="mr-auto p-1.5 rounded-md text-red-500 hover:bg-red-50"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {["front", "back"].map((f) => (
                      <label key={f} className="block">
                        <span className="block text-xs text-gray-500 mb-1">
                          {f === "front" ? "الوجه — السؤال" : "الظهر — جواب قصير"}
                        </span>
                        <textarea
                          value={c[f] || ""}
                          onChange={(e) => {
                            const next = [...draft.flash_cards];
                            next[i] = { ...c, [f]: e.target.value };
                            setDraft((d) => ({ ...d, flash_cards: next }));
                            markDirty("flash");
                          }}
                          rows={3}
                          dir="rtl"
                          className="w-full p-2.5 rounded-lg border border-gray-200 bg-gray-50 text-[15px] font-arabic outline-none focus:border-emerald-400"
                        />
                      </label>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* ⑤ التحريري */}
        {tab === "written" && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <GenerateAction
                kind="written"
                text={draft.curriculum}
                onItems={(items) => {
                  setDraft((d) => ({
                    ...d,
                    written_exam: {
                      ...d.written_exam,
                      questions: [
                        ...(d.written_exam.questions || []),
                        ...items.map((q, i) => ({
                          q_id: `${lectureId}_aiw${(d.written_exam.questions || []).length + i + 1}`,
                          question: q.question,
                          model_answer: q.model_answer,
                        })),
                      ],
                    },
                  }));
                  markDirty("written");
                }}
              />
              <label className="flex items-center gap-2 text-xs text-gray-600">
                المدة
                <input
                  type="number"
                  min={1}
                  value={draft.written_exam?.duration_min ?? 30}
                  onChange={(e) => {
                    setDraft((d) => ({
                      ...d,
                      written_exam: { ...d.written_exam, duration_min: Number(e.target.value) },
                    }));
                    markDirty("written");
                  }}
                  className="w-20 px-2 py-1.5 rounded-lg border border-gray-200 text-sm"
                />
                دقيقة
              </label>
            </div>
            {!draft.curriculum.trim() && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                التوليد يحتاج نصّ المقرَّر.
              </p>
            )}
            {(draft.written_exam?.questions || []).length === 0 ? (
              <Empty icon={PenLine} color="#ef4444" text="لا أسئلة تحريرية" />
            ) : (
              draft.written_exam.questions.map((q, i) => (
                <div key={i} className="p-4 rounded-xl border border-gray-200 bg-white">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-sm font-black text-red-600">#{i + 1}</span>
                    <button
                      onClick={() => {
                        setDraft((d) => ({
                          ...d,
                          written_exam: {
                            ...d.written_exam,
                            questions: d.written_exam.questions.filter((_, j) => j !== i),
                          },
                        }));
                        markDirty("written");
                      }}
                      className="mr-auto p-1.5 rounded-md text-red-500 hover:bg-red-50"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                  {[
                    ["question", "السؤال", 2],
                    ["model_answer", "الجواب النموذجي — لوكيل التصحيح وحده", 4],
                  ].map(([f, label, rows]) => (
                    <label key={f} className="block mb-2 last:mb-0">
                      <span className="block text-xs text-gray-500 mb-1">{label}</span>
                      <textarea
                        value={q[f] || ""}
                        onChange={(e) => {
                          const next = [...draft.written_exam.questions];
                          next[i] = { ...q, [f]: e.target.value };
                          setDraft((d) => ({ ...d, written_exam: { ...d.written_exam, questions: next } }));
                          markDirty("written");
                        }}
                        rows={rows}
                        dir="rtl"
                        className={`w-full p-2.5 rounded-lg border text-[15px] font-arabic outline-none ${
                          f === "model_answer"
                            ? "border-amber-200 bg-amber-50/40 focus:border-amber-400"
                            : "border-gray-200 bg-gray-50 focus:border-red-400"
                        }`}
                      />
                    </label>
                  ))}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
