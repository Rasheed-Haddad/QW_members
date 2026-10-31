import { useMemo, useState } from "react";
import {
  Bot,
  X,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Plus,
} from "lucide-react";
import { generateMcq, claudeError } from "../lib/claudeRun";
import { useCostScope } from "../lib/costScope";
import { parsePastedQuestions, diagnosePaste } from "../lib/parseQuestions";
import {
  ClaudeModelPicker,
  claudeDisabledReason,
  useClaudePrefs,
  useClaudeStatus,
  useElapsed,
} from "./ClaudeModelPicker";

// ─── توليد أسئلة MCQ بـ Claude ────────────────────────────────────────────────
// المدخل: أقسام الملخّص كما هي (JSON). الخادم يرسلها مع مهارة
// mcq-doctor-style ويعيد نصاً بتنسيق «لصق الأسئلة»، فيُحلَّل بالمحلّل نفسه
// ويُعايَن قبل الإضافة — كاللصق تماماً.
//
// الزرّ يسأل الخادم أولاً إن كان المفتاح مضبوطاً: بدونه يبقى ظاهراً معطّلاً
// يشرح السبب، فيعمل فور تعيين ANTHROPIC_API_KEY على Render بلا تعديل هنا.
// النموذج والجهد يُختاران هنا (ClaudeModelPicker) لا في الخادم.

const COLOR = "#d97757";
const DEFAULT_COUNT = 40;

