import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Link2,
  Search,
  X,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Eye,
} from "lucide-react";
import {
  listUnlinkedTexts,
  getTextFull,
  linkText,
  listSubjects,
  getSubject,
  SCOPE,
} from "./v2api";
import SubjectScopePicker from "./SubjectScopePicker";
import { renderMarkdown } from "../production/lib/miniMarkdown";

// ─── ربط نصوص المقرَّرات بمحاضراتها ───────────────────────────────────────────
// ملفات الكولكشن مسمّاة بأرقام مجلدات اللابتوب (1.md، 2.md…) ولا تطابق أسماء
// المحاضرات. فالمطابقة الآلية تخمينٌ يربط نصّاً بمحاضرة خاطئة صامتاً.
//
// هنا: تقرأ النصّ بعينك، وتختار مادته ومحاضرته، فيُنقل إليها ويُحذف من
// الكولكشن. عمليةٌ لمرّة واحدة تنتهي بإفراغه.

export default function LinkTexts() {
  const navigate = useNavigate();

  const [texts, setTexts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState(null); // النصّ المفتوح
  const [full, setFull] = useState(null);
  const [loadingFull, setLoadingFull] = useState(false);

  const [scope, setScope] = useState({ universityId: null, collegeId: null });
  const [subjects, setSubjects] = useState([]);
  const [subjectId, setSubjectId] = useState("");
  const [lectures, setLectures] = useState([]);
  const [lectureId, setLectureId] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await listUnlinkedTexts();
      setTexts(r.texts || []);
    } catch (e) {
      setError(e?.response?.data?.message || "تعذّر جلب النصوص");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // مواد الكلية المختارة
  useEffect(() => {
    if (!scope.collegeId) {
      setSubjects([]);
      return;
    }
    listSubjects(scope.collegeId)
      .then((r) => setSubjects(r.exams || []))
      .catch(() => setSubjects([]));
  }, [scope.collegeId]);

  // محاضرات المادة المختارة
  useEffect(() => {
    if (!subjectId) {
      setLectures([]);
      setLectureId("");
      return;
    }
    getSubject(subjectId, SCOPE.LIST)
      .then((d) => setLectures(d.lectures || []))
      .catch(() => setLectures([]));
  }, [subjectId]);

  const open = async (t) => {
    setPicked(t);
    setFull(null);
    setDone(null);
    setError(null);
    setLoadingFull(true);
    try {
      const r = await getTextFull(t.rel_path);
      setFull(r);
    } catch (e) {
      setError(e?.response?.data?.message || "تعذّر فتح النصّ");
    } finally {
      setLoadingFull(false);
    }
  };

  const doLink = async () => {
    if (!picked || !subjectId || !lectureId) return;
    setBusy(true);
    setError(null);
    try {
      const r = await linkText(picked.rel_path, subjectId, lectureId, false);
      setDone(r);
      setPicked(null);
      setFull(null);
      // نحدّث القائمتين: النصّ اختفى، والمحاضرة صار لها نصّ
      setTexts((prev) => prev.filter((t) => t.rel_path !== picked.rel_path));
      getSubject(subjectId, SCOPE.LIST)
        .then((d) => setLectures(d.lectures || []))
        .catch(() => {
          // فشل تحديث القائمة لا يُبطل الربط — تظهر بعد إعادة الفتح
        });
      setTimeout(() => setDone(null), 5000);
    } catch (e) {
      setError(e?.response?.data?.message || e.message);
    } finally {
      setBusy(false);
    }
  };

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return texts;
    return texts.filter((t) =>
      `${t.subject} ${t.file} ${t.section}`.toLowerCase().includes(q),
    );
  }, [texts, search]);

  const targetLecture = lectures.find((l) => l.lecture_id === lectureId);

  return (
    <div dir="rtl" className="min-h-screen bg-gray-50">
      <div className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-gray-200 px-4 py-3 flex items-center gap-3 flex-wrap">
        <button
          onClick={() => navigate("/exams")}
          className="p-2 rounded-lg text-gray-500 hover:bg-gray-100"
        >
          <ArrowRight size={18} />
        </button>
        <div className="min-w-0">
          <h1 className="text-base font-bold text-gray-900">ربط نصوص المقرَّرات</h1>
          <p className="text-xs text-gray-400">
            أسماء الملفات أرقام مجلدات — الربط بعينك لا بالتخمين
          </p>
        </div>
        <span className="mr-auto text-sm font-semibold text-brand bg-brand/10 px-3 py-1.5 rounded-lg">
          {texts.length} نصّاً بانتظار الربط
        </span>
      </div>

      {done && (
        <div className="mx-4 mt-3 bg-green-50 border border-green-200 text-green-800 text-sm rounded-xl px-4 py-2.5 flex items-center gap-2">
          <CheckCircle2 size={16} />
          {done.replaced ? "استُبدل النصّ" : "رُبط النصّ"} · {done.words} كلمة ·
          بقي {done.remaining} نصّاً
        </div>
      )}
      {error && (
        <div className="mx-4 mt-3 bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl px-4 py-2.5 flex items-start gap-2">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4 p-4 items-start">
        {/* قائمة النصوص */}
        <div className="bg-white rounded-2xl border border-gray-100 p-3 lg:sticky lg:top-20">
          <div className="relative mb-3">
            <Search
              size={15}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              dir="rtl"
              placeholder="صفِّ بالمادة أو اسم الملف…"
              className="w-full pr-9 pl-8 py-2 rounded-xl border border-gray-200 text-sm outline-none focus:border-brand"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute left-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-gray-400"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {loading ? (
            <div className="py-10 text-center">
              <Loader2 size={22} className="animate-spin mx-auto text-brand" />
            </div>
          ) : (
            <div className="flex flex-col gap-1.5 max-h-[65vh] overflow-y-auto">
              {shown.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-8">
                  {texts.length === 0
                    ? "تمّ ربط كل النصوص 🎉"
                    : "لا نتائج للبحث"}
                </p>
              )}
              {shown.map((t) => (
                <button
                  key={t.rel_path}
                  onClick={() => open(t)}
                  className={`text-right rounded-xl border p-2.5 transition-colors ${
                    picked?.rel_path === t.rel_path
                      ? "border-brand bg-brand/5"
                      : "border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <FileText size={13} className="text-gray-400 shrink-0" />
                    <span className="text-sm font-semibold text-gray-800 truncate">
                      {t.file}
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-500 mt-0.5 truncate">
                    {t.subject} · {t.section}
                  </p>
                  <p className="text-[11px] text-gray-400">
                    {(t.chars || 0).toLocaleString("ar-EG")} حرف
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* النصّ + وجهته */}
        <div className="min-w-0 flex flex-col gap-4">
          {!picked ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
              <Eye size={26} className="text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-500">
                اختر نصّاً من القائمة لتقرأه وتحدّد محاضرته
              </p>
            </div>
          ) : (
            <>
              {/* الوجهة */}
              <div className="bg-white rounded-2xl border border-gray-100 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Link2 size={16} className="text-brand" />
                  <h3 className="text-sm font-bold text-gray-800">
                    إلى أي محاضرة ينتمي «{picked.file}»؟
                  </h3>
                </div>

                <SubjectScopePicker
                  universityId={scope.universityId}
                  collegeId={scope.collegeId}
                  onChange={(v) => {
                    setScope(v);
                    setSubjectId("");
                    setLectureId("");
                  }}
                />

                {scope.collegeId && (
                  <div className="flex items-center gap-2 flex-wrap px-3">
                    <select
                      value={subjectId}
                      onChange={(e) => {
                        setSubjectId(e.target.value);
                        setLectureId("");
                      }}
                      className="px-3 py-2 rounded-xl border border-gray-200 text-sm bg-white text-gray-800 min-w-[190px]"
                    >
                      <option value="" className="bg-white text-gray-800">
                        اختر المادة…
                      </option>
                      {subjects.map((s) => (
                        <option key={s._id} value={s._id} className="bg-white text-gray-800">
                          {s.name}
                        </option>
                      ))}
                    </select>

                    <select
                      value={lectureId}
                      onChange={(e) => setLectureId(e.target.value)}
                      disabled={!subjectId}
                      className="px-3 py-2 rounded-xl border border-gray-200 text-sm bg-white text-gray-800 min-w-[190px] disabled:bg-gray-50"
                    >
                      <option value="" className="bg-white text-gray-800">
                        اختر المحاضرة…
                      </option>
                      {lectures.map((l) => (
                        <option
                          key={l.lecture_id}
                          value={l.lecture_id}
                          className="bg-white text-gray-800"
                        >
                          {l.name} {l.has_curriculum ? "(لها نصّ)" : ""}
                        </option>
                      ))}
                    </select>

                    <button
                      onClick={doLink}
                      disabled={busy || !subjectId || !lectureId}
                      className="mr-auto bg-brand text-white text-sm font-bold rounded-xl px-5 py-2.5 disabled:opacity-40 flex items-center gap-2"
                    >
                      {busy ? (
                        <Loader2 size={15} className="animate-spin" />
                      ) : (
                        <Link2 size={15} />
                      )}
                      اربط واحذف من الكولكشن
                    </button>
                  </div>
                )}

                {targetLecture?.has_curriculum && (
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mt-3 mx-3">
                    هذه المحاضرة لها نصّ سلفاً — الربط سيستبدله.
                  </p>
                )}
              </div>

              {/* النصّ */}
              <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2">
                  <span className="text-sm font-semibold text-gray-800">
                    {picked.file}
                  </span>
                  <span className="text-xs text-gray-400">
                    {picked.subject} · {(picked.chars || 0).toLocaleString("ar-EG")} حرف
                  </span>
                </div>
                {loadingFull ? (
                  <div className="py-16 text-center">
                    <Loader2 size={24} className="animate-spin mx-auto text-brand" />
                  </div>
                ) : (
                  <div
                    className="p-5 mdbody mdbody-lg overflow-y-auto"
                    style={{ maxHeight: "60vh" }}
                    dangerouslySetInnerHTML={{
                      __html: renderMarkdown(full?.text || ""),
                    }}
                  />
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
