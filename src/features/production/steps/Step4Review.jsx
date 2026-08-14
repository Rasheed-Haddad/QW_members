import { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import {
  Eye,
  Pencil,
  X,
  ImageIcon,
  Trash2,
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  ArrowLeft,
  Link2,
  Columns2,
  FileText,
  Plus,
} from "lucide-react";
import { usePipeline } from "../pipelineStore";
import CurriculumWorkspace from "../components/CurriculumWorkspace";
import { renderMarkdown, listImages, removeImage, stats } from "../lib/miniMarkdown";
import SubjectScopePicker from "../../exams/SubjectScopePicker";
import { sanitizeName } from "../lib/ranges";
import { API_BASE_URL, PASSWORD } from "../../../config";

// ─── الخطوة ٤: المراجعة النهائية والرفع ───────────────────────────────────────
// آخر نقطةٍ يمكن فيها إصلاح شيء قبل أن يراه طالب. لذلك تُعرض المحاضرة كما
// ستُقرأ — بصورها في مواضعها — بجانب نصّها الخام قابلاً للتحرير، فالمقارنة
// مع المقرَّر الورقي تحتاج الشكل والنصّ معاً.
//
// الرفع يكتب باسم المحاضرة نفسه. واسمٌ لا يطابق أي محاضرةٍ في المادة يعني
// نصّاً معلّقاً لا يصل إلى طالب — فنحذّر قبل الرفع لا بعده.

/** تطبيع عربي للمطابقة بين اسم الملف وأسماء المحاضرات في القاعدة */
const norm = (s) =>
  String(s || "")
    .replace(/[ً-ْٰـ]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

export default function Step4Review() {
  const { state, dispatch, getLectureBytes } = usePipeline();
  const { lectures, markdown } = state;

  const ready = useMemo(
    () => lectures.filter((l) => markdown[l.id]),
    [lectures, markdown],
  );

  const [open, setOpen] = useState(null);
  const [pick, setPick] = useState({ universityId: null, collegeId: null });
  const [subjectId, setSubjectId] = useState("");
  const [section, setSection] = useState("طب أسنان");
  // ── شكل الهدف موحَّد: {subjectId, name, section, lectures[]} ──
  // كان يُسنَد إليه ردّ الخادم مباشرةً (وفيه `_id` لا `subjectId`)، بينما
  // يقرأ الرفع `target.subjectId` — فيُرسَل `_id: undefined` فيردّ الخادم
  // «رمز المادة ناقص» ولا يُكتب شيء. صمتُ الخطأ كان يوهم بأن الحفظ تمّ.
  const [target, setTarget] = useState(null);

  /** يحوّل ردّ `/v2/subject` إلى شكل الهدف — نقطة التحويل الوحيدة */
  const toTarget = (data, sec) =>
    data?._id
      ? {
          subjectId: String(data._id),
          name: data.name,
          section: sec,
          lectures: data.lectures || [],
        }
      : null;
  const [loadingTarget, setLoadingTarget] = useState(false);
  const [uploads, setUploads] = useState({}); // id → {status, error}
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [createErr, setCreateErr] = useState(null);
  const [busy, setBusy] = useState(false);

  // أسماء المحاضرات في المادة الهدف — أساس التحذير
  useEffect(() => {
    if (!subjectId) {
      setTarget(null);
      return;
    }
    setLoadingTarget(true);
    axios
      .post(`${API_BASE_URL}/v2/subject`, {
        _id: subjectId,
        scope: "list",
      })
      .then((r) => {
        const t = toTarget(r.data, section);
        setTarget(t);
        // نسجّله في حالة الخط: خطوات الرفع بعدها تحتاج المعرّف والمحاضرات
        if (t) dispatch({ type: "target", target: t });
      })
      .catch(() => setTarget(null))
      .finally(() => setLoadingTarget(false));
  }, [subjectId, section, dispatch]);

  /** إنشاء مادة جديدة — تبويب «إنتاج مادة» غالباً لمادةٍ لم تُنشأ بعد،
   *  فطلبُ اختيار مادةٍ قائمة كان يسدّ الطريق الطبيعي.
   *  المسار يشترط سؤالاً واحداً على الأقل، فنضع سؤالاً مبدئياً تستبدله
   *  في خطوة الأسئلة — ونقوله صراحةً بدل أن يفاجئه. */
  const createSubject = async () => {
    const name = newName.trim();
    if (!name || !pick.collegeId) return;
    setCreating(true);
    setCreateErr(null);
    try {
      const r = await axios.post(`${API_BASE_URL}/addexam`, {
        name,
        college_id: Number(pick.collegeId),
        info: "",
        time: 60,
        visible: false,
        price: 0,
        price_moadal: 0,
        questions: [
          {
            question: "سؤال مبدئي — استبدله في خطوة الأسئلة",
            options: ["أ", "ب", "ج", "د"],
            answer: "1",
            lecture: "",
          },
        ],
      });
      const id = r.data?.exam?._id || r.data?._id;
      if (!id) throw new Error("لم يُعِد الخادم معرّف المادة");
      setSubjectId(id);
      setNewName("");
    } catch (e) {
      setCreateErr(
        e?.response?.data?.error || e?.response?.data?.message || e.message,
      );
    } finally {
      setCreating(false);
    }
  };

  /** هل للمحاضرة كيانٌ في المادة؟ وما الذي أُنجز فيه؟
   *  بعد توحيد الهيكل لم يعد ثمة ثلاثة أسماء تُطابَق: المحتوى كلّه داخل
   *  الكيان، فالسؤال الوحيد هو «أهذه المحاضرة موجودة، وبمَ امتلأت؟». */
  const matchOf = (name) => {
    if (!target) return null;
    const n = norm(name);
    const hit = (Array.isArray(target.lectures) ? target.lectures : []).find(
      (l) => norm(l.name || l.title) === n,
    );
    // نطاق list يعيد أعداداً لا محتوى — أرخص وأكفى للتحذير
    return {
      inLectures: Boolean(hit),
      inSummary: (hit?.summary_sections ?? 0) > 0,
      inQuestions: (hit?.questions_count ?? 0) > 0,
    };
  };

  const setText = (id, text) =>
    dispatch({ type: "markdown", markdown: { [id]: text } });

  // ─── الرفع ──────────────────────────────────────────────────────────────────
  // النصّ يُكتب داخل كائن المحاضرة مباشرةً (curriculum). سابقاً كان يذهب
  // إلى كولكشن نصوصٍ مستقل ويُربط بـtext_ref مبنيٍّ من الأسماء، فيكفي
  // اختلاف حرفٍ في اسم المادة أو القسم ليصير النصّ يتيماً بلا محاضرة —
  // وهو ما خلّف 394 ملفاً تحتاج ربطاً يدوياً.
  //
  // يعيد lecture_id للمحاضرة (يُنشئها إن لم تكن موجودة).
  const ensureLecture = async (lec) => {
    const clean = sanitizeName(lec.name);
    const existing = target?.lectures || [];

    // المطابقة بالمعرّف إن كان محفوظاً من رفعٍ سابق، وإلا بالاسم الحرفي
    const found =
      (lec.db_lecture_id &&
        existing.find((l) => l.lecture_id === lec.db_lecture_id)) ||
      existing.find((l) => norm(l.name || l.title) === norm(lec.name));
    if (found) return found.lecture_id;

    const r = await axios.put(`${API_BASE_URL}/v2/lecture/manage`, {
      PASSWORD,
      _id: target.subjectId,
      action: "add",
      name: clean,
    });
    const lid = r.data?.lecture_id;
    if (!lid) throw new Error("تعذّر إنشاء كيان المحاضرة");

    // نضيفها إلى الهدف محلياً كي لا يُنشئ الرفع التالي نسخةً ثانية
    dispatch({
      type: "target",
      target: {
        ...target,
        lectures: [...existing, { lecture_id: lid, name: clean }],
      },
    });
    return lid;
  };

  const uploadOne = async (lec) => {
    const text = markdown[lec.id];
    if (!text || !target) return false;
    // حارسٌ صريح: بلا معرّف مادة لا يُكتب شيء، ونقولها بدل أن يبتلع الخادم
    // الطلب ويظنّ المحرِّر أن نصّه حُفظ.
    if (!target.subjectId) {
      setUploads((p) => ({
        ...p,
        [lec.id]: { status: "error", error: "لا معرّف للمادة الهدف" },
      }));
      return false;
    }
    setUploads((p) => ({ ...p, [lec.id]: { status: "running" } }));
    try {
      const lectureId = await ensureLecture(lec);
      await axios.put(`${API_BASE_URL}/v2/lecture/save`, {
        PASSWORD,
        _id: target.subjectId,
        lecture_id: lectureId,
        payload: {
          curriculum: { text, source_file: `${sanitizeName(lec.name)}.md` },
        },
      });
      setUploads((p) => ({ ...p, [lec.id]: { status: "done" } }));
      return true;
    } catch (e) {
      setUploads((p) => ({
        ...p,
        [lec.id]: {
          status: "error",
          error: e?.response?.data?.message || e.message,
        },
      }));
      return false;
    }
  };

  /** كل رفعةٍ تُنشئ كيان محاضرتها وتكتب النصّ داخله (uploadOne)، فلا خطوة
   *  ربطٍ تالية. يبقى تحديث الهدف بالمحاضرات كما صارت في القاعدة، كي
   *  تجدها خطوات التوليد بعدها بمعرّفاتها الحقيقية. */
  const uploadAll = async () => {
    setBusy(true);
    setCreateErr(null);
    try {
      const failed = [];
      for (const l of ready) {
        if (uploads[l.id]?.status === "done") continue;
        // eslint-disable-next-line no-await-in-loop
        const ok = await uploadOne(l);
        if (!ok) failed.push(l.name);
      }
      // الإخفاق يُقال صراحةً: «رُفعت النصوص» بينما لم تُرفَع هو ما جعل
      // المحرِّر يمضي إلى الخطوة التالية وقد ضاع عمله.
      if (failed.length) {
        setCreateErr(
          `لم تُحفَظ ${failed.length} محاضرة: ${failed.slice(0, 3).join("، ")}${
            failed.length > 3 ? "…" : ""
          } — راجع الأخطاء أدناه ثم أعد الرفع.`,
        );
        setBusy(false);
        return;
      }
      const fresh = await axios.post(`${API_BASE_URL}/v2/subject`, {
        _id: target.subjectId,
        scope: "list",
      });
      const t = toTarget(fresh.data, section);
      setTarget(t);
      if (t) dispatch({ type: "target", target: t });
      setCreateErr(
        (fresh.data?.lectures || []).length
          ? null
          : "رُفعت النصوص لكن لم تظهر المحاضرات — أعد المحاولة",
      );
    } catch (e) {
      setCreateErr(
        `رُفعت النصوص، لكن تعذّر إنشاء كيانات المحاضرات: ${
          e?.response?.data?.message || e.message
        }`,
      );
    } finally {
      setBusy(false);
    }
  };

  const uploadedCount = ready.filter(
    (l) => uploads[l.id]?.status === "done",
  ).length;

  const unmatched = target
    ? ready.filter((l) => {
        const m = matchOf(l.name);
        return m && !m.inLectures && !m.inSummary && !m.inQuestions;
      })
    : [];

  if (!ready.length) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center">
        <Eye size={24} className="text-gray-300 mx-auto mb-3" />
        <p className="text-sm text-gray-500">
          لا نصوص جاهزة — ارجع إلى خطوة المسح الضوئي
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* المادة الهدف */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-9 h-9 rounded-xl bg-brand/10 flex items-center justify-center">
            <Link2 size={17} className="text-brand" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-800">
              إلى أي مادة تنتمي هذه المحاضرات؟
            </p>
            <p className="text-xs text-gray-400">
              الرفع يكتب نصّ كل محاضرة باسمها داخل هذه المادة
            </p>
          </div>
        </div>

        <SubjectScopePicker
          universityId={pick.universityId}
          collegeId={pick.collegeId}
          onChange={(v) => {
            setPick(v);
            setSubjectId("");
          }}
        />

        {pick.collegeId && (
          <div className="flex items-center gap-2 flex-wrap px-3">
            <SubjectSelect
              collegeId={pick.collegeId}
              value={subjectId}
              onChange={setSubjectId}
            />
            <label className="flex items-center gap-2 text-sm text-gray-600">
              القسم
              <input
                value={section}
                onChange={(e) => setSection(e.target.value)}
                dir="rtl"
                title="جزء من مسار التخزين: القسم/المادة/الملف"
                className="w-36 px-2.5 py-2 rounded-xl border border-gray-200 text-sm outline-none focus:border-brand"
              />
            </label>
            {loadingTarget && (
              <Loader2 size={15} className="animate-spin text-brand" />
            )}
            <span className="text-xs text-gray-300">أو</span>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              dir="rtl"
              placeholder="اسم مادة جديدة…"
              className="px-2.5 py-2 rounded-xl border border-gray-200 text-sm outline-none focus:border-brand w-44"
            />
            <button
              onClick={createSubject}
              disabled={creating || !newName.trim()}
              className="text-xs font-semibold text-brand bg-brand/10 border border-brand/30 rounded-xl px-3 py-2 disabled:opacity-40 flex items-center gap-1.5"
            >
              {creating ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Plus size={13} />
              )}
              أنشئها
            </button>

            {target && (
              <span className="text-xs text-gray-500">
                {target.lectures?.length || 0} محاضرة ·{" "}
                {
                  (target.lectures || []).filter((l) => l.summary_sections > 0)
                    .length
                }{" "}
                ملخص ·{" "}
                {(target.lectures || []).filter((l) => l.questions_count > 0)
                  .length}{" "}
                محاضرة لها أسئلة
              </span>
            )}
          </div>
        )}
      </div>

      {createErr && (
        <div className="bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl px-4 py-2.5 mx-3">
          {createErr}
        </div>
      )}

      {/* تحذير عدم المطابقة */}
      {target && unmatched.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <p className="text-sm font-bold text-amber-800 flex items-center gap-1.5 mb-1">
            <AlertTriangle size={15} /> {unmatched.length} محاضرة لا يطابق اسمها
            شيئاً في «{target.name}»
          </p>
          <p className="text-xs text-amber-700 mb-2">
            النصّ سيُرفع لكن لن يصل إلى طالب: لا محاضرة ولا ملخص ولا مجموعة
            أسئلة بهذا الاسم. صحّح الاسم هنا أو اربطه لاحقاً من شاشة
            «المحاضرات».
          </p>
          <div className="flex flex-wrap gap-1.5">
            {unmatched.map((l) => (
              <span
                key={l.id}
                className="text-xs bg-white border border-amber-200 rounded-lg px-2 py-1 text-amber-900"
              >
                {l.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* المحاضرات */}
      <div className="flex flex-col gap-2">
        {ready.map((l, i) => {
          const st = stats(markdown[l.id]);
          const m = matchOf(l.name);
          const up = uploads[l.id] || {};
          return (
            <div
              key={l.id}
              className={`bg-white rounded-xl border p-3.5 ${
                up.status === "error" ? "border-red-200" : "border-gray-100"
              }`}
            >
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-xs font-bold text-gray-400 w-5">
                  {i + 1}
                </span>
                <span className="text-sm font-semibold text-gray-800 truncate max-w-[200px]">
                  {l.name}
                </span>
                <span className="text-xs text-gray-400">
                  {st.words.toLocaleString("ar-EG")} كلمة · {st.images} صورة ·{" "}
                  {st.pages} صفحة
                </span>

                {m && (
                  <span className="flex items-center gap-1">
                    {[
                      ["محاضرة", m.inLectures],
                      ["ملخص", m.inSummary],
                      ["أسئلة", m.inQuestions],
                    ].map(([label, on]) => (
                      <span
                        key={label}
                        className={`text-[10px] px-1.5 py-0.5 rounded ${
                          on
                            ? "bg-green-50 text-green-700"
                            : "bg-gray-100 text-gray-400"
                        }`}
                      >
                        {label}
                      </span>
                    ))}
                  </span>
                )}

                {up.status === "done" && (
                  <span className="text-xs text-green-700 flex items-center gap-1">
                    <CheckCircle2 size={13} /> رُفعت
                  </span>
                )}

                <div className="mr-auto flex items-center gap-2">
                  <button
                    onClick={() => setOpen(l.id)}
                    className="text-xs font-medium text-brand bg-brand/10 rounded-lg px-3 py-1.5 flex items-center gap-1.5"
                  >
                    <Eye size={13} /> النتيجة النهائية
                  </button>
                  <button
                    onClick={() => uploadOne(l)}
                    disabled={!target || busy || up.status === "running"}
                    title={target ? "" : "اختر المادة الهدف أولاً"}
                    className="text-xs text-gray-600 border border-gray-200 rounded-lg px-3 py-1.5 flex items-center gap-1.5 disabled:opacity-40"
                  >
                    {up.status === "running" ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : (
                      <UploadCloud size={13} />
                    )}
                    ارفع
                  </button>
                </div>
              </div>
              {up.error && (
                <p className="text-xs text-red-600 mt-2">{up.error}</p>
              )}
            </div>
          );
        })}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center gap-3 flex-wrap">
        <span className="text-sm text-gray-500">
          {uploadedCount} من {ready.length} مرفوعة
        </span>
        <button
          onClick={uploadAll}
          disabled={!target || busy}
          className="mr-auto text-sm font-medium text-brand bg-brand/10 rounded-xl px-5 py-2.5 flex items-center gap-2 disabled:opacity-40"
        >
          {busy ? (
            <Loader2 size={15} className="animate-spin" />
          ) : (
            <UploadCloud size={15} />
          )}
          ارفع الكل
        </button>
        <button
          onClick={() => dispatch({ type: "step", step: "summary" })}
          className="bg-brand text-white text-sm font-bold rounded-xl px-6 py-2.5 flex items-center gap-2"
        >
          <ArrowLeft size={16} /> متابعة إلى الملخص
        </button>
      </div>

      {open && (
        <FinalView
          name={lectures.find((l) => l.id === open)?.name}
          text={markdown[open]}
          pdfBytes={getLectureBytes(open)}
          onChange={(t) => setText(open, t)}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}

/** منتقي المادة داخل الكلية المختارة */
const SubjectSelect = ({ collegeId, value, onChange }) => {
  const [items, setItems] = useState([]);
  useEffect(() => {
    if (!collegeId) return;
    axios
      .post(`${API_BASE_URL}/exams/names`, { PASSWORD, college_id: collegeId })
      .then((r) => setItems(r.data?.exams || []))
      .catch(() => setItems([]));
  }, [collegeId]);
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="px-3 py-2 rounded-xl border border-gray-200 text-sm outline-none focus:border-brand bg-white text-gray-800 min-w-[200px]"
    >
      <option value="" className="bg-white text-gray-800">
        اختر المادة…
      </option>
      {items.map((e) => (
        <option key={e._id} value={e._id} className="bg-white text-gray-800">
          {e.name}
        </option>
      ))}
    </select>
  );
};

// ─── النتيجة النهائية: معاينة + تحرير ─────────────────────────────────────────

const FinalView = ({ name, text, pdfBytes, onChange, onClose }) => {
  // كل شيءٍ داخل الورشة: المعاينة والتحرير والمقارنة بالملفّ الأصلي والصور
  // والتصفية. المكوّن نفسه يعمل في تعديل المادة، فلا تفترق النافذتان.
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-3">
      <div
        dir="rtl"
        className="bg-white rounded-2xl w-full max-w-6xl h-[92vh] flex flex-col overflow-hidden"
      >
        <div className="flex items-center gap-3 p-3.5 border-b border-gray-100 flex-wrap">
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-bold text-gray-800 truncate">{name}</h3>
            <p className="text-xs text-gray-400">راجِع النصّ وقارنه بالمقرَّر الأصلي</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100"
          >
            <X size={18} />
          </button>
        </div>

        {/* نفس ورشة تعديل المادة حرفياً — مكوّنٌ واحد لا نسخةٌ ثانية */}
        <div className="flex-1 overflow-hidden p-3">
          <CurriculumWorkspace
            text={text}
            onChange={onChange}
            pdfBytes={pdfBytes}
            height="100%"
          />
        </div>

        <div className="p-3 border-t border-gray-100 flex items-center gap-3">
          <p className="text-xs text-gray-400">
            انقر أي صورة في المعاينة لحذفها · التعديلات تُحفظ فوراً في الذاكرة
          </p>
          <button
            onClick={onClose}
            className="mr-auto bg-brand text-white text-sm font-bold rounded-xl px-5 py-2 flex items-center gap-2"
          >
            <CheckCircle2 size={15} /> تمّ
          </button>
        </div>
      </div>
    </div>
  );
};
