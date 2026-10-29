import { Loader2 } from "lucide-react";

// ─── زرّ أدوات شريط المقرَّر ──────────────────────────────────────────────────
// شكلٌ واحد لكل الأدوات (مسح، تفريغ، تدقيق، ذاكرة، تقسيم، توليد…): أبيض
// بإطارٍ رمادي، واللون في الأيقونة وحدها. كانت كل أداةٍ بخلفيةٍ ملوّنة فصار
// الشريط فسيفساء يصعب أن تجد فيه ما تريد. لا يلتفّ نصّه ولا ينضغط، فيبقى
// الشريط سطراً واحداً.
export const ToolBtn = ({ icon: Icon, color, children, busy, className = "", ...rest }) => (
  <button
    {...rest}
    className={`shrink-0 whitespace-nowrap text-xs font-semibold rounded-lg px-2.5 py-1.5 flex items-center gap-1.5 border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 hover:border-gray-300 disabled:opacity-40 ${className}`}
  >
    {busy ? (
      <Loader2 size={14} className="animate-spin" style={{ color }} />
    ) : (
      <Icon size={14} style={{ color }} />
    )}
    {children}
  </button>
);

export default ToolBtn;
