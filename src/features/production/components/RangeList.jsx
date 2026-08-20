import { useEffect, useState } from "react";
import { Trash2, Wand2, Crosshair, Tags, EyeOff, Eye } from "lucide-react";
import { colorFor, sorted, sanitizeName } from "../lib/ranges";

// ─── قائمة المحاضرات ──────────────────────────────────────────────────────────
// كل نطاق سطر: لونه، صفحاته، واسمه. الاسم هنا هو اسم المحاضرة الذي ستطابقه
// خطوات لاحقة بأسماء المحاضرات في القاعدة — فهو ليس تسميةً للزينة.

/** حقل رقمي يحتفظ بمسوّدةٍ نصّية أثناء الكتابة.
 *  النموذج لا يقبل قيمةً غير صالحة (انظر ranges.js)، لكن المستخدم يحتاج أن
 *  يفرّغ الحقل ليكتب رقماً جديداً — فالمسوّدة تعيش هنا لا هناك. */
const NumField = ({ value, onCommit, title }) => {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  return (
    <input
      type="number"
      min={1}
      value={draft}
      title={title}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft === "" || Number.isNaN(parseInt(draft, 10))) {
          setDraft(String(value)); // تراجُع بصري عن مدخَل غير صالح
        } else onCommit(draft);
      }}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      className="w-14 px-1.5 py-1 rounded-lg border border-gray-200 text-center text-xs outline-none focus:border-brand"
    />
  );
};

export default function RangeList({
  ranges,
  problemsById,
  onUpdate,
  onRemove,
  onToggleDropped,
  onJump,
  onSuggestName,
  onBulkName,
  suggesting,
}) {
  const list = sorted(ranges);
  const [bulk, setBulk] = useState("");
  const [showBulk, setShowBulk] = useState(false);

  return (
    <div className="flex flex-col gap-3 h-full min-h-0 flex-1">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-800">
          المحاضرات
          <span className="mr-1.5 text-xs font-normal text-gray-400">
            {list.length}
          </span>
        </h3>
        <button
          onClick={() => setShowBulk((v) => !v)}
          className="text-xs font-medium text-brand bg-brand/10 rounded-lg px-2.5 py-1.5 flex items-center gap-1.5"
        >
          <Tags size={13} /> تسمية جماعية
        </button>
      </div>

      {showBulk && (
        <div className="p-3 rounded-xl bg-brand/5 border border-brand/20">
          <p className="text-xs text-gray-500 mb-2">
            بادئة + ترقيم متسلسل لكل المحاضرات بالترتيب
          </p>
          <div className="flex gap-2">
            <input
              value={bulk}
              onChange={(e) => setBulk(e.target.value)}
              placeholder="محاضرة "
              className="flex-1 px-2.5 py-2 rounded-xl border border-gray-200 text-sm outline-none focus:border-brand"
            />
            <button
              onClick={() => {
                onBulkName(bulk || "محاضرة ");
                setShowBulk(false);
              }}
              className="px-3 py-2 rounded-xl bg-brand text-white text-sm font-bold"
            >
              طبّق
            </button>
          </div>
        </div>
      )}

      {/* min-h-0 شرطٌ لا زينة: عنصر flex ارتفاعه الأدنى auto فلا ينكمش دون
          مقاس محتواه، فلا يعمل overflow-y-auto أبداً وتتمدّد القائمة خارج
          صندوقها. وهذا ما أخفى النطاقات بعد الرابع حين قُصّ الصندوق. */}
      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-2 pl-1">
        {list.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-8">
            لا نطاقات — انقر صفحةً في الشبكة لبدء التقسيم
          </p>
        )}

        {list.map((r, i) => {
          const bad = problemsById?.get(r.id) || [];
          const clean = sanitizeName(r.name);
          const willRename = clean !== r.name.trim() && r.name.trim() !== "";
          return (
            <div
              key={r.id}
              className={`p-3 rounded-xl border ${
                r.dropped
                  ? "border-dashed border-amber-300 bg-amber-50/40 opacity-75"
                  : bad.length
                    ? "border-red-200 bg-white"
                    : "border-gray-200 bg-white"
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <span
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ backgroundColor: colorFor(i) }}
                />
                <span className="text-xs font-bold text-gray-500">{i + 1}</span>

                <NumField
                  value={r.start}
                  title="صفحة البداية"
                  onCommit={(v) => onUpdate(r.id, "start", v)}
                />
                <span className="text-xs text-gray-400">→</span>
                <NumField
                  value={r.end}
                  title="صفحة النهاية"
                  onCommit={(v) => onUpdate(r.id, "end", v)}
                />

                <span className="text-[11px] text-gray-400 whitespace-nowrap">
                  {Math.max(0, r.end - r.start + 1)} ص
                </span>

                <div className="mr-auto flex items-center gap-0.5">
                  <button
                    onClick={() => onToggleDropped?.(r.id)}
                    title={
                      r.dropped
                        ? "مهمَل — لا يذهب إلى المسح الضوئي. انقر لإعادته"
                        : "أهمِله — يبقى معروضاً ولا يُقصّ"
                    }
                    className={`p-1.5 rounded-md ${
                      r.dropped
                        ? "text-amber-600 bg-amber-100"
                        : "text-gray-400 hover:bg-gray-100"
                    }`}
                  >
                    {r.dropped ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                  <button
                    onClick={() => onJump(r.start)}
                    title="اذهب إلى صفحتها"
                    className="p-1.5 rounded-md text-gray-400 hover:bg-gray-100"
                  >
                    <Crosshair size={14} />
                  </button>
                  <button
                    onClick={() => onRemove(r.id)}
                    title="حذف — سيترك صفحاته بلا محاضرة"
                    className="p-1.5 rounded-md text-red-500 hover:bg-red-50"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              {r.dropped && (
                <p className="text-[11px] font-bold text-amber-700 mb-1.5">
                  مهمَل — لن يُقصّ ولن يذهب إلى المسح الضوئي
                </p>
              )}

              <div className="flex gap-1.5">
                <input
                  value={r.name}
                  disabled={r.dropped}
                  onChange={(e) => onUpdate(r.id, "name", e.target.value)}
                  placeholder="اسم المحاضرة"
                  dir="rtl"
                  className={`flex-1 px-2.5 py-2 rounded-xl border text-sm outline-none focus:border-brand disabled:bg-gray-100 disabled:text-gray-400 ${
                    !r.dropped &&
                    bad.some((p) => p.code === "no_name" || p.code === "dup_name")
                      ? "border-red-300 bg-red-50/40"
                      : "border-gray-200"
                  }`}
                />
                <button
                  onClick={() => onSuggestName(r)}
                  disabled={suggesting === r.id || r.dropped}
                  title="اقترح الاسم من نصّ أول صفحة"
                  className="px-2.5 rounded-xl border border-gray-200 text-gray-500 hover:text-brand hover:border-brand disabled:opacity-40"
                >
                  <Wand2 size={15} />
                </button>
              </div>

              {willRename && (
                <p className="text-[11px] text-amber-600 mt-1.5">
                  سيُحفظ باسم «{clean}» — حروف لا تصلح في أسماء الملفات
                </p>
              )}
              {bad.map((p, k) => (
                <p key={k} className="text-[11px] text-red-600 mt-1">
                  {p.text}
                </p>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
