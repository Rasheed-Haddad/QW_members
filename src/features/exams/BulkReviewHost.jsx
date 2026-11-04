import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { SpellAction } from "../production/components/AiActions";
import { CostScope } from "../production/lib/costScope";
import {
  applyReview,
  bulkBytes,
  closeReview,
  usePendingReviews,
  useReviewing,
} from "./bulkEngine";

// ─── مراجعة تدقيقٍ جرى في الخلفية ─────────────────────────────────────────────
// تُفتح من العلامة النابضة بجانب اسم المحاضرة (أو من نافذة المعالجة) بالتصحيحات
// المحفوظة نفسها — بلا تدقيقٍ جديد. «طبّق» يحفظ النصّ ويبدأ التوليد بالخلفية؛
// الإغلاق بلا تطبيق يُبقيها معلّقةً تنبض حتى تعود إليها.

export default function BulkReviewHost({ subjectId, subjectName }) {
  const lid = useReviewing(subjectId);
  const pending = usePendingReviews(subjectId);
  const entry = lid ? pending[lid] : null;
  const textRef = useRef("");
  // الملف الأصلي في ذاكرة الجلسة؛ بعد تحديث الصفحة يُختار من العارض
  const [picked, setPicked] = useState({});

  if (!entry) return null;
  const runKey = `${lid}:${entry.at}`;

  return createPortal(
    <CostScope.Provider value={{ exam_id: subjectId, lecture_id: lid }}>
      <SpellAction
        key={runKey}
        autoRunKey={runKey}
        hideTrigger
        preset={entry.raw}
        allowApplyNone
        text={entry.text}
        onText={(t) => {
          textRef.current = t;
        }}
        pdfBytes={bulkBytes(subjectId, lid) || picked[lid] || null}
        onPdfBytes={(b) => setPicked((p) => ({ ...p, [lid]: b }))}
        onFinish={(applied) => {
          if (applied) applyReview(subjectId, lid, textRef.current, subjectName);
          else closeReview(subjectId);
        }}
      />
    </CostScope.Provider>,
    document.body,
  );
}
