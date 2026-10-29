import { useState } from "react";
import {
  Bot,
  X,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Replace,
  Plus,
  ChevronDown,
} from "lucide-react";
import { generateSummary, claudeError } from "../lib/claudeRun";
import {
  ClaudeModelPicker,
  claudeDisabledReason,
  useClaudePrefs,
  useClaudeStatus,
  useElapsed,
} from "./ClaudeModelPicker";

// ─── توليد الملخّص بـ Claude ──────────────────────────────────────────────────
// مرحلتان في الخادم: نصّ المقرَّر (بلا صور) ← مهارة fahm-alnas ← حقائق نصّية
// ← مهارة text-to-json-template ← أقسام JSON بقالب الملخّص نفسه. تُعايَن
// العناوين قبل التطبيق، ثم تستبدل الملخّص أو تُضاف بعده.

const COLOR = "#d97757";

export default function ClaudeSummaryAction({
  curriculum,
  existingCount,
  lectureName,
  subjectName,
  onApply, // (sections, mode: "replace" | "append")
}) {
  const status = useClaudeStatus();
  const prefs = useClaudePrefs(status);
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null); // { sections, facts, model, effort }
  const [error, setError] = useState(null); // { message, facts?, raw? }
  const [showFacts, setShowFacts] = useState(false);
  const [statusLine, setStatusLine] = useState("");
  const elapsed = useElapsed(running);

  const hasText = !!String(curriculum || "").trim();
  const disabledReason =
    claudeDisabledReason(status) ||
    (!hasText ? "نص المقرر فارغ — التوليد يقرأ من تبويب المقرر" : "");

  const generate = async () => {
    setRunning(true);
    setError(null);
    setResult(null);
    setShowFacts(false);
    try {
      const r = await generateSummary(
        prefs.mode,
        {
          curriculum,
          model: prefs.model,
          effort: prefs.effort,
          lecture_name: lectureName,
          subject_name: subjectName,
        },
        { onStatus: setStatusLine },
      );
      setResult({ ...r, effort: r.effort || prefs.effort });
    } catch (e) {
      setError(claudeError(e));
    } finally {
      setRunning(false);
      setStatusLine("");
    }
  };

  const apply = (mode) => {
    if (!result?.sections?.length) return;
    if (
      mode === "replace" &&
      existingCount > 0 &&
      !window.confirm(
        `سيُستبدل الملخص الحالي (${existingCount} قسم) بالمولَّد. متابعة؟`,
      )
    ) {
      return;
    }
    onApply(result.sections, mode);
    setResult(null);
    setOpen(false);
  };

  // الإغلاق لا يوقف التوليد: الحالة في المكوّن لا في النافذة، فالنتيجة
  // تنتظر عند إعادة الفتح (Batch خصوصاً قد يطول دقائق)
  const close = () => setOpen(false);

  const facts = result?.facts || error?.facts;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        disabled={!!disabledReason}
        title={
          disabledReason ||
          "توليد ملخّص من نص المقرر بمهارتي fahm-alnas و text-to-json-template"
        }
        className="text-xs font-semibold rounded-lg px-3 py-2 flex items-center gap-1.5 border disabled:opacity-50 disabled:cursor-not-allowed"
        style={{
          color: COLOR,
          backgroundColor: `${COLOR}14`,
          borderColor: `${COLOR}33`,
        }}
      >
        {running ? <Loader2 size={13} className="animate-spin" /> : <Bot size={13} />}
        {running ? "جارٍ التوليد…" : "توليد بالذكاء الاصطناعي"}
        {status && !status.configured && (
          <span className="text-[10px] font-normal text-gray-500">
            (غير مفعّل)
          </span>
        )}
      </button>

      {open && (
        <div
          className="fixed inset-0 bg-black/45 flex items-center justify-center z-50 p-4"
          onClick={close}
        >
          <div
            dir="rtl"
            className="bg-white rounded-2xl w-full max-w-2xl max-h-[88vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 p-4 border-b border-gray-100">
              <div className="flex-1">
                <h3 className="text-base font-bold text-gray-800">
                  توليد بالذكاء الاصطناعي
                </h3>
                <p className="text-xs text-gray-400">
                  من نص مقرّر «{lectureName || "المحاضرة"}» (الصور مستثناة) ·
                  fahm-alnas ثم text-to-json-template
                </p>
              </div>
              <button
                onClick={close}
                className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-4 flex items-end gap-3 border-b border-gray-100 flex-wrap">
              <ClaudeModelPicker
                status={status}
                prefs={prefs}
                disabled={running}
              />
              <button
                onClick={generate}
                disabled={running || !prefs.model || !prefs.effort}
                className="mr-auto text-white text-sm font-bold rounded-xl px-5 py-2.5 disabled:opacity-40 flex items-center gap-2"
                style={{ backgroundColor: COLOR }}
              >
                {running ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <Bot size={15} />
                )}
                {running
                  ? `جارٍ التوليد… ${elapsed}ث`
                  : result
                    ? "إعادة التوليد"
                    : "توليد"}
              </button>
            </div>

            {running && statusLine && (
              <p className="px-4 py-2 text-xs text-gray-600 bg-amber-50 border-b border-amber-100">
                {statusLine}
                {prefs.mode === "batch" && " · يمكنك إغلاق النافذة، والنتيجة تنتظرك هنا"}
              </p>
            )}

            <div className="flex-1 overflow-y-auto p-4 bg-gray-50 space-y-3">
              {running && (
                <p className="text-sm text-gray-500 text-center py-8">
                  مرحلتان على التوالي: استخراج الحقائق ثم بناء القالب — قد
                  يستغرق ذلك بضع دقائق للمحاضرة الطويلة. لا تغلق النافذة.
                </p>
              )}

              {!running && !result && !error && (
                <p className="text-sm text-gray-400 text-center py-8">
                  اختر النموذج والجهد ثم اضغط «توليد». الأقسام تُعايَن هنا قبل
                  تطبيقها.
                </p>
              )}

              {error && (
                <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl p-3">
                  <p className="flex items-start gap-2">
                    <AlertTriangle size={15} className="shrink-0 mt-0.5" />
                    <span>{error.message}</span>
                  </p>
                  {error.raw && (
                    <textarea
                      readOnly
                      value={error.raw}
                      dir="ltr"
                      className="w-full h-40 text-xs p-2 mt-2 border border-red-100 rounded-lg bg-white"
                    />
                  )}
                </div>
              )}

              {result && (
                <>
                  {result.stop_reason === "max_tokens" && (
                    <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">
                      انقطع التوليد قبل اكتماله — قد تنقص الأقسام الأخيرة.
                    </p>
                  )}
                  <p className="text-sm font-bold text-green-700 flex items-center gap-1.5">
                    <CheckCircle2 size={15} /> {result.sections.length} قسماً
                    جاهزاً
                    <span className="text-[11px] font-normal text-gray-400 mr-auto">
                      {result.model} · {result.effort}
                    </span>
                  </p>
                  <div className="flex flex-col gap-2">
                    {result.sections.map((s, i) => (
                      <div
                        key={i}
                        className="bg-white rounded-lg border border-gray-200 p-2.5"
                      >
                        <p className="text-sm font-semibold text-gray-800 font-arabic">
                          {s.number}. {s.title || "بلا عنوان"}
                        </p>
                        <p className="text-[11px] text-gray-400 mt-0.5">
                          {s.content_blocks.length} بلوك ·{" "}
                          {[
                            ...new Set(
                              s.content_blocks
                                .map((b) => b.type)
                                .filter(Boolean),
                            ),
                          ].join("، ")}
                        </p>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* ناتج المرحلة الأولى — للاطّلاع، ويبقى متاحاً حتى إن فشلت الثانية */}
              {facts && (
                <div>
                  <button
                    onClick={() => setShowFacts((v) => !v)}
                    className="text-xs text-gray-600 flex items-center gap-1 hover:underline"
                  >
                    <ChevronDown
                      size={14}
                      className={`transition ${showFacts ? "rotate-180" : ""}`}
                    />
                    {showFacts ? "إخفاء" : "عرض"} الحقائق (ناتج المرحلة الأولى)
                  </button>
                  {showFacts && (
                    <pre className="mt-2 whitespace-pre-wrap text-xs leading-6 bg-white border border-gray-200 rounded-lg p-3 font-arabic max-h-72 overflow-y-auto">
                      {facts}
                    </pre>
                  )}
                </div>
              )}
            </div>

            <div className="p-4 border-t border-gray-100 flex items-center gap-2 flex-wrap">
              <p className="text-xs text-gray-400 flex-1">
                يُحفظ بزرّ «حفظ» كالعادة
              </p>
              {existingCount > 0 && (
                <button
                  onClick={() => apply("append")}
                  disabled={running || !result?.sections?.length}
                  className="text-sm font-bold rounded-xl px-4 py-2.5 border disabled:opacity-40 flex items-center gap-2"
                  style={{ color: COLOR, borderColor: `${COLOR}55` }}
                >
                  <Plus size={15} /> إضافة بعد الموجود
                </button>
              )}
              <button
                onClick={() => apply("replace")}
                disabled={running || !result?.sections?.length}
                className="text-white text-sm font-bold rounded-xl px-5 py-2.5 disabled:opacity-40 flex items-center gap-2"
                style={{ backgroundColor: COLOR }}
              >
                <Replace size={15} />
                {existingCount > 0 ? "استبدال الملخص" : "اعتماد الملخص"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
