// ─── موضوع التركيز المبدئي للبطاقات والتحريري ─────────────────────────────────
// الحقل يُملأ تلقائياً بهذه القيمة في نوافذ التوليد وفي «معالجة الكل».
// زرّ «تجديد» تحت الحقل يحفظ ما فيه ليصير هو المبدئي في المرات القادمة.
// محليٌّ في هذا الجهاز (تفضيلُ محرِّر لا بيانات مادة).

const KEY = "generate_focus_defaults_v1";

export const FACTORY_FOCUS = {
  flash: "قلل الأرقام والنسب وركز على المعلومات المهمة",
  written: "تعداد, شرح, مقارنة",
};

const read = () => {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}") || {};
  } catch {
    return {};
  }
};

/** kind: "flash" | "written" */
export const getFocusDefault = (kind) => {
  const v = read()[kind];
  return typeof v === "string" ? v : FACTORY_FOCUS[kind] || "";
};

export const setFocusDefault = (kind, value) => {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...read(), [kind]: String(value ?? "") }));
    return true;
  } catch {
    return false;
  }
};
