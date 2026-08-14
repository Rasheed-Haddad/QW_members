import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import {
  X,
  BookOpen,
  Layers,
  Puzzle,
  ChevronLeft,
  FileText,
  HelpCircle,
  Sparkles,
  PenLine,
  AlignLeft,
} from "lucide-react";
import { fetch_one_subject } from "../../store/examsSlice";

// ─── اختيار نطاق التعديل ──────────────────────────────────────────────────────
// المادة تزن ~294 KB. تعديل بطاقة فلاش واحدة لا يستحق جلبها كلها ولا
// حفظها كلها. النطاق يجعل حجم الطلب وحجم الحفظ بقدر ما تنوي تغييره.
//
// ثلاث درجات: مادة كاملة ← محاضرة ← جزء من محاضرة.
// كل درجة تُظهر ما يليها فقط عند الحاجة، فلا يواجه المستخدم كل الخيارات دفعةً.

const PARTS = [
  {
    key: "text",
    label: "نص المقرر",
    icon: AlignLeft,
    color: "#0ea5e9",
    hint: "المحاضرة الكاملة كماركداون",
  },
  {
    key: "summary",
    label: "الملخص",
    icon: FileText,
    color: "#8C52FF",
    hint: "أقسام الملخص ومحتواها",
  },
  {
    key: "questions",
    label: "الأسئلة",
    icon: HelpCircle,
    color: "#f59e0b",
    hint: "أسئلة هذه المحاضرة وحدها",
  },
  {
    key: "flash",
    label: "البطاقات",
    icon: Sparkles,
    color: "#10b981",
    hint: "بطاقات الاسترجاع",
  },
  {
    key: "written",
    label: "الاختبار التحريري",
    icon: PenLine,
    color: "#ef4444",
    hint: "أسئلة المقالية ونموذج الإجابة",
  },
];

const Row = ({ icon: Icon, color, title, hint, badge, onClick, disabled }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={`w-full flex items-center gap-3 p-3.5 rounded-xl border text-right transition-colors ${
      disabled
        ? "border-gray-100 bg-gray-50 cursor-not-allowed opacity-60"
        : "border-gray-200 bg-white hover:border-purple-300 hover:bg-purple-50/40"
    }`}
  >
    <span
      className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
      style={{ backgroundColor: `${color}1A` }}
    >
      <Icon size={17} color={color} />
    </span>
    <span className="flex-1 min-w-0">
      <span className="block text-sm font-semibold text-gray-800">{title}</span>
      {hint && (
        <span className="block text-xs text-gray-500 mt-0.5">{hint}</span>
      )}
    </span>
    {badge !== undefined && badge !== null && (
      <span className="text-xs text-gray-400 shrink-0">{badge}</span>
    )}
    {!disabled && <ChevronLeft size={16} className="text-gray-300 shrink-0" />}
  </button>
);

