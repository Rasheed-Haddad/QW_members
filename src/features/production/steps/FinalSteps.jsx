import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import {
  CheckCircle2,
  Circle,
  Save,
  Loader2,
  AlertTriangle,
  PartyPopper,
} from "lucide-react";
import { usePipeline } from "../pipelineStore";
import { API_BASE_URL, PASSWORD } from "../../../config";

// ─── الخطوة ٩: الحفظ النهائي ──────────────────────────────────────────────────
// محتوى المحاضرات حُفظ في خطواته داخل كائن كل محاضرة (curriculum، summary،
// questions، flash_cards، written_exam). هذا الحفظ لبيانات المادة وحدها:
// الاسم والكلية والسعران والظهور — ومعه تحقّقٌ ممّا وصل القاعدة فعلاً.

const DB_PARTS = [
  { key: "curriculum", label: "نصّ المقرَّر", ok: (l) => l.has_curriculum },
  { key: "summary", label: "الملخص", ok: (l) => l.summary_sections > 0 },
  { key: "questions", label: "الأسئلة", ok: (l) => l.questions_count > 0 },
  { key: "flash", label: "البطاقات", ok: (l) => l.flash_count > 0 },
  { key: "written", label: "التحريري", ok: (l) => l.written_count > 0 },
];

export const Step9Save = () => {
  const { state, dispatch } = usePipeline();
  const navigate = useNavigate();
  const { target, lectures, markdown } = state;

  const [form, setForm] = useState({
    name: "",
    college_id: "",
    price: "",
    price_moadal: "",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);

  // ما وصل القاعدة فعلاً — لا ما نظنّه في ذاكرة المتصفّح.
  // «أُنجز» المبنيّ على الحالة المحلية يطمئنك إلى محتوىً قد يكون فشل رفعه.
  const [db, setDb] = useState(null);

  useEffect(() => {
    if (!target?.subjectId) return;
    axios
      .post(`${API_BASE_URL}/v2/subject`, {
        _id: target.subjectId,
        scope: "list",
      })
      .then((r) => {
        setDb(r.data);
        setForm({
          name: r.data?.name || "",
          college_id: r.data?.college_id ?? "",
          price: r.data?.price ?? "",
          price_moadal: r.data?.price_moadal ?? "",
        });
      })
      .catch(() => {
        // فشل الجلب لا يمنع الحفظ: يملأ المستخدم الحقول بنفسه
      });
  }, [target?.subjectId]);

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const save = async () => {
    if (!target?.subjectId) return;
    setSaving(true);
    setError(null);
    try {
      // نرسل حقول المادة وحدها. غياب new_questions وnew_summary يعني
      // «لا تلمسهما» في المتحكّم — ونصوص المحاضرات ليست هنا أصلاً.
      await axios.put(`${API_BASE_URL}/updateexam`, {
        PASSWORD,
        _id: target.subjectId,
        new_name: form.name,
        new_price: Number(form.price) || 0,
        new_price_moadal: Number(form.price_moadal) || 0,
      });
      setSaved(true);
    } catch (e) {
      setError(e?.response?.data?.message || e.message);
    } finally {
      setSaving(false);
    }
  };

  const withText = lectures.filter((l) => markdown[l.id]).length;

  // ما تحقّق في القاعدة لكل نوع — الأنواع الخمسة هي شرط خطة «معدل»
  const dbLectures = db?.lectures || [];
  const allReady =
    dbLectures.length > 0 && DB_PARTS.every((p) => dbLectures.every(p.ok));

  const Check = ({ on, children }) => (
    <div className="flex items-center gap-2 text-sm">
      {on ? (
        <CheckCircle2 size={16} className="text-green-500 shrink-0" />
      ) : (
        <Circle size={16} className="text-gray-300 shrink-0" />
      )}
      <span className={on ? "text-gray-700" : "text-gray-400"}>{children}</span>
    </div>
  );

  if (saved) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center">
        <PartyPopper size={30} className="text-brand mx-auto mb-3" />
        <h3 className="text-lg font-bold text-gray-800">تمّت المادة</h3>
        <p className="text-sm text-gray-500 mt-2 mb-6">
          {form.name} · {lectures.length} محاضرة
        </p>
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => navigate(`/exams/edit/${target.subjectId}`)}
            className="text-sm text-gray-600 border border-gray-200 rounded-xl px-4 py-2.5"
          >
            افتح المادة
          </button>
          <button
            onClick={() => dispatch({ type: "reset" })}
            className="bg-brand text-white text-sm font-bold rounded-xl px-5 py-2.5"
          >
            ابدأ مادةً جديدة
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-white rounded-2xl border border-gray-100 p-4">
        <h3 className="text-sm font-bold text-gray-800 mb-3">
          ما وصل القاعدة فعلاً
        </h3>
        <div className="flex flex-col gap-2">
          <Check on={lectures.length > 0}>
            {lectures.length} محاضرة مقسَّمة من المقرَّر
          </Check>
          <Check on={withText > 0}>{withText} نصّ ممسوح ضوئياً</Check>
          <Check on={Boolean(target?.subjectId)}>
            {target ? `مربوطة بمادة «${target.name}»` : "لم تُحدَّد المادة الهدف"}
          </Check>

          {db && (
            <>
              <div className="h-px bg-gray-100 my-1" />
              <Check on={dbLectures.length > 0}>
                {dbLectures.length} محاضرة محفوظة في المادة
              </Check>
              {DB_PARTS.map((p) => {
                const n = dbLectures.filter(p.ok).length;
                return (
                  <Check key={p.key} on={n === dbLectures.length && n > 0}>
                    {p.label}: {n}/{dbLectures.length}
                  </Check>
                );
              })}
            </>
          )}
        </div>
        <p className="text-xs text-gray-400 mt-3 pt-3 border-t border-gray-100">
          {allReady
            ? "كل المحاضرات مكتملة الأنواع الخمسة — المادة مؤهَّلة لخطة «معدل»."
            : "الأعداد أعلاه من القاعدة لا من المتصفّح. النقص هنا يعني أن جزءاً لم يُرفع — عُد إلى خطوته."}
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 p-4 flex flex-col gap-3">
        <h3 className="text-sm font-bold text-gray-800">بيانات المادة</h3>

        <label className="block">
          <span className="block text-xs text-gray-400 mb-1">اسم المادة</span>
          <input
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            dir="rtl"
            className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm outline-none focus:border-brand"
          />
        </label>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label className="block">
            <span className="block text-xs text-gray-400 mb-1">رمز الكلية</span>
            <input
              value={form.college_id}
              disabled
              title="يُحدَّد عند إنشاء المادة ولا يُغيَّر من هنا"
              className="w-full px-3 py-2 rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-500"
            />
          </label>
          <label className="block">
            <span className="block text-xs text-gray-400 mb-1">
              سعر «ترفيع»
            </span>
            <input
              type="number"
              value={form.price}
              onChange={(e) => set("price", e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm outline-none focus:border-brand"
            />
          </label>
          <label className="block">
            <span className="block text-xs text-gray-400 mb-1">سعر «معدل»</span>
            <input
              type="number"
              value={form.price_moadal}
              onChange={(e) => set("price_moadal", e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm outline-none focus:border-brand"
            />
          </label>
        </div>

      </div>

      {error && (
        <div className="bg-red-50 border border-red-100 text-red-600 text-sm rounded-xl px-4 py-2.5 flex items-start gap-2">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center gap-3">
        <p className="text-sm text-gray-500">
          {target?.subjectId
            ? "الأسئلة والملخص لا يُمَسّان بهذا الحفظ"
            : "اختر المادة الهدف من خطوة المراجعة أولاً"}
        </p>
        <button
          onClick={save}
          disabled={!target?.subjectId || saving || !form.name.trim()}
          className="mr-auto bg-brand text-white text-sm font-bold rounded-xl px-6 py-2.5 disabled:opacity-40 flex items-center gap-2"
        >
          {saving ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Save size={16} />
          )}
          احفظ المادة
        </button>
      </div>
    </div>
  );
};
