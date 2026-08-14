import { useState } from "react";
import { Code2, Columns2, Eye } from "lucide-react";
import SummaryEditor from "./SummaryEditor";
import SummaryPreview from "./SummaryPreview";

// ─── ملخّص المحاضرة: معاينة + تحرير ──────────────────────────────────────────
// نظير ورشة نصّ المقرَّر، بالمفاتيح نفسها (معاينة/الاثنان/تحرير) — فما يتعلّمه
// المحرِّر في تبويبٍ يعمل في الآخر.
//
// ── علّةٌ أُصلحت هنا ──
// `SummaryEditor` يعمل على **مصفوفة ملخّصات محاضرات**، وكان تبويب الملخّص في
// تعديل المادة يمرّر إليه **مصفوفة أقسامٍ** مباشرةً. فيُقرأ كل قسمٍ على أنه
// محاضرةٌ بلا أقسام: العدّادات أصفار، والأقسام لا تُفتَح للتحرير. لذلك بدا
// تعديل المادة عاجزاً عمّا يفعله خط الإنتاج وهو يستعمل المحرّر نفسه.
//
// نلفّ الأقسام في محاضرةٍ واحدة عند الدخول ونفكّها عند الخروج — نقطة تحويل
// واحدة بدل أن يتذكّر كل مستدعٍ الشكل الصحيح.

const MODES = [
  ["preview", "معاينة", Eye],
  ["split", "الاثنان", Columns2],
  ["edit", "تحرير", Code2],
];

export default function SummaryPane({ sections, onChange }) {
  const [mode, setMode] = useState("split");
  const list = Array.isArray(sections) ? sections : [];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center bg-gray-100 rounded-xl p-1 gap-1">
          {MODES.map(([k, label, Icon]) => (
            <button
              key={k}
              onClick={() => setMode(k)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold ${
                mode === k ? "bg-white text-brand shadow-sm" : "text-gray-500"
              }`}
            >
              <Icon size={13} /> {label}
            </button>
          ))}
        </div>
        <span className="text-[11px] text-gray-400">
          {list.length} قسماً ·{" "}
          {list.reduce((a, s) => a + (s?.content_blocks?.length || 0), 0)} كتلة
        </span>
      </div>

      <div
        className={
          mode === "split"
            ? "grid grid-cols-1 xl:grid-cols-2 gap-3 items-start"
            : ""
        }
      >
        {(mode === "edit" || mode === "split") && (
          <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
            <SummaryEditor
              // اللفّ والفكّ: المحرّر يتوقّع مصفوفة محاضرات
              formData={{ summary: [{ sections: list }] }}
              handleChange={(name, val) => {
                if (name !== "summary") return;
                onChange(val?.[0]?.sections || []);
              }}
            />
          </div>
        )}

        {(mode === "preview" || mode === "split") && (
          <div className="rounded-2xl border border-gray-200 bg-gray-50 p-3 max-h-[70vh] overflow-y-auto">
            <p className="text-xs font-bold text-gray-500 m-0 mb-2">
              كما سيراه الطالب
            </p>
            <SummaryPreview sections={list} />
          </div>
        )}
      </div>
    </div>
  );
}
