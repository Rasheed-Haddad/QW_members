import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowRight,
  Plus,
  Layers,
  Loader2,
  AlertTriangle,
  Trash2,
  ShieldCheck,
  ShieldAlert,
  Link2,
} from "lucide-react";
import {
  getSubject,
  addLecture,
  removeLecture,
  saveLecture,
  SCOPE,
  PARTS,
  completeness,
  completedCount,
  moadalReady,
} from "./v2api";
import LectureTabs from "./LectureTabs";
import SubjectFieldsPanel from "./SubjectFieldsPanel";

// ─── مساحة عمل المادة — الهيكل الموحَّد ───────────────────────────────────────
// شريطان: المحاضرات، ومحتوى المحاضرة المختارة بتبويباتها الخمسة كاملةً.
// المحاضرة الجديدة تُنشأ عبر /v2/lecture/manage فتحمل كل التبويبات فوراً —
// لا «اربطها من شاشة المحاضرات» ولا كيان ناقص.
//
// الجلب بنطاق list: أعداد بلا محتوى. نصّ محاضرةٍ واحدة قد يبلغ 50 ألف حرف،
// وجلب الكل لعرض قائمةٍ هدرٌ فادح.

export default function SubjectWorkspace() {
  const { id } = useParams();
  const navigate = useNavigate();
  // فتح محاضرةٍ وتبويبٍ بعينهما من الرابط: ?lecture=..&tab=..
  // به تفتح شاشةُ «تعديل محاضرة» هدفها مباشرةً بدل أن يبحث عنه المستخدم.
  const [searchParams] = useSearchParams();
  const wantLecture = searchParams.get("lecture");
  const wantTab = searchParams.get("tab");

  const [subject, setSubject] = useState(null);
  const [lectures, setLectures] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState(null);

  const load = useCallback(
    async (keep = true) => {
      setLoading(true);
      setError(null);
      try {
        const d = await getSubject(id, SCOPE.LIST);
        setSubject({ _id: d._id, name: d.name, moadal_available: d.moadal_available });
        const list = d.lectures || [];
        setLectures(list);
        setSelected((prev) => {
          if (keep && prev && list.some((l) => l.lecture_id === prev)) return prev;
          if (wantLecture && list.some((l) => l.lecture_id === wantLecture)) {
            return wantLecture;
          }
          return list[0]?.lecture_id || null;
        });
      } catch (e) {
        setError(e?.response?.data?.message || "تعذّر جلب المادة");
      } finally {
        setLoading(false);
      }
    },
    [id, wantLecture],
  );

  useEffect(() => {
    load(false);
  }, [load]);

  const doAdd = async () => {
    const n = newName.trim();
    if (!n) return;
    setBusy(true);
    setError(null);
    try {
      const r = await addLecture(id, n);
      await load();
      setSelected(r.lecture_id);
      setNewName("");
      setAdding(false);
    } catch (e) {
      setError(e?.response?.data?.message || e.message);
    } finally {
      setBusy(false);
    }
  };

  const doRemove = async (lid) => {
    const l = lectures.find((x) => x.lecture_id === lid);
    const c = completedCount(l || {});
    if (
      !window.confirm(
        `حذف «${l?.name || "المحاضرة"}»؟\n\nيُحذف كل محتواها: النصّ والملخص والأسئلة والبطاقات والتحريري (${c}/5 مكتمل).\nلا رجعة في هذا.`,
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      await removeLecture(id, lid);
      if (selected === lid) setSelected(null);
      await load();
    } catch (e) {
      setError(e?.response?.data?.message || e.message);
    } finally {
      setBusy(false);
    }
  };

  const doRename = async (lid, name) => {
    const clean = String(name || "").trim();
    if (!clean) return;
    try {
      await saveLecture(id, lid, { name: clean });
      setLectures((prev) =>
        prev.map((l) => (l.lecture_id === lid ? { ...l, name: clean } : l)),
      );
    } catch (e) {
      setError(e?.response?.data?.message || e.message);
    } finally {
      setRenaming(null);
    }
  };

  if (loading && !subject) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 size={28} className="animate-spin mx-auto text-brand" />
          <p className="text-sm text-gray-500 mt-3">جارٍ جلب المادة…</p>
        </div>
      </div>
    );
  }

  const ready = lectures.filter((l) => completedCount(l) === 5).length;
  const isReady = moadalReady(lectures);

  return (
    <div dir="rtl" className="min-h-screen bg-gray-50">
      <div className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-gray-200 px-4 py-3 flex items-center gap-3 flex-wrap">
        <button
          onClick={() => navigate("/exams")}
          className="p-2 rounded-lg text-gray-500 hover:bg-gray-100"
          title="رجوع إلى المواد"
        >
          <ArrowRight size={18} />
        </button>
        <div className="min-w-0">
          <h1 className="text-base font-bold text-gray-900 truncate">
            {subject?.name || "مادة"}
          </h1>
          <p className="text-xs text-gray-400">{lectures.length} محاضرة</p>
        </div>

        {/* جاهزية «معدل» معروضة دائماً — شرط بيع الخطة */}
        {lectures.length > 0 && (
          <span
            title={
              isReady
                ? "كل المحاضرات مكتملة الأنواع الخمسة"
                : "خطة معدل تحتاج اكتمال الخمسة في كل محاضرة"
            }
            className={`text-xs font-semibold px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 border ${
              isReady
                ? "text-green-700 bg-green-50 border-green-200"
                : "text-amber-700 bg-amber-50 border-amber-200"
            }`}
          >
            {isReady ? <ShieldCheck size={14} /> : <ShieldAlert size={14} />}
            معدل: {ready}/{lectures.length}
          </span>
        )}

        <div className="mr-auto flex items-center gap-2">
          <button
            onClick={() => navigate("/exams/link-texts")}
            title="ربط نصوص المقرَّرات المرفوعة سابقاً بمحاضراتها"
            className="text-xs text-gray-600 border border-gray-200 rounded-xl px-3 py-2 flex items-center gap-1.5"
          >
            <Link2 size={14} /> ربط النصوص
          </button>
        </div>
      </div>

      {error && (
        <div className="mx-4 mt-3 bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl px-4 py-2.5 flex items-start gap-2">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      {/* بيانات المادة: لوحة تنطوي في مكانها بدل شاشة منفصلة تُفقد السياق */}
      <div className="px-4 pt-4">
        <SubjectFieldsPanel
          subjectId={id}
          onRenamed={(n) => setSubject((s0) => (s0 ? { ...s0, name: n } : s0))}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[290px_1fr] gap-4 p-4 items-start">
        {/* شريط المحاضرات */}
        <div className="bg-white rounded-2xl border border-gray-100 p-3 lg:sticky lg:top-20">
          <div className="flex items-center gap-2 mb-3">
            <Layers size={16} className="text-brand" />
            <h2 className="text-sm font-bold text-gray-800">المحاضرات</h2>
            <button
              onClick={() => setAdding((v) => !v)}
              className="mr-auto p-1.5 rounded-lg text-brand bg-brand/10 hover:bg-brand/20"
              title="أضف محاضرة"
            >
              <Plus size={15} />
            </button>
          </div>

          {adding && (
            <div className="mb-3 p-2.5 rounded-xl bg-brand/5 border border-brand/20">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && doAdd()}
                dir="rtl"
                autoFocus
                placeholder="اسم المحاضرة الجديدة"
                className="w-full px-2.5 py-2 rounded-lg border border-gray-200 text-sm font-arabic outline-none focus:border-brand mb-2"
              />
              <div className="flex gap-2">
                <button
                  onClick={doAdd}
                  disabled={!newName.trim() || busy}
                  className="flex-1 bg-brand text-white text-xs font-bold rounded-lg py-2 disabled:opacity-40"
                >
                  {busy ? "…" : "أضف"}
                </button>
                <button
                  onClick={() => {
                    setAdding(false);
                    setNewName("");
                  }}
                  className="px-3 text-xs text-gray-500 border border-gray-200 rounded-lg"
                >
                  إلغاء
                </button>
              </div>
              <p className="text-[11px] text-gray-500 mt-2">
                تُنشأ بتبويباتها الخمسة جاهزة: مسح ضوئي وتفريغ صوتي وتدقيق
                وتوليد.
              </p>
            </div>
          )}

          <div className="flex flex-col gap-1.5 max-h-[62vh] overflow-y-auto">
            {lectures.length === 0 && (
              <p className="text-xs text-gray-400 text-center py-6">
                لا محاضرات — أضف واحدة بالزرّ أعلاه
              </p>
            )}
            {lectures.map((l) => {
              const active = selected === l.lecture_id;
              const c = completeness(l);
              const n = completedCount(l);
              return (
                <div
                  key={l.lecture_id}
                  onClick={() => setSelected(l.lecture_id)}
                  className={`rounded-xl border p-2.5 cursor-pointer transition-colors ${
                    active ? "border-brand bg-brand/5" : "border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    {renaming === l.lecture_id ? (
                      <input
                        defaultValue={l.name}
                        autoFocus
                        onClick={(e) => e.stopPropagation()}
                        onBlur={(e) => doRename(l.lecture_id, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") e.currentTarget.blur();
                          if (e.key === "Escape") setRenaming(null);
                        }}
                        dir="rtl"
                        className="flex-1 min-w-0 px-1.5 py-0.5 rounded border border-brand text-sm font-arabic outline-none"
                      />
                    ) : (
                      <span
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          setRenaming(l.lecture_id);
                        }}
                        title="نقرتان لإعادة التسمية"
                        className={`flex-1 min-w-0 truncate text-sm font-arabic ${
                          active ? "font-bold text-gray-900" : "text-gray-700"
                        }`}
                      >
                        {l.name || "بلا اسم"}
                      </span>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        doRemove(l.lecture_id);
                      }}
                      className="p-1 rounded text-red-400 hover:bg-red-50 shrink-0"
                      title="حذف"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>

                  <div className="flex items-center gap-1 mt-1.5">
                    {PARTS.map((p) => (
                      <span
                        key={p.key}
                        title={`${p.label}: ${c[p.key] ? "موجود" : "ناقص"}`}
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ backgroundColor: c[p.key] ? p.color : "#e5e7eb" }}
                      />
                    ))}
                    <span
                      className={`text-[10px] mr-1 ${
                        n === 5 ? "text-green-600 font-bold" : "text-gray-400"
                      }`}
                    >
                      {n}/5
                    </span>
                    {l.questions_count > 0 && (
                      <span className="text-[10px] text-gray-400 mr-auto">
                        {l.questions_count} سؤال
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* محتوى المحاضرة */}
        <div className="min-w-0">
          {selected ? (
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              <LectureTabs
                key={selected}
                subjectId={id}
                subjectName={subject?.name}
                lectureId={selected}
                initialTab={selected === wantLecture ? wantTab : null}
                onSaved={() => load()}
              />
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
              <Layers size={26} className="text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-500">
                اختر محاضرةً من القائمة، أو أضف واحدة
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