const EditScopeModal = ({ exam, onClose }) => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { loading } = useSelector((s) => s.exams);

  // step: "scope" → "lecture" → "part"
  const [step, setStep] = useState("scope");
  const [lectures, setLectures] = useState(null);
  const [picked, setPicked] = useState(null);
  // النيّة المعلنة في الخطوة الأولى. بدونها كان اختيار «محاضرة كاملة» يمرّ
  // بخطوة الأجزاء أيضاً، فيُسأل المستخدم عمّا أجاب عنه توّاً.
  const [intent, setIntent] = useState("lecture"); // "lecture" | "part"

  // أسماء المحاضرات تُجلب مرة واحدة عند الحاجة إليها فقط
  useEffect(() => {
    if (step !== "lecture" || lectures) return;
    dispatch(fetch_one_subject({ _id: exam._id, scope: "list" }))
      .unwrap()
      .then((r) => setLectures(r?.data?.lectures || []))
      .catch(() => setLectures([]));
  }, [step, lectures, exam._id, dispatch]);

  // «المادة بأكملها» تفتح مساحة العمل: شريط المحاضرات وتبويبات المحتوى معاً.
  // كانت تفتح نموذج الحقول وحده فلا يرى المستخدم محاضراته إطلاقاً.
  const goWhole = () => {
    onClose();
    navigate(`/exams/work/${exam._id}`);
  };

  // كلا المسارين يفتحان مساحة العمل: هي الشاشة الوحيدة التي تقرأ الهيكل
  // الموحَّد. الشاشة القديمة (exams/lecture) كانت تقرأ text_ref وexam.summary
  // وexam.questions — حقولاً لم تعد موجودة — فتُظهر المحاضرة فارغة إلا من
  // البطاقات والتحريري (الوحيدين المخزَّنين داخل كائن المحاضرة).
  const goLecture = (l) => {
    onClose();
    navigate(`/exams/work/${exam._id}?lecture=${encodeURIComponent(l.lecture_id)}`);
  };

  // مفتاح «نص المقرر» تغيّر من text إلى curriculum في الهيكل الموحَّد
  const TAB_OF = { text: "curriculum" };

  const goPart = (partKey) => {
    onClose();
    const tab = TAB_OF[partKey] || partKey;
    navigate(
      `/exams/work/${exam._id}?lecture=${encodeURIComponent(
        picked.lecture_id,
      )}&tab=${tab}`,
    );
  };

  const title =
    step === "scope"
      ? "ما الذي تريد تعديله؟"
      : step === "lecture"
        ? "اختر المحاضرة"
        : "اختر الجزء";

  const back =
    step === "part"
      ? () => setStep("lecture")
      : step === "lecture"
        ? () => setStep("scope")
        : null;

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        style={{ direction: "rtl" }}
        className="bg-white rounded-2xl w-full max-w-lg max-h-[85vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* الترويسة */}
        <div className="flex items-center gap-3 p-4 border-b border-gray-100">
          {back && (
            <button
              onClick={back}
              className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500"
            >
              <ChevronLeft size={18} className="rotate-180" />
            </button>
          )}
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-bold text-gray-800">{title}</h3>
            <p className="text-xs text-gray-500 truncate">
              {exam.name}
              {picked ? ` · ${picked.name || picked.title || ""}` : ""}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-4 space-y-2.5 overflow-y-auto">
          {step === "scope" && (
            <>
              <Row
                icon={BookOpen}
                color="#8C52FF"
                title="المادة بأكملها"
                hint="شريط المحاضرات مع تبويبات كل محاضرة — وإضافة محاضرة جديدة"
                onClick={goWhole}
              />
              <Row
                icon={Layers}
                color="#0ea5e9"
                title="محاضرة كاملة"
                hint="نص وملخص وأسئلة وبطاقات وتحريري — والحفظ يخصّها وحدها"
                badge={exam.lectures_count ? `${exam.lectures_count}` : null}
                disabled={!exam.lectures_count}
                onClick={() => {
                  setIntent("lecture");
                  setStep("lecture");
                }}
              />
              <Row
                icon={Puzzle}
                color="#10b981"
                title="جزء من محاضرة"
                hint="تبويب واحد فقط — أخفّ جلباً وأسرع حفظاً"
                disabled={!exam.lectures_count}
                onClick={() => {
                  setIntent("part");
                  setStep("lecture");
                }}
              />
              {!exam.lectures_count && (
                <p className="text-xs text-gray-400 text-center pt-2">
                  لا محاضرات في هذه المادة بعد — أنشئها من «المحاضرات»
                </p>
              )}
            </>
          )}

          {step === "lecture" &&
            (lectures === null || loading ? (
              <div className="py-10 text-center">
                <div className="inline-block w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                <p className="text-xs text-gray-500 mt-2">جارٍ جلب الأسماء…</p>
              </div>
            ) : lectures.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-8">
                لا محاضرات
              </p>
            ) : (
              lectures.map((l) => (
                <Row
                  key={l.lecture_id}
                  icon={Layers}
                  color="#0ea5e9"
                  // أسماء حقول v2: name وhas_curriculum وsummary_sections.
                  // قراءة title/has_text/has_summary (حقول الهيكل القديم)
                  // كانت تُظهر كل المحاضرات بلا أسماء و«فارغة» رغم امتلائها.
                  title={l.name || l.title || "بلا اسم"}
                  hint={[
                    l.has_curriculum || l.has_text ? "مقرر" : null,
                    (l.summary_sections || 0) > 0 || l.has_summary
                      ? "ملخص"
                      : null,
                    l.questions_count ? `${l.questions_count} سؤال` : null,
                    l.flash_count ? `${l.flash_count} بطاقة` : null,
                    l.written_count ? "تحريري" : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "فارغة"}
                  onClick={() => {
                    setPicked(l);
                    // «محاضرة كاملة» تنتقل فوراً، و«جزء» تسأل عن الجزء.
                    if (intent === "lecture") goLecture(l);
                    else setStep("part");
                  }}
                />
              ))
            ))}

          {step === "part" && picked && (
            <>
              <Row
                icon={BookOpen}
                color="#8C52FF"
                title="المحاضرة كاملةً"
                hint="كل أجزائها معاً"
                onClick={() => goLecture(picked)}
              />
              <div className="pt-2 pb-1">
                <span className="text-xs text-gray-400">أو جزءاً بعينه</span>
              </div>
              {PARTS.map((p) => (
                <Row
                  key={p.key}
                  icon={p.icon}
                  color={p.color}
                  title={p.label}
                  hint={p.hint}
                  onClick={() => goPart(p.key)}
                />
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default EditScopeModal;
