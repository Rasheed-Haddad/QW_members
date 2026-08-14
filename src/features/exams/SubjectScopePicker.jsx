import { useEffect, useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Building2, GraduationCap, RotateCcw } from "lucide-react";
import { Universities, Colleges } from "../../components/Collegues";
import { fetch_college_tree, fetch_exam_names } from "../../store/examsSlice";

// ─── منتقي الجامعة والكلية ────────────────────────────────────────────────────
// لا كيان «جامعة/كلية» في القاعدة — الأسماء في ملف الواجهة، والقاعدة تعرف
// college_id فقط. لذلك نجلب من السيرفر «الكليات التي بها مواد + أعدادها»
// ونطابقها بالأسماء هنا. النتيجة: لا نعرض جامعةً فارغة ولا كليةً بلا مواد.
//
// انتبه: college_id رقم في وثيقة المادة ونصّ في ملف الكليات — كل مقارنة
// تمرّ عبر String() وإلا بدت كل الكليات فارغة.

const SubjectScopePicker = ({ universityId, collegeId, onChange }) => {
  const dispatch = useDispatch();
  const { college_tree, tree_loading, names_loading } = useSelector(
    (s) => s.exams,
  );

  // الشجرة تُجلب مرة واحدة عند أول دخول (البيانات فارغة)
  useEffect(() => {
    if (college_tree.length === 0 && !tree_loading) {
      dispatch(fetch_college_tree());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // عدد المواد لكل كلية، بمفتاح نصّي موحّد
  const countByCollege = useMemo(() => {
    const m = {};
    (college_tree || []).forEach((c) => {
      m[String(c.college_id)] = c.count;
    });
    return m;
  }, [college_tree]);

  // الجامعات التي لإحدى كلياتها مواد فعلاً
  const universities = useMemo(
    () =>
      Universities.map((u) => {
        const cols = Colleges[u.id] || [];
        const total = cols.reduce(
          (s, c) => s + (countByCollege[String(c.id)] || 0),
          0,
        );
        return { ...u, subjects: total, colleges: cols.length };
      }).filter((u) => u.subjects > 0),
    [countByCollege],
  );

  const colleges = useMemo(() => {
    if (!universityId) return [];
    return (Colleges[universityId] || [])
      .map((c) => ({ ...c, subjects: countByCollege[String(c.id)] || 0 }))
      .filter((c) => c.subjects > 0);
  }, [universityId, countByCollege]);

  const pickUniversity = (id) => onChange({ universityId: id, collegeId: null });

  const pickCollege = (id) => {
    onChange({ universityId, collegeId: id });
    dispatch(fetch_exam_names({ college_id: id }));
  };

  const reset = () => onChange({ universityId: null, collegeId: null });

  if (tree_loading && college_tree.length === 0) {
    return (
      <div className="mx-3 mb-4 mt-3 bg-white rounded-xl border border-gray-200 p-8 text-center">
        <div className="inline-block w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-xs text-gray-500 mt-2">جارٍ قراءة الكليات…</p>
      </div>
    );
  }

  const selectedUni = Universities.find((u) => u.id === universityId);
  const selectedCol = (Colleges[universityId] || []).find(
    (c) => c.id === collegeId,
  );

  return (
    <div className="mx-3 mb-4 mt-3">
      {/* مسار التنقّل — يقول أين أنت ويسمح بالرجوع بنقرة */}
      {(selectedUni || selectedCol) && (
        <div className="flex items-center gap-2 mb-3 text-sm">
          <button
            onClick={reset}
            className="text-purple-600 hover:underline font-medium"
          >
            كل الجامعات
          </button>
          {selectedUni && (
            <>
              <span className="text-gray-300">/</span>
              <button
                onClick={() => pickUniversity(universityId)}
                className={
                  selectedCol
                    ? "text-purple-600 hover:underline font-medium"
                    : "text-gray-700 font-semibold"
                }
              >
                {selectedUni.name.trim()}
              </button>
            </>
          )}
          {selectedCol && (
            <>
              <span className="text-gray-300">/</span>
              <span className="text-gray-700 font-semibold">
                {selectedCol.name}
              </span>
              {names_loading && (
                <span className="inline-block w-3.5 h-3.5 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mr-1" />
              )}
            </>
          )}
          <button
            onClick={reset}
            title="إعادة"
            className="mr-auto p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
          >
            <RotateCcw size={15} />
          </button>
        </div>
      )}

      {/* الدرجة الأولى: الجامعات */}
      {!universityId && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Building2 size={17} color="#8C52FF" />
            <h3 className="text-sm font-bold text-gray-800">اختر الجامعة</h3>
            <span className="text-xs text-gray-400 mr-auto">
              {universities.length} جامعة بها مواد
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {universities.map((u) => (
              <button
                key={u.id}
                onClick={() => pickUniversity(u.id)}
                className="flex items-center gap-2.5 p-3 rounded-lg border border-gray-200 hover:border-purple-300 hover:bg-purple-50/40 transition-colors text-right"
              >
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-semibold text-gray-800 truncate">
                    {u.name.trim()}
                  </span>
                  <span className="block text-xs text-gray-500">
                    {u.location}
                  </span>
                </span>
                <span className="text-xs font-bold text-purple-600 bg-purple-50 px-2 py-1 rounded-md shrink-0">
                  {u.subjects}
                </span>
              </button>
            ))}
          </div>
          {universities.length === 0 && (
            <p className="text-sm text-gray-500 text-center py-6">
              لا مواد في أي جامعة بعد
            </p>
          )}
        </div>
      )}

      {/* الدرجة الثانية: كليات الجامعة المختارة */}
      {universityId && !collegeId && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-3">
            <GraduationCap size={17} color="#8C52FF" />
            <h3 className="text-sm font-bold text-gray-800">اختر الكلية</h3>
            <span className="text-xs text-gray-400 mr-auto">
              {colleges.length} كلية بها مواد
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {colleges.map((c) => (
              <button
                key={c.id}
                onClick={() => pickCollege(c.id)}
                className="flex items-center gap-2.5 p-3 rounded-lg border border-gray-200 hover:border-purple-300 hover:bg-purple-50/40 transition-colors text-right"
              >
                <span className="flex-1 min-w-0 text-sm font-semibold text-gray-800 truncate">
                  {c.name}
                </span>
                <span className="text-xs font-bold text-purple-600 bg-purple-50 px-2 py-1 rounded-md shrink-0">
                  {c.subjects}
                </span>
              </button>
            ))}
          </div>
          {colleges.length === 0 && (
            <p className="text-sm text-gray-500 text-center py-6">
              لا مواد في كليات هذه الجامعة
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default SubjectScopePicker;