export default function ClaudeMcqAction({
  summary,
  lectureName,
  subjectName,
  onAdd,
}) {
  const costScope = useCostScope();
  const status = useClaudeStatus();
  const prefs = useClaudePrefs(status);
  const { model, effort } = prefs;
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(DEFAULT_COUNT);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null); // { text, requested, stop_reason, model }
  const [error, setError] = useState("");
  const [statusLine, setStatusLine] = useState("");

  const elapsed = useElapsed(running);

  const parsed = useMemo(() => {
    if (!result?.text) return [];
    // «لا تتعدى» — ما زاد عن العدد المطلوب يُقصّ
    return parsePastedQuestions(result.text).slice(0, result.requested);
  }, [result]);
  const diag = useMemo(() => diagnosePaste(result?.text || ""), [result]);

  const hasSummary = Array.isArray(summary) && summary.length > 0;
  const configured = !!status?.configured;

  const generate = async () => {
    setRunning(true);
    setError("");
    setResult(null);
    try {
      const r = await generateMcq(
        prefs.mode,
        {
          summary,
          number_of_questions: count,
          model,
          effort,
          lecture_name: lectureName,
          subject_name: subjectName,
          cost: costScope,
        },
        { onStatus: setStatusLine },
      );
      // الدفعة لا تُرجع العدد المطلوب — نثبّته من الطلب نفسه
      setResult({ ...r, requested: r.requested || Number(count), effort: r.effort || effort });
    } catch (e) {
      setError(claudeError(e).message);
    } finally {
      setRunning(false);
      setStatusLine("");
    }
  };

  const add = () => {
    if (!parsed.length) return;
    onAdd(
      parsed.map(({ question, options, answer }) => ({
        question,
        options,
        answer,
      })),
    );
    setResult(null);
    setOpen(false);
  };

  // الإغلاق لا يوقف التوليد: الحالة في المكوّن لا في النافذة، فالنتيجة
  // تنتظر عند إعادة الفتح (Batch خصوصاً قد يطول دقائق)
  const close = () => setOpen(false);

  const disabledReason =
    claudeDisabledReason(status) ||
    (!hasSummary ? "الملخص فارغ — التوليد يقرأ من تبويب الملخص" : "");

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        disabled={!!disabledReason}
        title={
          disabledReason || "توليد أسئلة من الملخص بمهارة mcq-doctor-style"
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
        {status && !configured && (
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
                  توليد أسئلة بـ Claude
                </h3>
                <p className="text-xs text-gray-400">
                  من ملخّص «{lectureName || "المحاضرة"}» ({summary?.length || 0}{" "}
                  قسم) · مهارة mcq-doctor-style
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
              <label className="flex flex-col gap-1 text-xs text-gray-500">
                عدد الأسئلة (حدّ أقصى)
                <input
                  type="number"
                  min={1}
                  max={status?.max_count || 200}
                  value={count}
                  onChange={(e) => setCount(e.target.value)}
                  disabled={running}
                  className="w-24 border border-gray-300 rounded-lg p-2 text-sm text-center"
                />
              </label>
              <button
                onClick={generate}
                disabled={running || !model || !effort || !(Number(count) > 0)}
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

            <div className="flex-1 overflow-y-auto p-4 bg-gray-50">
              {error && (
                <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl p-3 flex items-start gap-2">
                  <AlertTriangle size={15} className="shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {running && (
                <p className="text-sm text-gray-500 text-center py-8">
                  يقرأ Claude المهارة والملخّص ثم يصوغ الأسئلة — قد يستغرق دقيقة
                  أو أكثر. لا تغلق النافذة.
                </p>
              )}

              {!running && !result && !error && (
                <p className="text-sm text-gray-400 text-center py-8">
                  اضبط العدد ثم اضغط «توليد». الأسئلة تُعايَن هنا قبل إضافتها.
                </p>
              )}

              {result && (
                <>
                  {result.stop_reason === "max_tokens" && (
                    <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2 mb-3">
                      انقطع التوليد قبل اكتماله — آخر سؤال قد يكون ناقصاً
                      فتخطّاه المحلّل.
                    </p>
                  )}
                  {parsed.length === 0 ? (
                    <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl p-3">
                      <p className="font-bold flex items-center gap-1.5 mb-1">
                        <AlertTriangle size={14} /> لم يُستخرج أي سؤال من الردّ
                      </p>
                      <p className="text-xs mb-2">
                        {diag.hint || "الردّ بتنسيق غير متوقَّع"}
                      </p>
                      <textarea
                        readOnly
                        value={result.text}
                        className="w-full h-48 text-xs p-2 border border-red-100 rounded-lg bg-white"
                      />
                    </div>
                  ) : (
                    <>
                      <p className="text-sm font-bold text-green-700 flex items-center gap-1.5 mb-3">
                        <CheckCircle2 size={15} /> {parsed.length} سؤالاً جاهزاً
                        {diag.bad > 0 && (
                          <span className="text-xs font-normal text-amber-700">
                            · {diag.bad} كتلة تُخطّت
                          </span>
                        )}
                        <span className="text-[11px] font-normal text-gray-400 mr-auto">
                          {result.model} · {result.effort}
                        </span>
                      </p>
                      <div className="flex flex-col gap-2">
                        {parsed.map((q, i) => (
                          <div
                            key={i}
                            className="bg-white rounded-lg border border-gray-200 p-2.5"
                          >
                            <p className="text-xs font-semibold text-gray-800 font-arabic">
                              {i + 1}. {q.question}
                            </p>
                            <p className="text-[11px] text-gray-500 mt-1 font-arabic">
                              الصحيح ({q.answer}):{" "}
                              {q.options[q.answer - 1] || "—"}
                            </p>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </>
              )}
            </div>

            <div className="p-4 border-t border-gray-100 flex items-center gap-3">
              <p className="text-xs text-gray-400 flex-1">
                تُضاف إلى الموجود ولا تستبدله · تُحفظ بزرّ «حفظ» كالعادة
              </p>
              <button
                onClick={add}
                disabled={running || parsed.length === 0}
                className="text-white text-sm font-bold rounded-xl px-6 py-2.5 disabled:opacity-40 flex items-center gap-2"
                style={{ backgroundColor: COLOR }}
              >
                <Plus size={15} /> أضف {parsed.length || ""}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
