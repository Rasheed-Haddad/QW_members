import { useMemo, useState, memo } from "react";
import {
  Link2,
  Link2Off,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  X,
} from "lucide-react";

// ─── Design Tokens (same as SummaryEditor) ───────────────────────────────────
const V = "#8c52ff";
const C = "#ff526f";
const T = "#009980";
const W = "#f59e0b"; // warning amber

// ─── helper: extract lecture title from a summary JSON object ────────────────
const getSummaryTitle = (obj) =>
  obj?.meta?.lecture_title || obj?.lecture_title || obj?.title || null;

// ─── LinkModal ────────────────────────────────────────────────────────────────
// Shown when the user clicks "اربط" on an unmatched lecture.
// Lets them pick which side is the "correct" name, then syncs the other side.
const LinkModal = memo(
  ({ item, allSummaryTitles, allQuestionLectures, onApply, onClose }) => {
    // item.side = "summary" | "questions" | "both_mismatch" (future)
    // For unmatched: we show the name on the known side + a dropdown to pick from the other side
    const [selectedTarget, setSelectedTarget] = useState("");
    const [authoritative, setAuthoritative] = useState(item.side); // which side's name wins

    const summaryName = item.summaryTitle;
    const questionsName = item.questionsLecture;

    // Options for "match with" dropdown — the opposite side's names
    const oppositeOptions = useMemo(() => {
      if (item.side === "summary") return allQuestionLectures;
      if (item.side === "questions") return allSummaryTitles;
      return [];
    }, [item, allSummaryTitles, allQuestionLectures]);

    const handleApply = () => {
      if (item.side === "summary") {
        // Summary has the name, questions side is selectedTarget (old name)
        // authoritative decides which name survives
        const finalName =
          authoritative === "summary" ? summaryName : selectedTarget;
        onApply({
          finalName,
          summaryTitle: summaryName,
          questionsLecture: selectedTarget,
        });
      } else if (item.side === "questions") {
        const finalName =
          authoritative === "questions" ? questionsName : selectedTarget;
        onApply({
          finalName,
          summaryTitle: selectedTarget,
          questionsLecture: questionsName,
        });
      }
    };

    return (
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-5">
        <div
          dir="rtl"
          className="bg-white rounded-3xl shadow-2xl w-full max-w-lg flex flex-col overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-5 border-b-2 border-gray-100">
            <div>
              <h3 className="text-lg font-black text-gray-900 flex items-center gap-2">
                <Link2 size={18} style={{ color: V }} />
                ربط المحاضرة
              </h3>
              <p className="text-xs text-gray-400 mt-0.5">
                اختر الاسم الصحيح الذي سيُطبَّق على الطرفين
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-xl"
            >
              <X size={20} color="#666" />
            </button>
          </div>

          <div className="p-6 space-y-5">
            {/* Current name on known side */}
            <div
              className="rounded-2xl p-4 space-y-1"
              style={{ background: V + "0d", border: `1.5px solid ${V}33` }}
            >
              <p className="text-xs font-bold" style={{ color: V }}>
                {item.side === "summary"
                  ? "📝 الاسم في الملخص"
                  : "❓ الاسم في الأسئلة"}
              </p>
              <p className="text-base font-black text-gray-900">
                {item.side === "summary" ? summaryName : questionsName}
              </p>
            </div>

            {/* Dropdown: pick from opposite side */}
            <div className="space-y-2">
              <p className="text-sm font-bold text-gray-700">
                {item.side === "summary"
                  ? "🔗 اختر المحاضرة المقابلة من الأسئلة:"
                  : "🔗 اختر المحاضرة المقابلة من الملخص:"}
              </p>
              <select
                value={selectedTarget}
                onChange={(e) => setSelectedTarget(e.target.value)}
                className="w-full border-2 rounded-xl p-3 text-sm bg-white focus:outline-none"
                style={{
                  borderColor: selectedTarget ? V : "#e5e7eb",
                  direction: "rtl",
                }}
              >
                <option value="">— اختر —</option>
                {oppositeOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>

            {/* Which name wins */}
            {selectedTarget && (
              <div className="space-y-2">
                <p className="text-sm font-bold text-gray-700">
                  الاسم النهائي الموحَّد:
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setAuthoritative(item.side)}
                    className="flex-1 py-3 rounded-xl text-sm font-bold transition-all"
                    style={{
                      background: authoritative === item.side ? V : V + "11",
                      color: authoritative === item.side ? "white" : V,
                      border: `2px solid ${V}44`,
                    }}
                  >
                    {item.side === "summary" ? summaryName : questionsName}
                    <span className="block text-xs font-normal opacity-70 mt-0.5">
                      {item.side === "summary" ? "(من الملخص)" : "(من الأسئلة)"}
                    </span>
                  </button>
                  <button
                    onClick={() =>
                      setAuthoritative(
                        item.side === "summary" ? "questions" : "summary",
                      )
                    }
                    className="flex-1 py-3 rounded-xl text-sm font-bold transition-all"
                    style={{
                      background: authoritative !== item.side ? T : T + "11",
                      color: authoritative !== item.side ? "white" : T,
                      border: `2px solid ${T}44`,
                    }}
                  >
                    {selectedTarget}
                    <span className="block text-xs font-normal opacity-70 mt-0.5">
                      {item.side === "summary" ? "(من الأسئلة)" : "(من الملخص)"}
                    </span>
                  </button>
                </div>
              </div>
            )}

            {selectedTarget && (
              <div
                className="rounded-xl p-3 text-xs text-gray-500"
                style={{ background: "#f7f3ff" }}
              >
                سيتم تغيير اسم المحاضرة في <strong>كلا الطرفين</strong> إلى:{" "}
                <strong style={{ color: V }}>
                  {authoritative === item.side
                    ? item.side === "summary"
                      ? summaryName
                      : questionsName
                    : selectedTarget}
                </strong>
              </div>
            )}
          </div>

          <div className="flex gap-3 px-6 py-4 border-t-2 border-gray-100">
            <button
              onClick={onClose}
              className="flex-1 py-3 rounded-xl text-sm font-bold"
              style={{ background: "#f1f1f4", color: "#666" }}
            >
              إلغاء
            </button>
            <button
              onClick={handleApply}
              disabled={!selectedTarget}
              className="flex-1 py-3 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: V }}
            >
              تطبيق الربط ✓
            </button>
          </div>
        </div>
      </div>
    );
  },
);

