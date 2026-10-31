import { createContext, useContext } from "react";

// ─── لمن تُحسب كلفة الطلب ─────────────────────────────────────────────────────
// كل طلب ذكاءٍ اصطناعي يحمل `cost: { exam_id, lecture_id }` فيسجّل الخادم
// كلفته على المادة والمحاضرة. أدوات المحاضرة (المسح، التدقيق، التوليد…)
// لا تعرف المحاضرة بنفسها، فتقرؤها من هذا السياق الذي تلفّه شاشة المحاضرة.
// ما خرج عن أي سياق يُسجَّل بلا مادة — لا يضيع ولا يُنسب خطأً.

export const CostScope = createContext(null);

/** { exam_id, lecture_id } أو null */
export const useCostScope = () => useContext(CostScope);
