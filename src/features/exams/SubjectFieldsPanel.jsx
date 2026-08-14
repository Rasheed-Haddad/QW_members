import { useEffect, useState } from "react";
import axios from "axios";
import { ChevronDown, Download, Loader2, Save, Check } from "lucide-react";
import { API_BASE_URL, PASSWORD } from "../../config";
import { getSubject, SCOPE } from "./v2api";

// ─── بيانات المادة العامة ────────────────────────────────────────────────────
// كانت شاشةً منفصلة يُقذف إليها المستخدم فيفقد المحاضرة التي يعمل عليها،
// ويعود ليبحث عنها من جديد. الحقول هنا قليلة وثابتة (اسم وسعران وكلية
// ووصف) فلا تستحقّ انتقالاً كاملاً — لوحةٌ تنطوي فوق مساحة العمل تكفي،
// والسياق يبقى تحتها كما هو.

const FIELDS = [
  { name: "name", label: "اسم المادة" },
  { name: "college_id", label: "رمز الكلية" },
  { name: "price", label: "سعر خطة ترفيع", numeric: true },
  { name: "price_moadal", label: "سعر خطة معدل", numeric: true },
];

export default function SubjectFieldsPanel({ subjectId, onRenamed }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);
  const [exporting, setExporting] = useState(false);
  // عدد المسجَّلين وقت الجلب — مرجع التحذير عند التفريغ
  const [loadedStudents, setLoadedStudents] = useState(0);

  // نجلب عند أول فتح فقط — لا نُثقل الشاشة بما قد لا يُفتح أبداً
  useEffect(() => {
    if (!open || form || !subjectId) return;
    setLoading(true);
    setError(null);
    getSubject(subjectId, SCOPE.LIST)
      .then((d) => {
        setLoadedStudents(
          Array.isArray(d.available_to) ? d.available_to.length : 0,
        );
        setForm({
          name: d.name || "",
          college_id: d.college_id ?? "",
          price: d.price ?? "",
          price_moadal: d.price_moadal ?? "",
          info: d.info || "",
          available_to: Array.isArray(d.available_to)
            ? d.available_to.join(", ")
            : d.available_to || "",
        });
      })
      .catch((e) =>
        setError(e?.response?.data?.message || "تعذّر جلب بيانات المادة"),
      )
      .finally(() => setLoading(false));
  }, [open, form, subjectId]);

  const set = (k, v) => {
    setForm((f) => ({ ...f, [k]: v }));
    setSaved(false);
  };

  const save = async () => {
    if (!form?.name?.trim()) {
      setError("اسم المادة مطلوب");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const nextStudents = String(form.available_to || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      // تفريغ القائمة يعني إلغاء تسجيل كل المشتركين — فعلٌ لا رجعة فيه
      // ولا يُقصَد عادةً. نسأل صراحةً بدل أن يمرّ بضغطة حفظٍ عابرة.
      if (loadedStudents > 0 && nextStudents.length === 0) {
        const ok = window.confirm(
          `ستُفرَّغ قائمة المسجَّلين (${loadedStudents} طالباً) — أي إلغاء اشتراكهم جميعاً.\nمتأكّد؟`,
        );
        if (!ok) {
          setSaving(false);
          return;
        }
      }

      await axios.put(`${API_BASE_URL}/updateexam`, {
        PASSWORD,
        _id: subjectId,
        new_name: form.name.trim(),
        new_info: form.info,
        new_price: Number(form.price) || 0,
        new_price_moadal: Number(form.price_moadal) || 0,
        new_available_to: nextStudents,
      });
      setSaved(true);
      onRenamed?.(form.name.trim());
      setTimeout(() => setSaved(false), 2200);
    } catch (e) {
      setError(e?.response?.data?.message || e.message);
    } finally {
      setSaving(false);
    }
  };

  // التحميل يجلب المادة كاملةً (النطاق full) — لا ما هو معروض فقط
  const exportJson = async () => {
    setExporting(true);
    setError(null);
    try {
      const full = await getSubject(subjectId, SCOPE.FULL);
      const blob = new Blob([JSON.stringify(full, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${full.name || "subject"}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e?.response?.data?.message || "تعذّر تحميل الملف");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      <div className="flex items-center">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex-1 flex items-center gap-2 px-4 py-3 text-right hover:bg-gray-50"
        >
          <ChevronDown
            size={16}
            className={`text-gray-400 transition-transform ${
              open ? "" : "rotate-180"
            }`}
          />
          <span className="text-sm font-bold text-gray-800">بيانات المادة</span>
          <span className="text-xs text-gray-400">
            الاسم والسعران والكلية والوصف
          </span>
        </button>

        {/* التحميل ظاهر دائماً — لا يشترط فتح اللوحة */}
        <button
          onClick={exportJson}
          disabled={exporting}
          title="تحميل المادة كاملةً بصيغة JSON"
          className="mx-3 text-xs text-gray-600 border border-gray-200 rounded-xl px-3 py-2 flex items-center gap-1.5 hover:bg-gray-50 disabled:opacity-50"
        >
          {exporting ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Download size={14} />
          )}
          JSON
        </button>
      </div>

      {open && (
        <div className="px-4 pb-4 pt-1 border-t border-gray-100">
          {loading ? (
            <p className="text-sm text-gray-400 py-6 text-center">جارٍ الجلب…</p>
          ) : form ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                {FIELDS.map((f) => (
                  <label key={f.name} className="block">
                    <span className="text-xs text-gray-500">{f.label}</span>
                    <input
                      value={form[f.name] ?? ""}
                      onChange={(e) => set(f.name, e.target.value)}
                      inputMode={f.numeric ? "numeric" : undefined}
                      className="w-full mt-1 px-3 py-2 rounded-xl border border-gray-200 text-sm outline-none focus:border-brand"
                    />
                  </label>
                ))}
              </div>

              <label className="block mt-3">
                <span className="text-xs text-gray-500">وصف المادة</span>
                <textarea
                  value={form.info}
                  onChange={(e) => set("info", e.target.value)}
                  rows={2}
                  className="w-full mt-1 px-3 py-2 rounded-xl border border-gray-200 text-sm outline-none focus:border-brand"
                />
              </label>

              <label className="block mt-3">
                <span className="text-xs text-gray-500">
                  الطلاب المسجَّلون (أرقام مفصولة بفاصلة)
                </span>
                <textarea
                  dir="ltr"
                  value={form.available_to}
                  onChange={(e) => set("available_to", e.target.value)}
                  rows={2}
                  className="w-full mt-1 px-3 py-2 rounded-xl border border-gray-200 text-sm outline-none focus:border-brand"
                />
              </label>

              {error && (
                <p className="text-xs text-red-600 mt-2">{error}</p>
              )}

              <button
                onClick={save}
                disabled={saving}
                className={`mt-3 w-full py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 ${
                  saved
                    ? "bg-green-600 text-white"
                    : "bg-brand text-white disabled:opacity-50"
                }`}
              >
                {saving ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : saved ? (
                  <>
                    <Check size={15} /> حُفظ
                  </>
                ) : (
                  <>
                    <Save size={15} /> حفظ بيانات المادة
                  </>
                )}
              </button>
            </>
          ) : (
            error && <p className="text-xs text-red-600 py-4">{error}</p>
          )}
        </div>
      )}
    </div>
  );
}
