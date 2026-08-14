import { PDFDocument } from "pdf-lib";
import { openForView } from "./pdfEngine";

// ─── ضغط PDF ──────────────────────────────────────────────────────────────────
// منقول عن compressPDF في PDF.html بعياراته نفسها.
//
// الطريقة: كل صفحة تُرسَم على canvas ثم تُحقن صورةً JPEG في مستند جديد.
// وهذا يعني أمرين لا بدّ من قولهما صراحةً:
//   • التوفير كبير (70–85% على المقررات المصوَّرة) لأن الصور تُعاد ترميزها.
//   • **طبقة النصّ تُفقَد**: الصفحة تصير صورة. لا بحث ولا تحديد ولا نسخ.
// لا يضرّنا هنا لأن الوجهة مسحٌ ضوئي (Mistral يقرأ الصور أصلاً)، لكنه
// يعني ألّا يُستعمل هذا الملف نسخةً نهائية للطالب.

export const LEVELS = {
  light: {
    key: "light",
    label: "خفيف — أعلى جودة",
    hint: "يحفظ التفاصيل الدقيقة · توفير أقلّ",
    scale: 1.5,
    quality: 0.9,
  },
  medium: {
    key: "medium",
    label: "متوسط",
    hint: "توازن بين الحجم والوضوح",
    scale: 1.0,
    quality: 0.7,
  },
  strong: {
    key: "strong",
    label: "قوي — أصغر حجماً",
    hint: "قد تخفت الحروف الصغيرة",
    scale: 0.8,
    quality: 0.5,
  },
};

/**
 * يضغط ملف PDF ويعيد {bytes, before, after, saved}.
 * onProgress(done, total) لأن مقرَّراً من 300 صفحة يستغرق دقيقة أو أكثر.
 */
export const compressPdf = async (bytes, levelKey = "light", onProgress) => {
  const L = LEVELS[levelKey] || LEVELS.light;
  const pdf = await openForView(bytes);
  const out = await PDFDocument.create();

  try {
    for (let i = 1; i <= pdf.numPages; i++) {
      onProgress?.(i - 1, pdf.numPages);
      // eslint-disable-next-line no-await-in-loop
      const page = await pdf.getPage(i);
      const vp = page.getViewport({ scale: L.scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.floor(vp.width));
      canvas.height = Math.max(1, Math.floor(vp.height));
      // خلفية بيضاء: JPEG بلا شفافية، وبدونها تصير الشفافية سوداء
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      // eslint-disable-next-line no-await-in-loop
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      page.cleanup();

      // eslint-disable-next-line no-await-in-loop
      const blob = await new Promise((r) =>
        canvas.toBlob(r, "image/jpeg", L.quality),
      );
      canvas.width = 0;
      canvas.height = 0;
      if (!blob) throw new Error(`تعذّر ترميز الصفحة ${i}`);

      // eslint-disable-next-line no-await-in-loop
      const jpg = new Uint8Array(await blob.arrayBuffer());
      // eslint-disable-next-line no-await-in-loop
      const img = await out.embedJpg(jpg);
      out.addPage([vp.width, vp.height]).drawImage(img, {
        x: 0,
        y: 0,
        width: vp.width,
        height: vp.height,
      });

      // نفسح للمتصفّح كي يرسم التقدّم — بدونه تتجمّد الواجهة صامتة
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 0));
    }
    onProgress?.(pdf.numPages, pdf.numPages);
  } finally {
    pdf.destroy?.();
  }

  const result = await out.save();
  return {
    bytes: result,
    before: bytes.length,
    after: result.length,
    saved: bytes.length ? 1 - result.length / bytes.length : 0,
    pages: out.getPageCount(),
  };
};

export const fmtMB = (n) => `${(n / 1024 / 1024).toFixed(1)} م.ب`;
