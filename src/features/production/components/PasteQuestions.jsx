import { useMemo, useState } from "react";
import { ClipboardPaste, X, CheckCircle2, AlertTriangle } from "lucide-react";
import { parsePastedQuestions, diagnosePaste } from "../lib/parseQuestions";

// ─── لصق أسئلة بالتنسيق واستخراجها ────────────────────────────────────────────
// نفس التنسيق المستعمل في محرّر المادة، ونفس المُحلِّل — نسخةٌ واحدة يشترك
// فيها المحرّران وخطّ الإنتاج.
//
// المعاينة قبل الإضافة مقصودة: اللصق يضيف عشرات الأسئلة دفعةً، واكتشاف
// الخطأ بعدها يعني حذفها واحداً واحداً.

export default function PasteQuestions({ onAdd, color = "#f59e0b" }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");

  const parsed = useMemo(() => parsePastedQuestions(text), [text]);
  const diag = useMemo(() => diagnosePaste(text), [text]);

  const apply = () => {
    if (!parsed.length) return;
    onAdd(parsed);
    setText("");
    setOpen(false);
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-xs font-semibold rounded-lg px-3 py-2 flex items-center gap-1.5 border"
        style={{ color, backgroundColor: `${color}14`, borderColor: `${color}33` }}
      >
        <ClipboardPaste size={13} /> لصق أسئلة من نصّ
      </button>

      {open && (
        <div
          className="fixed inset-0 bg-black/45 flex items-center justify-center z-50 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            dir="rtl"
            className="bg-white rounded-2xl w-full max-w-3xl max-h-[88vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 p-4 border-b border-gray-100">
              <div className="flex-1">
                <h3 className="text-base font-bold text-gray-800">
                  لصق أسئلة من نصّ
                </h3>
                <p className="text-xs text-gray-400">
                  كل سؤال: سطر السؤال ثم أربعة خيارات · الصحيح مُعلَّم بـ ✅ ·
                  سطر فارغ بين كل سؤالين
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-hidden flex flex-col lg:flex-row">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                dir="rtl"
                autoFocus
                placeholder={"النخر\nما العامل الأساسي؟\nالجراثيم ✅\nالوراثة\nالعمر\nالغذاء\n\nسؤال ثانٍ؟\n…"}
                className="lg:w-1/2 flex-1 p-4 text-sm leading-7 font-arabic outline-none resize-none border-b lg:border-b-0 lg:border-l border-gray-100"
              />

              <div className="lg:w-1/2 overflow-y-auto p-4 bg-gray-50">
                {text.trim() === "" ? (
                  <p className="text-sm text-gray-400 text-center py-8">
                    الصق النصّ ليظهر ما سيُضاف
                  </p>
                ) : parsed.length === 0 ? (
                  <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl p-3">
                    <p className="font-bold flex items-center gap-1.5 mb-1">
                      <AlertTriangle size={14} /> لم يُستخرج أي سؤال
                    </p>
                    {/* التشخيص بدل رسالة عامة: يقول أين الخلل بالضبط */}
                    <p className="text-xs">{diag.hint || "تحقّق من التنسيق"}</p>
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
                    </p>
                    <div className="flex flex-col gap-2">
                      {parsed.slice(0, 25).map((q, i) => (
                        <div
                          key={i}
                          className="bg-white rounded-lg border border-gray-200 p-2.5"
                        >
                          <p className="text-xs font-semibold text-gray-800 font-arabic">
                            {i + 1}. {q.question}
                          </p>
                          {q.lecture && (
                            <p className="text-[11px] text-brand mt-0.5">
                              {q.lecture}
                            </p>
                          )}
                          <p className="text-[11px] text-gray-500 mt-1 font-arabic">
                            الصحيح: {q.options[q.answer - 1] || "—"}
                          </p>
                        </div>
                      ))}
                      {parsed.length > 25 && (
                        <p className="text-xs text-gray-400 text-center">
                          و{parsed.length - 25} غيرها…
                        </p>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="p-4 border-t border-gray-100 flex items-center gap-3">
              <p className="text-xs text-gray-400 flex-1">
                تُضاف إلى الموجود ولا تستبدله
              </p>
              <button
                onClick={apply}
                disabled={parsed.length === 0}
                className="text-white text-sm font-bold rounded-xl px-6 py-2.5 disabled:opacity-40 flex items-center gap-2"
                style={{ backgroundColor: color }}
              >
                <ClipboardPaste size={15} /> أضف {parsed.length || ""}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
