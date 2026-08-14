import axios from "axios";
import { ChevronDown } from "lucide-react";
import { useEffect, useState } from "react";
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
        </button>
      </div>
    </div>
  );
}
