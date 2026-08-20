import { useEffect, useRef, useState } from "react";
import { Scissors, X, EyeOff } from "lucide-react";

// ─── تسمية القسم ساعةَ شقّه ───────────────────────────────────────────────────
// كان الشقّ يُنشئ قسماً بلا اسم، فيضطرّ المستخدم إلى النزول لآخر القائمة
// وتسميته ثم العودة إلى موضعه في الشبكة — مرّةً لكل قسم في مقرَّرٍ من أربعين.
// السؤال هنا يكلّف ثانية ويُلغي تلك الرحلة كلّها.
//
// و«مهمَل» في المكان نفسه: الغلاف والفهرس وصفحات الإهداء تُعرف ساعةَ رؤيتها
// لا بعد القصّ، وتأشيرها هنا يمنعها من المسح الضوئي ومن كلفته.

export default function SplitNameModal({ page, suggestion = "", onConfirm, onCancel }) {
  const [name, setName] = useState("");
  const [dropped, setDropped] = useState(false);
  const inputRef = useRef(null);

  // يُفتح على كل صفحة بقيمٍ نظيفة: بقاء اسم القسم السابق يُنتج تكراراً صامتاً
  useEffect(() => {
    setName(suggestion || "");
    setDropped(false);
    // التركيز مع تحديد النصّ: الاقتراح يُقبل بمفتاح واحد أو يُستبدل بالكتابة
    const t = setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 30);
    return () => clearTimeout(t);
  }, [page, suggestion]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onCancel?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const confirm = () => {
    const clean = name.trim();
    // المهمَل لا يحتاج اسماً؛ وغيره لا يُقبل بلا اسم وإلا عاد العيب نفسه
    if (!clean && !dropped) {
      inputRef.current?.focus();
      return;
    }
    onConfirm?.({ name: dropped ? clean : clean, dropped });
  };

  return (
    <div
      dir="rtl"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel?.();
      }}
    >
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
          <Scissors size={16} className="text-brand" />
          <h3 className="text-sm font-bold text-gray-900 flex-1">
            قسمٌ جديد يبدأ بالصفحة {page}
          </h3>
          <button
            onClick={onCancel}
            className="p-1 rounded-lg text-gray-400 hover:bg-gray-100"
            title="إلغاء"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <label className="block">
            <span className="block text-xs font-semibold text-gray-600 mb-1.5">
              اسم القسم
            </span>
            <input
              ref={inputRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  confirm();
                }
              }}
              dir="rtl"
              placeholder="اسم المحاضرة"
              disabled={dropped}
              className="w-full px-3 py-2.5 rounded-xl border border-gray-300 text-sm font-arabic outline-none focus:border-brand disabled:bg-gray-100 disabled:text-gray-400"
            />
          </label>

          <button
            type="button"
            onClick={() => setDropped((v) => !v)}
            className={`w-full flex items-start gap-2.5 p-3 rounded-xl border text-right transition ${
              dropped
                ? "border-amber-300 bg-amber-50"
                : "border-gray-200 bg-white hover:bg-gray-50"
            }`}
          >
            <span
              className={`w-4 h-4 mt-0.5 rounded border-2 shrink-0 flex items-center justify-center ${
                dropped ? "bg-amber-500 border-amber-500" : "border-gray-300"
              }`}
            >
              {dropped && <EyeOff size={10} className="text-white" />}
            </span>
            <span className="flex-1">
              <span className="block text-xs font-bold text-gray-800">
                هذا القسم مهمَل
              </span>
              <span className="block text-[11px] text-gray-500 mt-0.5">
                يبقى في القائمة ليُرى، ولا يُقصّ ولا يذهب إلى المسح الضوئي.
              </span>
            </span>
          </button>
        </div>

        <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 border-t border-gray-100">
          <button
            onClick={onCancel}
            className="px-3 py-2 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-200"
          >
            إلغاء
          </button>
          <button
            onClick={confirm}
            className="mr-auto px-5 py-2 rounded-xl bg-brand text-white text-sm font-bold"
          >
            قسّم هنا
          </button>
        </div>
      </div>
    </div>
  );
}