// ─── LectureLinkPanel (Main Export) ──────────────────────────────────────────
const LectureLinkPanel = memo(
  ({ formData, onRenameInSummary, onRenameInQuestions }) => {
    const [collapsed, setCollapsed] = useState(false);
    const [linkModalItem, setLinkModalItem] = useState(null);

    // ── Derive all lecture names from both sides ───────────────────────────────
    const summaryTitles = useMemo(() => {
      const titles = (formData.summary || [])
        .map(getSummaryTitle)
        .filter(Boolean);
      return Array.from(new Set(titles));
    }, [formData.summary]);

    const questionLectures = useMemo(() => {
      const lectures = (formData.questions || [])
        .map((q) => q.lecture?.trim())
        .filter(Boolean);
      return Array.from(new Set(lectures));
    }, [formData.questions]);

    // ── Compute status for each name ──────────────────────────────────────────
    const { linked, summaryOnly, questionsOnly } = useMemo(() => {
      const sSet = new Set(summaryTitles);
      const qSet = new Set(questionLectures);

      const linked = summaryTitles.filter((t) => qSet.has(t));
      const summaryOnly = summaryTitles.filter((t) => !qSet.has(t));
      const questionsOnly = questionLectures.filter((l) => !sSet.has(l));

      return { linked, summaryOnly, questionsOnly };
    }, [summaryTitles, questionLectures]);

    const totalIssues = summaryOnly.length + questionsOnly.length;

    // ── Handle link apply ─────────────────────────────────────────────────────
    const handleLinkApply = ({ finalName, summaryTitle, questionsLecture }) => {
      if (summaryTitle && summaryTitle !== finalName) {
        onRenameInSummary(summaryTitle, finalName);
      }
      if (questionsLecture && questionsLecture !== finalName) {
        onRenameInQuestions(questionsLecture, finalName);
      }
      setLinkModalItem(null);
    };

    // ── Nothing to show if both sides are empty ───────────────────────────────
    if (summaryTitles.length === 0 && questionLectures.length === 0)
      return null;

    return (
      <>
        <div
          dir="rtl"
          className="mx-3 rounded-2xl overflow-hidden"
          style={{
            border: `2px solid ${totalIssues > 0 ? W + "66" : T + "44"}`,
          }}
        >
          {/* ── Header bar ── */}
          <button
            onClick={() => setCollapsed((v) => !v)}
            className="w-full flex items-center justify-between px-5 py-4 text-right transition-colors"
            style={{
              background:
                totalIssues > 0
                  ? `linear-gradient(120deg, ${W}18 0%, ${W}06 100%)`
                  : `linear-gradient(120deg, ${T}14 0%, ${T}04 100%)`,
            }}
          >
            <div className="flex items-center gap-3">
              {totalIssues > 0 ? (
                <AlertTriangle size={18} style={{ color: W }} />
              ) : (
                <CheckCircle2 size={18} style={{ color: T }} />
              )}
              <span className="font-black text-gray-800 text-sm">
                ربط المحاضرات بين الملخص والأسئلة
              </span>
              {totalIssues > 0 && (
                <span
                  className="text-xs font-black px-2.5 py-0.5 rounded-full"
                  style={{ background: W + "25", color: W }}
                >
                  {totalIssues} غير مربوط
                </span>
              )}
            </div>
            {collapsed ? (
              <ChevronRight size={18} color="#999" />
            ) : (
              <ChevronDown size={18} color="#999" />
            )}
          </button>

          {/* ── Body ── */}
          {!collapsed && (
            <div className="p-4 space-y-4 bg-white">
              {/* Linked ✅ */}
              {linked.length > 0 && (
                <section className="space-y-2">
                  <p className="text-xs font-black text-gray-400 tracking-wide">
                    ✅ مربوطة ({linked.length})
                  </p>
                  <div className="space-y-1.5">
                    {linked.map((name) => (
                      <div
                        key={name}
                        className="flex items-center gap-3 px-4 py-2.5 rounded-xl"
                        style={{
                          background: T + "0d",
                          border: `1px solid ${T}33`,
                        }}
                      >
                        <Link2
                          size={14}
                          style={{ color: T }}
                          className="shrink-0"
                        />
                        <span className="text-sm font-bold text-gray-700 flex-1 truncate">
                          {name}
                        </span>
                        <span
                          className="text-xs px-2 py-0.5 rounded-full font-bold"
                          style={{ background: T + "18", color: T }}
                        >
                          ملخص + أسئلة
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Summary only ⚠️ */}
              {summaryOnly.length > 0 && (
                <section className="space-y-2">
                  <p
                    className="text-xs font-black tracking-wide"
                    style={{ color: W }}
                  >
                    ⚠️ في الملخص فقط — لا يوجد لها أسئلة ({summaryOnly.length})
                  </p>
                  <div className="space-y-1.5">
                    {summaryOnly.map((name) => (
                      <div
                        key={name}
                        className="flex items-center gap-3 px-4 py-2.5 rounded-xl"
                        style={{
                          background: W + "0d",
                          border: `1px solid ${W}44`,
                        }}
                      >
                        <Link2Off
                          size={14}
                          style={{ color: W }}
                          className="shrink-0"
                        />
                        <span className="text-sm font-bold text-gray-700 flex-1 truncate">
                          {name}
                        </span>
                        <button
                          onClick={() =>
                            setLinkModalItem({
                              side: "summary",
                              summaryTitle: name,
                              questionsLecture: null,
                            })
                          }
                          className="text-xs px-3 py-1.5 rounded-lg font-bold transition-all shrink-0"
                          style={{
                            background: V + "18",
                            color: V,
                            border: `1.5px solid ${V}44`,
                          }}
                        >
                          اربط ↔
                        </button>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Questions only ⚠️ */}
              {questionsOnly.length > 0 && (
                <section className="space-y-2">
                  <p
                    className="text-xs font-black tracking-wide"
                    style={{ color: C }}
                  >
                    ⚠️ في الأسئلة فقط — لا يوجد لها ملخص ({questionsOnly.length}
                    )
                  </p>
                  <div className="space-y-1.5">
                    {questionsOnly.map((name) => (
                      <div
                        key={name}
                        className="flex items-center gap-3 px-4 py-2.5 rounded-xl"
                        style={{
                          background: C + "0d",
                          border: `1px solid ${C}44`,
                        }}
                      >
                        <Link2Off
                          size={14}
                          style={{ color: C }}
                          className="shrink-0"
                        />
                        <span className="text-sm font-bold text-gray-700 flex-1 truncate">
                          {name}
                        </span>
                        <button
                          onClick={() =>
                            setLinkModalItem({
                              side: "questions",
                              summaryTitle: null,
                              questionsLecture: name,
                            })
                          }
                          className="text-xs px-3 py-1.5 rounded-lg font-bold transition-all shrink-0"
                          style={{
                            background: V + "18",
                            color: V,
                            border: `1.5px solid ${V}44`,
                          }}
                        >
                          اربط ↔
                        </button>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* All clear */}
              {totalIssues === 0 && (
                <div className="text-center py-3">
                  <p className="text-sm font-bold" style={{ color: T }}>
                    🎉 جميع المحاضرات مربوطة بشكل صحيح
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Link Modal */}
        {linkModalItem && (
          <LinkModal
            item={linkModalItem}
            allSummaryTitles={summaryTitles}
            allQuestionLectures={questionLectures}
            onApply={handleLinkApply}
            onClose={() => setLinkModalItem(null)}
          />
        )}
      </>
    );
  },
);

export default LectureLinkPanel;
