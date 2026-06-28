import { useState, useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";
import { Link } from "react-router-dom";
import { Search, Edit, AlertCircle, XCircle, Info } from "lucide-react";
import { fetch_exams, clearError } from "../../store/examsSlice.js";

const ExamsList = () => {
  const dispatch = useDispatch();
  const { exams, loading, error, status } = useSelector((state) => state.exams);
  const employer = useSelector((state) => state.auth.employer);
  const [searchTerm, setSearchTerm] = useState("");
  const [showStatus, setShowStatus] = useState(true);

  // جلب مواد العضو عند فتح الصفحة
  useEffect(() => {
    if (employer?._id) {
      dispatch(fetch_exams({ searchTerm: "", employer_id: employer._id }));
    }
  }, [employer, dispatch]);

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

  const handleSearch = () => {
    dispatch(fetch_exams({ searchTerm, employer_id: employer?._id }));
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
        className="bg-white border border-gray-200 rounded-lg p-4 sm:p-5 mx-2 sm:mx-3 mb-3 sm:mb-4"
      >
        {/* رأس البطاقة */}
        <div className="flex flex-row items-start justify-between mb-4 pb-3 border-b border-gray-100">
          <div className="flex-1">
            <div className="flex flex-row items-center justify-center gap-2 mb-1">
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
              {Array.isArray(exam.questions) ? exam.questions.length : ""}
            </span>
          </div>
        </div>

        {/* الإجراءات */}
        <div className="flex flex-row items-center gap-2">
          <Link
            to={`/exams/edit/${exam._id}`}
            className="flex-1 flex flex-row items-center justify-center gap-1.5 py-2.5 px-3 rounded-md bg-yellow-50 hover:bg-yellow-100 transition-colors no-underline"
          >
            <Edit size={16} color="#ca8a04" />
            <span className="text-sm font-medium text-yellow-600">تعديل</span>
          </Link>
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

  return (
    <div className="flex flex-col flex-1 w-full max-w-3xl mx-auto">
      {/* 🔍 البحث */}
      <div className="bg-white rounded-xl border border-gray-200 mx-2 sm:mx-3 mb-3 mt-2">
        <div className="p-4 flex flex-col gap-3">
          {/* حقل البحث */}
          <div className="flex flex-row items-center bg-gray-50 border border-gray-300 rounded-lg px-3 py-2">
            <input
              type="text"
              placeholder="ابحث عن مادة..."
              className="flex-1 text-base text-gray-800 bg-transparent border-none outline-none"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(key) => {
                if (key.key == "Enter") {
                  handleSearch();
                }
              }}
            />
            <button
              onClick={handleSearch}
              disabled={loading}
              className="bg-[#8C52FF] px-4 py-2 rounded-md ml-2 hover:opacity-80 transition-opacity disabled:opacity-50"
            >
              <span className="text-white text-sm font-medium">بحث</span>
            </button>
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
          {Array.isArray(exams) && exams.length > 0 ? (
            exams.map((exam, index) => renderExamCard(exam, index))
          ) : (
            <ListEmptyComponent />
          )}
        </div>
      )}
    </div>
  );
};

export default ExamsList;
