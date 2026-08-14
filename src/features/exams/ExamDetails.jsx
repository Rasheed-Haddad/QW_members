import { useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { getSubject, SCOPE, completedCount } from "./v2api";
import { useParams, Link } from "react-router-dom";
import {
  ArrowRightIcon,
  DollarSign,
  BookOpen,
  Users,
  FileText,
  Award,
  BadgeCheck,
} from "lucide-react";
import { Colleges, Universities } from "../../components/Collegues";

const ExamDetails = () => {
  const { id } = useParams();
  const { exams } = useSelector((state) => state.exams);
  const listed = exams.find((e) => e._id == id);

  // الأسئلة صارت داخل كل محاضرة بعد توحيد الهيكل، فلا تُقرأ من قائمة
  // المواد. نجلب المادة بنطاق moadal: ملخص وأسئلة وبطاقات بلا نصوص.
  const [full, setFull] = useState(null);
  useEffect(() => {
    if (!id) return;
    getSubject(id, SCOPE.MOADAL)
      .then(setFull)
      .catch(() => setFull(null));
  }, [id]);

  // أسئلة المادة كلها مسطَّحة مع اسم محاضرتها — للعرض وحده
  const allQuestions = useMemo(
    () =>
      (full?.lectures || []).flatMap((l) =>
        (l.questions || []).map((q) => ({ ...q, lecture: l.name })),
      ),
    [full],
  );

  const exam = full ? { ...listed, ...full, questions: allQuestions } : listed;

  if (!exam) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <p className="text-xl text-gray-600 mb-4">لم يتم العثور على المادة</p>
        <Link
          to="/exams"
          className="text-brand flex items-center hover:underline"
        >
          <ArrowRightIcon size={16} className="ml-1" />
          العودة إلى قائمة المواد
        </Link>
      </div>
    );
  }

  // Get college and university info
  const collegeLookup = {};
  Object.values(Colleges).forEach((collegesArr) => {
    collegesArr.forEach((college) => {
      const university = Universities.find(
        (u) => u.id === college.universityId,
      );
      if (university) {
        collegeLookup[college.id] = {
          collegeName: college.name,
          universityName: university.name,
          universityLocation: university.location,
        };
      }
    });
  });

  const collegeInfo = collegeLookup[exam.college_id] || null;

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 sm:gap-4">
          <Link
            to="/exams"
            className="p-2 rounded-xl bg-brand/10 text-brand hover:bg-brand/20 transition"
          >
            <ArrowRightIcon size={20} />
          </Link>
          <h1 className="text-lg sm:text-2xl font-bold text-brand">
            تفاصيل المادة
          </h1>
        </div>
        {exam.moadal_available && (
          <span className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-green-50 text-green-700 text-xs font-bold">
            <BadgeCheck size={14} />
            مؤهلة لخطة معدل
          </span>
        )}
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        {/* Exam Info Card */}
        <div className="bg-white rounded-xl border border-gray-100 p-6 space-y-6">
          {/* Title Section */}
          <div className="text-center pb-4 border-b border-gray-100">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-800 mb-2">
              {exam.name}
            </h2>
            <p className="text-sm text-gray-500 ">رمز المادة: {exam.ID}</p>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 gap-3">
            {/* Questions Count */}
            <div className="bg-brand/5 rounded-lg p-4 col-span-2">
              <div className="flex items-center gap-2 mb-2">
                <BookOpen size={16} className="text-brand" />
                <p className="text-xs text-gray-600">عدد الأسئلة</p>
              </div>
              <div className="text-2xl font-bold text-brand">
                {(Array.isArray(exam.questions) ? exam.questions : []).length}
              </div>
            </div>

            {/* سعر خطة معدل — حلّ محلّ «الوقت» بعد إلغاء مؤقّت الامتحان */}
            <div className="bg-blue-50 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <BadgeCheck size={16} className="text-blue-600" />
                <p className="text-xs text-gray-600">سعر معدل</p>
              </div>
              <div className="text-lg font-bold text-blue-600">
                {exam.price_moadal || 0}
                <span className="text-xs font-normal text-gray-600 mr-1">
                  ل.س
                </span>
              </div>
            </div>

            {/* Price */}
            <div className="bg-green-50 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign size={16} className="text-green-600" />
                <p className="text-xs text-gray-600">السعر</p>
              </div>
              <div className="text-lg font-bold text-green-600">
                {exam.price}
                <span className="text-xs font-normal text-gray-600 mr-1">
                  ل.س
                </span>
              </div>
            </div>

          </div>

          {/* Description */}
          {exam.info && (
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <FileText size={16} className="text-gray-600" />
                <p className="text-xs text-gray-600">وصف المادة</p>
              </div>
              <p className="text-sm text-gray-700 leading-relaxed">
                {exam.info}
              </p>
            </div>
          )}

          {/* University & College Info */}
          <div className="space-y-3 pt-4 border-t border-gray-100">
            <div>
              <p className="text-xs text-gray-500 mb-1">الجامعة</p>
              <p className="text-sm font-medium text-gray-800">
                {collegeInfo?.universityName || "غير محدد"}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">الكلية</p>
              <p className="text-sm font-medium text-gray-800">
                {collegeInfo?.collegeName || "غير محدد"}
              </p>
            </div>
            {collegeInfo?.universityLocation && (
              <div>
                <p className="text-xs text-gray-500 mb-1">الموقع</p>
                <p className="text-sm font-medium text-gray-800">
                  {collegeInfo.universityLocation}
                </p>
              </div>
            )}
          </div>

          {/* Available Students */}
          {exam.available_to && (Array.isArray(exam.available_to) ? exam.available_to : []).length > 0 && (
            <div className="pt-4 border-t border-gray-100">
              <div className="flex items-center gap-2 mb-3">
                <Users size={16} className="text-brand" />
                <p className="text-sm font-semibold text-gray-700">
                  متاح لـ {(Array.isArray(exam.available_to) ? exam.available_to : []).length} طالب
                </p>
              </div>
              <div className="max-h-48 overflow-y-auto space-y-2">
                {(Array.isArray(exam.available_to) ? exam.available_to : []).map((student, index) => (
                  <div
                    key={index}
                    className="bg-brand/5 text-brand rounded-lg px-3 py-2 text-sm font-mono"
                  >
                    {student}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Admin ID */}
          {exam.admin_id && (
            <div className="pt-4 border-t border-gray-100">
              <p className="text-xs text-gray-500 mb-1">معرف المشرف</p>
              <p className="text-xs font-mono text-gray-600 break-all">
                {exam.admin_id}
              </p>
            </div>
          )}
        </div>

        {/* Questions Section */}
        <div className="bg-white rounded-xl border border-gray-100 p-4 sm:p-6 lg:col-span-2">
          <div className="flex items-center gap-2 mb-6">
            <Award size={20} className="text-brand" />
            <h3 className="text-lg sm:text-xl font-bold text-brand">
              أسئلة المادة ({(Array.isArray(exam.questions) ? exam.questions : []).length})
            </h3>
          </div>

          {(Array.isArray(exam.questions) ? exam.questions : []).length > 0 ? (
            <div className="space-y-6">
              {(Array.isArray(exam.questions) ? exam.questions : []).map((question, index) => (
                <div
                  key={index}
                  className="rounded-lg border border-gray-100 p-4 sm:p-5 bg-gray-50 hover:border-brand/30 transition-colors"
                >
                  {/* Question Header */}
                  <div className="flex items-start gap-3 mb-4">
                    <span className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-brand text-white text-sm font-bold">
                      {index + 1}
                    </span>
                    <div className="flex-1">
                      <p className="text-sm sm:text-base text-gray-800 leading-relaxed">
                        {question.question}
                      </p>
                      {question.lecture && (
                        <p className="text-xs text-gray-500 mt-2">
                          المحاضرة: {question.lecture}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Options */}
                  <div className="grid grid-cols-1 gap-2 mr-11">
                    {(Array.isArray(question.options) ? question.options : []).map((option, optIndex) => {
                      const isCorrect = question.answer == optIndex + 1;
                      return (
                        <div
                          key={optIndex}
                          className={`p-3 rounded-lg border transition-colors ${
                            isCorrect
                              ? "border-green-500 bg-green-50"
                              : "border-gray-200 bg-white hover:border-brand/30"
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <span
                              className={`w-6 h-6 flex-shrink-0 flex items-center justify-center rounded-full text-xs font-semibold ${
                                isCorrect
                                  ? "bg-green-500 text-white"
                                  : "bg-gray-200 text-gray-700"
                              }`}
                            >
                              {optIndex + 1}
                            </span>
                            <span
                              className={`text-sm ${
                                isCorrect
                                  ? "text-green-700 font-semibold"
                                  : "text-gray-700"
                              }`}
                            >
                              {option}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-gray-500 text-sm sm:text-base">
              لا توجد أسئلة مضافة لهذا المادة
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ExamDetails;
