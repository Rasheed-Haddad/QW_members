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

// العيارات مرفوعة عن الأصل المنقول: النصّ العربي يُقرأ بنقاطه وهمزاته
// وتشكيله، وهي أوّل ما يبتلعه JPEG. المقياس دون 1.5 يجعل الحرف الصغير
// أقلّ من بضعة بكسلات فتلتحم نقاطه، والجودة دون 0.75 تُحدث حول الحروف
// تلطّخاً (ringing) يقطع أطرافها. التوفير أقلّ قليلاً — والمقابل أن يبقى
// المقرَّر مقروءاً للعين ولمحرّك المسح الضوئي معاً.
export const LEVELS = {
  light: {
    key: "light",
    label: "خفيف — أعلى جودة",
    hint: "يحفظ التفاصيل الدقيقة · توفير أقلّ",
    scale: 2.0,
    quality: 0.92,
  },
  medium: {
    key: "medium",
    label: "متوسط",
    hint: "توازن بين الحجم والوضوح",
    scale: 1.7,
    quality: 0.85,
  },
  strong: {
    key: "strong",
    label: "قوي — أصغر حجماً",
    hint: "أصغر ما يبقى معه النصّ العربي مقروءاً",
    scale: 1.5,
    quality: 0.75,
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
      // الصفحة تُرسم بمقياس L.scale وتوضع في المستند بمقاسها الأصلي:
      // الرسم فوق المقاس (supersampling) هو ما يحفظ حدّة الحرف بعد الترميز.
      const box = page.getViewport({ scale: 1 });
      const vp = page.getViewport({ scale: L.scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(vp.width));
      canvas.height = Math.max(1, Math.round(vp.height));
      // خلفية بيضاء: JPEG بلا شفافية، وبدونها تصير الشفافية سوداء
      const ctx = canvas.getContext("2d", { alpha: false });
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      // eslint-disable-next-line no-await-in-loop
      await page.render({
        canvasContext: ctx,
        viewport: vp,
        background: "#ffffff",
      }).promise;
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
      // المقاس الأصلي لا مقاس الرسم: الصورة الأكبر تُضغط داخل الصفحة
      // فتزيد كثافة بكسلاتها، ولا تخرج صفحةٌ عملاقة عند scale>1.
      out.addPage([box.width, box.height]).drawImage(img, {
        x: 0,
        y: 0,
        width: box.width,
        height: box.height,
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
