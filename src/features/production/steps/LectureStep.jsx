import { useEffect, useState } from "react";
import { Loader2, AlertTriangle, ArrowLeft, Layers } from "lucide-react";
import { usePipeline } from "../pipelineStore";
import { getSubject, SCOPE, completeness } from "../../exams/v2api";
import LectureTabs from "../../exams/LectureTabs";

// ─── خطوة محتوى المحاضرة داخل خط الإنتاج ─────────────────────────────────────
// خطوتا الملخص والأسئلة كانتا محرِّرَين على مستوى المادة كلها، يربطان
// المحتوى بالمحاضرة عبر تطابق الاسم النصّي: تعديل حرفٍ في اسم محاضرة
// يفصل ملخصها عن أسئلتها بصمت. لذلك كان في الخطوة «لوح ربط» يوفّق بين
// ثلاثة أسماء يدوياً.
//
// بعد توحيد الهيكل صار المحتوى داخل كائن المحاضرة والوصول بـlecture_id،
// فلا اسم يُطابَق ولا لوح يُوفَّق. ونستعمل محرّر مساحة العمل نفسه (لا نسخة
// منه) — محرّرٌ واحد يعني إصلاحاً واحداً لكل عيب.

export default function LectureStep({ part, nextStep, title, hint }) {
  const { state, dispatch } = usePipeline();
  const { target } = state;

  const [lectures, setLectures] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = async () => {
    if (!target?.subjectId) return;
    setLoading(true);
    setError(null);
    try {
      const d = await getSubject(target.subjectId, SCOPE.LIST);
      const list = d.lectures || [];
      setLectures(list);
      setSelected((prev) =>
        prev && list.some((l) => l.lecture_id === prev)
          ? prev
          : list[0]?.lecture_id || null,
      );
    } catch (e) {
      setError(e?.response?.data?.message || "تعذّر جلب محاضرات المادة");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.subjectId]);

  if (!target?.subjectId) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center">
        <Layers size={24} className="text-gray-300 mx-auto mb-3" />
        <p className="text-sm text-gray-500">
          حدِّد المادة الهدف في خطوة المراجعة أولاً
        </p>
      </div>
    );
  }

  // كم محاضرة أنجزت هذا الجزء — تقدّمٌ ظاهر بلا فتح كل تبويب
  const done = lectures.filter((l) => completeness(l)[part]).length;

  return (
    <div className="flex flex-col gap-4" dir="rtl">
      <div className="bg-white rounded-2xl border border-gray-100 p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <h3 className="text-sm font-bold text-gray-800">{title}</h3>
          <span
            className={`text-xs font-semibold px-2 py-1 rounded-lg ${
              done === lectures.length && lectures.length > 0
                ? "text-green-700 bg-green-50"
                : "text-amber-700 bg-amber-50"
            }`}
          >
            {done}/{lectures.length} محاضرة
          </span>
          <button
            onClick={() => dispatch({ type: "step", step: nextStep })}
            className="mr-auto text-xs bg-brand text-white rounded-xl px-4 py-2 flex items-center gap-1.5"
          >
            التالي <ArrowLeft size={14} />
          </button>
        </div>
        {hint && <p className="text-xs text-gray-500 mt-2">{hint}</p>}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl px-4 py-2.5 flex items-start gap-2">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      {loading ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center">
          <Loader2 size={22} className="animate-spin mx-auto text-brand" />
        </div>
      ) : lectures.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center">
          <p className="text-sm text-gray-500">
            لا محاضرات في هذه المادة — ارفع النصوص من خطوة المراجعة أولاً
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-4 items-start">
          <div className="bg-white rounded-2xl border border-gray-100 p-3 lg:sticky lg:top-4">
            <div className="flex flex-col gap-1.5 max-h-[60vh] overflow-y-auto">
              {lectures.map((l) => {
                const ok = completeness(l)[part];
                return (
                  <button
                    key={l.lecture_id}
                    onClick={() => setSelected(l.lecture_id)}
                    className={`text-right rounded-xl border p-2.5 text-sm font-arabic flex items-center gap-2 ${
                      selected === l.lecture_id
                        ? "border-brand bg-brand/5 font-bold"
                        : "border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: ok ? "#10b981" : "#e5e7eb" }}
                    />
                    <span className="truncate">{l.name || "بلا اسم"}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="min-w-0 bg-white rounded-2xl border border-gray-100 overflow-hidden">
            {selected && (
              <LectureTabs
                key={selected}
                subjectId={target.subjectId}
                subjectName={target.name}
                lectureId={selected}
                initialTab={part}
                onSaved={load}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
