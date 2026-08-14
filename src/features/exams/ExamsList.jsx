import { useState, useEffect, useCallback, useMemo } from "react";
import { useSelector, useDispatch } from "react-redux";
import { useNavigate, Link } from "react-router-dom";
import {
  Plus,
  Search,
  Edit,
  Trash2,
  AlertCircle,
  XCircle,
  Info,
  CheckSquare,
  Square,
  Factory,
} from "lucide-react";
import {
  delete_exam,
  clearError,
  set_new_data_of_exam,
  add_student_to_exam,
} from "../../store/examsSlice.js";
import EditScopeModal from "./EditScopeModal.jsx";
import SubjectScopePicker from "./SubjectScopePicker.jsx";

const ExamsList = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { exams, loading, error, status } = useSelector((state) => state.exams);
  const [searchTerm, setSearchTerm] = useState("");

  // تطبيع عربي: من يكتب «الاسنان» يقصد «الأسنان»
  const normAr = (x) =>
    String(x || "")
      .replace(/[ً-ْٰـ]/g, "")
      .replace(/[أإآٱ]/g, "ا")
      .replace(/ى/g, "ي")
      .replace(/ة/g, "ه")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  const [new_price, set_new_price] = useState(null);
  const [showStatus, setShowStatus] = useState(true);
  const [STUDENT_ID_TO_ADD, SET_STUDENT_ID_TO_ADD] = useState("");
  const [is_free, set_is_free] = useState(false);
  const [is_moadal, set_is_moadal] = useState(false);
  // المادة المفتوح عليها اختيار نطاق التعديل
  const [scopeFor, setScopeFor] = useState(null);
  // الجامعة والكلية المختارتان — تحكمان أي مواد تُجلب
  const [pick, setPick] = useState({ universityId: null, collegeId: null });

  // إخفاء رسالة الحالة تلقائياً بعد 5 ثوانٍ
  useEffect(() => {
    if (status !== "") {
      setShowStatus(true);
      const timer = setTimeout(() => {
        setShowStatus(false);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [status]);

  const handle_add_student_to_exam = async ({ EXAM_ID }) => {
    if (!STUDENT_ID_TO_ADD || STUDENT_ID_TO_ADD.trim() === "") {
      alert("الرجاء إدخال رقم الطالب");
      return;
    }

    await dispatch(
      add_student_to_exam({
        STUDENT_ID: STUDENT_ID_TO_ADD,
        EXAM_ID: EXAM_ID,
        is_free: is_free,
        is_moadal: is_moadal,
      }),
    );

    // ✅ تحديث الـ state محلياً حسب نوع العملية
    const exam_index = exams.findIndex((exam) => exam._id == EXAM_ID);

    if (exam_index !== -1) {
      const current_exam = exams[exam_index];

      // ✅ حالة التصفية (0000)
      if (STUDENT_ID_TO_ADD === "0000") {
        dispatch(
          set_new_data_of_exam({
            _id: EXAM_ID,
            exam: {
              ...current_exam,
              available_to: [],
              number_of_free_subscriptions: 0,
            },
          }),
        );
      }
      // ✅ حالة إضافة طالب عادي
      else {
        const updated_available_to = [
          ...current_exam.available_to,
          String(STUDENT_ID_TO_ADD),
        ];
        const updated_free_count = is_free
          ? current_exam.number_of_free_subscriptions + 1
          : current_exam.number_of_free_subscriptions;

        dispatch(
          set_new_data_of_exam({
            _id: EXAM_ID,
            exam: {
              ...current_exam,
              available_to: updated_available_to,
              number_of_free_subscriptions: updated_free_count,
            },
          }),
        );
      }
    }

    SET_STUDENT_ID_TO_ADD("");
    set_is_free(false);
  };

  // البحث صار تصفيةً لما هو معروض، لا طلباً للخادم:
  // القائمة هنا مواد كلية واحدة (عشرات لا آلاف)، وقد وصلت أصلاً.
  // إرسال طلبٍ لكل حرف كان يجلب مواد كل الكليات ويكسر الاختيار.
  // البحث تصفيةٌ محلّية في shownExams — لا عمل هنا، والدالة باقية
  // لأن حقل الإدخال ما زال يشير إليها في مواضع.
  const handleSearch = () => {
    /* لا شيء: التصفية تجري في shownExams */
  };

  const handleDeleteExam = (id) => {
    if (window.confirm("هل أنت متأكد من حذف هذا المادة؟")) {
      dispatch(delete_exam(id));
    }
  };

  const handleCloseError = () => {
    dispatch(clearError());
  };

  const handleCloseStatus = () => {
    setShowStatus(false);
  };

  // رندر كل بطاقة امتحان
  const renderExamCard = (exam, index) => {
    return (
      <div
        key={exam.ID}
        style={{ direction: "rtl" }}
        className="bg-white border border-gray-200 rounded-lg p-5 mx-3 mb-4"
      >
        {/* رأس البطاقة */}
        <div className="flex flex-row items-start justify-between mb-4 pb-3 border-b border-gray-100">
          <div className="flex-1">
            <div className="flex flex-row items-center gap-2 mb-1">
              <div className="w-7 h-7 bg-[#8C52FF]/10 rounded-full flex items-center justify-center">
                <span className="text-sm font-bold text-[#8C52FF]">
                  {exam.ID}
                </span>
              </div>
              <span className="text-base font-semibold text-gray-800">
                {exam.name}
              </span>
            </div>
          </div>
        </div>

        {/* معلومات إضافية */}
        <div className="mb-4 flex flex-col gap-3">
          <div className="flex flex-row items-center justify-center gap-1 px-2 py-2.5 rounded">
            <span className="text-sm text-gray-600">الأسئلة :</span>
            <span className="text-sm font-bold text-[#8C52FF]">
              {exam.questions_count ?? ""}
            </span>
          </div>
          <div className="flex flex-row gap-2">
            <input
              type="text"
              className="flex-1 border-2 rounded-md border-[#8C52FF] p-2.5 text-sm"
              value={STUDENT_ID_TO_ADD}
              onChange={(e) => SET_STUDENT_ID_TO_ADD(e.target.value)}
              placeholder="إضافة طالب"
            />
            <button
              className={`${
                STUDENT_ID_TO_ADD == "0000" ? "bg-red-500" : "bg-[#8C52FF]"
              } flex items-center justify-center rounded-lg px-4 hover:opacity-80 transition-opacity`}
              onClick={() => {
                handle_add_student_to_exam({ EXAM_ID: exam._id });
              }}
            >
              <span className="text-white text-sm font-medium">
                {STUDENT_ID_TO_ADD == "0000" ? "تصفية" : "إضافة"}
              </span>
            </button>
          </div>

          {/* ✅ Checkboxes: مجاني + معدل */}
          {STUDENT_ID_TO_ADD !== "0000" && (
            <div className="flex flex-row items-center gap-4">
              <button
                className="flex flex-row items-center gap-2 py-2 hover:opacity-70 transition-opacity"
                onClick={() => set_is_free(!is_free)}
              >
                {is_free ? (
                  <CheckSquare size={20} color="#8C52FF" />
                ) : (
                  <Square size={20} color="#9ca3af" />
                )}
                <span className="text-sm text-gray-700">مجاني</span>
              </button>
              <button
                className="flex flex-row items-center gap-2 py-2 hover:opacity-70 transition-opacity"
                onClick={() => set_is_moadal(!is_moadal)}
                title="اشتراك معدل: يشمل ترفيع + المقرر والفلاش والتحريري والخطة"
              >
                {is_moadal ? (
                  <CheckSquare size={20} color="#10B981" />
                ) : (
                  <Square size={20} color="#9ca3af" />
                )}
                <span className="text-sm text-gray-700">معدل</span>
              </button>
            </div>
          )}
        </div>

        {/* الإجراءات */}
        <div className="flex flex-row items-center gap-2">
          {/* «عرض» حُذف: كان يفتح المادة كاملة (~294 KB) لمجرّد النظر،
              وكل ما يعرضه متاح داخل التعديل. «تعديل» يسأل عن النطاق أولاً
              فلا يُجلب إلا ما ستغيّره فعلاً. */}
          <button
            onClick={() => setScopeFor(exam)}
            className="flex-1 flex flex-row items-center justify-center gap-1.5 py-2.5 px-3 rounded-md bg-yellow-50 hover:bg-yellow-100 transition-colors"
          >
            <Edit size={16} color="#ca8a04" />
            <span className="text-sm font-medium text-yellow-600">تعديل</span>
          </button>
          {/* ✅ زر الحذف مع مسافة إضافية */}
          <div className="ml-2">
            <button
              onClick={() => handleDeleteExam(exam._id)}
              className="flex items-center justify-center p-2.5 rounded-md bg-red-50 hover:bg-red-100 transition-colors"
            >
              <Trash2 size={18} color="#dc2626" />
            </button>
          </div>
        </div>

      </div>
    );
  };

  // Header Component
  const ListHeaderComponent = () => (
    <>
      {/* 🔴 عرض الأخطاء */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 sm:p-4 mx-3 mb-4 mt-3">
          <div className="flex flex-row items-start gap-3">
            <AlertCircle color="#dc2626" size={20} />
            <div className="flex-1">
              <span className="text-red-600 text-xs sm:text-sm">
                {error?.message ?? error}
              </span>
            </div>
            <button onClick={handleCloseError} className="hover:opacity-70">
              <XCircle color="#f87171" size={18} />
            </button>
          </div>
        </div>
      )}

      {/* 🔵 عرض رسالة الحالة */}
      {status !== "" && showStatus && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 sm:p-4 mx-3 mb-4 mt-3">
          <div className="flex flex-row items-start gap-3">
            <Info color="#16a34a" size={20} />
            <div className="flex-1">
              <span className="text-green-800 text-sm sm:text-base">
                {status?.message ?? status}
              </span>
            </div>
            <button onClick={handleCloseStatus} className="hover:opacity-70">
              <XCircle color="#86efac" size={18} />
            </button>
          </div>
        </div>
      )}

      {/* مساران لإنشاء المادة — كلاهما هنا لأن المادة تُولد من هذه الشاشة:
          خطّ الإنتاج (من ملف المقرَّر إلى مادة كاملة)، أو مادة فارغة تُملأ يدوياً. */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-3 mb-4 mt-3">
        <div className="flex flex-col sm:flex-row items-stretch gap-2 w-full sm:w-auto">
          <Link
            to="/production"
            className="bg-[#8C52FF] px-3 sm:px-4 py-2 rounded-md flex flex-row items-center justify-center hover:opacity-80 transition-opacity no-underline"
            title="من ملف المقرَّر إلى مادة كاملة: مسح ضوئي، تدقيق، ملخص، أسئلة، بطاقات، تحريري"
          >
            <Factory size={18} color="#ffffff" style={{ marginLeft: 8 }} />
            <span className="text-white text-sm sm:text-base">
              إنتاج مادة جديدة
            </span>
          </Link>
          <Link
            to="/exams/create"
            className="border border-gray-300 px-3 sm:px-4 py-2 rounded-md flex flex-row items-center justify-center hover:bg-gray-50 transition-colors no-underline"
            title="مادة فارغة: الاسم والسعر فقط، ثم تُضاف محاضراتها يدوياً"
          >
            <Plus size={18} color="#4b5563" style={{ marginLeft: 8 }} />
            <span className="text-gray-700 text-sm sm:text-base">
              مادة فارغة
            </span>
          </Link>
        </div>
      </div>
    </>
  );

  // Empty Component
  const ListEmptyComponent = () => (
    <div className="py-12 flex flex-col items-center">
      <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-3">
        <Search color="#9ca3af" size={28} />
      </div>
      <span className="text-gray-500 text-sm font-medium">
        لا توجد نتائج مطابقة للبحث
      </span>
      <span className="text-gray-400 text-xs mt-1">
        جرب البحث بكلمات مختلفة
      </span>
    </div>
  );

  const shownExams = useMemo(() => {
    const list = Array.isArray(exams) ? exams : [];
    const terms = normAr(searchTerm).split(" ").filter(Boolean);
    if (!terms.length) return list;
    return list.filter((e) => {
      const hay = normAr(`${e?.name || ""} ${e?.ID || ""}`);
      return terms.every((t) => hay.includes(t));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exams, searchTerm]);

  return (
    <div className="flex flex-col flex-1">
      {/* 🔍 التصفية */}
      <div className="bg-white rounded-xl border border-gray-200 mx-3 mb-3">
        <div className="p-4 flex flex-col gap-3">
          {/* حقل البحث */}
          <div className="flex flex-row items-center bg-gray-50 border border-gray-300 rounded-lg px-3 py-2">
            <input
              type="text"
              placeholder={
                pick.collegeId
                  ? "صفِّ مواد هذه الكلية…"
                  : "اختر كليةً أولاً"
              }
              disabled={!pick.collegeId}
              className="flex-1 text-base text-gray-800 bg-transparent border-none outline-none disabled:cursor-not-allowed"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm("")}
                title="مسح"
                className="px-2 py-1 rounded-md text-gray-400 hover:bg-gray-200"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-1 mt-8 items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#8C52FF]"></div>
          <span className="mt-4 text-gray-600 text-sm sm:text-base font-medium ml-4">
            جاري تحميل المواد...
          </span>
        </div>
      ) : (
        <div className="flex flex-col pb-5">
          <ListHeaderComponent />
          <SubjectScopePicker
            universityId={pick.universityId}
            collegeId={pick.collegeId}
            onChange={setPick}
          />
          {/* المواد لا تُعرض قبل اختيار كلية: الجلب الشامل كان ينقل
              مئات الكيلوبايتات لكل مادة قبل أن يعرف أحد ما يريد. */}
          {pick.collegeId ? (
            shownExams.length > 0 ? (
              shownExams.map((exam, index) => renderExamCard(exam, index))
            ) : (
              <ListEmptyComponent />
            )
          ) : null}
        </div>
      )}

      {/* اختيار نطاق التعديل — يُفتح من زر «تعديل» على أي بطاقة */}
      {scopeFor && (
        <EditScopeModal exam={scopeFor} onClose={() => setScopeFor(null)} />
      )}
    </div>
  );
};

export default ExamsList;
