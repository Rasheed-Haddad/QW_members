import { createContext, useContext, useMemo, useReducer, useRef } from "react";

// ─── حالة خط الإنتاج ──────────────────────────────────────────────────────────
// تسع خطوات تتشارك الحالة. قرار معماري صريح: **لا تدخل هذه الحالة Redux**.
//
// السبب: الحمولات هنا ثنائية وضخمة — عشرات الميغابايت من بايتات PDF وصور.
// Redux يفترض قيماً قابلة للتسلسل، وأدواته تستنسخ الحالة لتعرضها، فوضع
// Uint8Array فيها يجمّد المتصفّح ويلوّث سجلّ الإجراءات.
//
// لذلك: الوصف (أسماء، أعداد، حالات) في useReducer، والبايتات في ref خارج
// دورة الرسم تماماً — لا يقارنها React ولا يستنسخها أحد.

const PipelineCtx = createContext(null);

export const STEPS = [
  { key: "split", n: 1, label: "تقسيم المقرر" },
  { key: "ocr", n: 2, label: "المسح الضوئي" },
  { key: "spell", n: 3, label: "التدقيق الإملائي" },
  { key: "review", n: 4, label: "المراجعة النهائية" },
  { key: "summary", n: 5, label: "الملخص" },
  { key: "questions", n: 6, label: "الأسئلة" },
  { key: "flash", n: 7, label: "البطاقات" },
  { key: "written", n: 8, label: "الاختبار التحريري" },
  { key: "save", n: 9, label: "الحفظ النهائي" },
];

const initialState = {
  step: "split",
  furthest: "split", // أبعد خطوة بُلغت — للتنقّل رجوعاً بلا فقدان
  // الخطوة 1
  sourceFiles: [], // [{name, size, pages}]
  mode: null, // "single" | "keep" | "merge"
  pageCount: 0,
  boundaries: [], // حدود الملفات الأصلية بعد الدمج
  ranges: [],
  lectures: [], // ناتج الخطوة 1: [{id, name, start, end, pages, size}]
  markdown: {}, // ناتج الخطوة 2: lectureId → نصّ ماركداون
  // الأصل الخام قبل التنظيف والتدقيق — مرجع المقارنة البصرية.
  // بدونه لا سبيل للحكم على تصحيحٍ مشتبه به إلا بفتح المقرَّر الورقي.
  original: {},
  // المادة الهدف تُختار في خطوة المراجعة وتستعملها خطوات الرفع بعدها
  target: null, // {subjectId, name, section, lectures[]}
  error: null,
};

function reducer(state, a) {
  switch (a.type) {
    case "reset":
      return { ...initialState };
    case "step": {
      const order = STEPS.map((s) => s.key);
      const furthest =
        order.indexOf(a.step) > order.indexOf(state.furthest)
          ? a.step
          : state.furthest;
      return { ...state, step: a.step, furthest, error: null };
    }
    case "source":
      return {
        ...state,
        sourceFiles: a.files,
        mode: a.mode,
        pageCount: a.pageCount ?? state.pageCount,
        boundaries: a.boundaries ?? [],
        ranges: a.ranges ?? state.ranges,
        lectures: [],
      };
    case "ranges":
      return { ...state, ranges: a.ranges };
    case "lectures":
      return { ...state, lectures: a.lectures };
    case "target":
      return { ...state, target: a.target };
    case "markdown":
      return {
        ...state,
        markdown: { ...state.markdown, ...a.markdown },
        original: a.original
          ? { ...state.original, ...a.original }
          : state.original,
      };
    case "error":
      return { ...state, error: a.error };
    default:
      return state;
  }
}

export function PipelineProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  // مخزن البايتات: خارج حالة React عمداً (انظر أعلى الملف).
  const bin = useRef({
    merged: null, // Uint8Array للمستند الموحَّد
    lectures: new Map(), // id → Uint8Array
  });

  const api = useMemo(
    () => ({
      state,
      dispatch,
      setMerged: (bytes) => {
        bin.current.merged = bytes;
      },
      getMerged: () => bin.current.merged,
      setLectureBytes: (id, bytes) => bin.current.lectures.set(id, bytes),
      getLectureBytes: (id) => bin.current.lectures.get(id),
      clearBinaries: () => {
        bin.current.merged = null;
        bin.current.lectures.clear();
      },
      totalBytes: () => {
        let n = bin.current.merged?.length || 0;
        bin.current.lectures.forEach((v) => {
          n += v.length;
        });
        return n;
      },
    }),
    [state],
  );

  return <PipelineCtx.Provider value={api}>{children}</PipelineCtx.Provider>;
}

export const usePipeline = () => {
  const ctx = useContext(PipelineCtx);
  if (!ctx) throw new Error("usePipeline خارج PipelineProvider");
  return ctx;
};
