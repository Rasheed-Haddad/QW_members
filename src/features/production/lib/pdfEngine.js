import * as pdfjsLib from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.js?url";
import { PDFDocument } from "pdf-lib";

// ─── محرّك PDF ────────────────────────────────────────────────────────────────
// pdf.js للعرض (رسم الصفحات واستخراج النص)، وpdf-lib للقصّ والدمج.
//
// العامل (worker) يُستورد بـ?url لا برابط CDN: اللوحة تعمل داخل Electron من
// بروتوكول file:// وبلا إنترنت أحياناً، والأداة المرجعية كانت تموت صامتةً
// إذا تعذّر الوصول إلى cdnjs. وvite.config.ts يضبط base:"./" فيخرج المسار
// نسبياً ويعمل تحت file:// كما يعمل في التطوير.
pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export const PDFJS_VERSION = pdfjsLib.version;

// ─── موارد الخطوط والترميز ────────────────────────────────────────────────────
// سببُ الحروف المقطوشة في المقررات العربية: مستندٌ لا يُضمّن خطّه (وهو
// الغالب في ملفات Word المصدَّرة) يحتاج خطوط pdf.js المعيارية، ومستندٌ
// بترميز CID يحتاج جداول CMap. بلا هذين يرسم pdf.js ما استطاع من رسومٍ
// بديلة فتخرج الحروف مبتورةً أو غائبة — وهو عطبٌ في الرسم لا في الملف،
// ولذلك لم تُصلحه زيادةُ الدقّة.
//
// الموارد منسوخة إلى public/pdfjs لا مجلوبة من CDN: اللوحة تعمل داخل
// Electron من بروتوكول file:// وبلا إنترنت أحياناً.
//
// المسار يُحلّ على أساس المستند: base:"./" في vite يُخرج مساراً نسبياً،
// وpdf.js يطلب هذه الموارد من العامل (worker) حيث لا معنى للنسبيّ.
const assetBase = (() => {
  try {
    return new URL("pdfjs/", document.baseURI).href;
  } catch {
    return "pdfjs/";
  }
})();

export const STANDARD_FONTS_URL = `${assetBase}standard_fonts/`;
export const CMAP_URL = `${assetBase}cmaps/`;

/** يفتح مستنداً للعرض. يُعاد استعماله لكل الصفحات — فتحه لكل صفحة يهدر الذاكرة. */
export const openForView = async (data) => {
  // نسخة مستقلة: pdf.js يستولي على المخزن المؤقت (transferable) فيصير
  // فارغاً عند pdf-lib بعدها — ومن هنا تأتي أخطاء «detached ArrayBuffer».
  const copy = data.slice(0);
  return pdfjsLib.getDocument({
    data: copy,
    standardFontDataUrl: STANDARD_FONTS_URL,
    cMapUrl: CMAP_URL,
    cMapPacked: true,
    // useSystemFonts **معطَّل عن قصد**، ولا يُعاد تشغيله:
    // يُسلّم الرسم إلى خطّ النظام بدل برنامج الخطّ المُضمَّن في الملف، فتُمرَّر
    // إليه فهارس رسومٍ (glyph indices) لا معنى لها إلا في الخطّ الأصلي. في
    // اللاتينية يمرّ الأمر؛ وفي العربية ينكسر التشكيل ووصلُ الحروف — وهو
    // عين ما ظهر في المقررات: العناوين سليمة (خطّها مُضمَّن) والمتن مقطّع.
    useSystemFonts: false,
    // خطوط pdf.js المعيارية لاتينية بحتة (Foxit وLiberation) ولا رسمَ عربياً
    // فيها. فإن لم يُضمّن الملف خطّه، فلا بديل سليم — نُبقي الرسم على
    // برنامج الخطّ إن وُجد بدل السقوط إلى بديلٍ يشوّه.
    disableFontFace: false,
    // لا نُوقف الرسم على أوّل خطٍّ معطوب: المقرَّر الواحد قد يخلط خطوطاً،
    // وإسقاط الصفحة كلّها من أجل واحدٍ منها يُخفي المقروءَ مع غيره.
    stopAtErrors: false,
  }).promise;
};

/** يرسم صفحة على canvas بعرضٍ مستهدف، ويعيد أبعادها.
 *  نحدّ كثافة البكسل: 400 صفحة × dpr=2 تتجاوز نصف جيغابايت. */
export const renderPageToCanvas = async (pdf, pageNum, canvas, targetWidth = 150) => {
  const page = await pdf.getPage(pageNum);
  const base = page.getViewport({ scale: 1 });
  // الحرف العربي يُقرأ بتفاصيله (النقاط والهمزات والتشكيل)، وهي أوّل ما
  // يضيع في التخفيض. dpr=1.5 كان يقشط رؤوس الحروف فتبدو مقطوشة؛ ونصف
  // بكسلٍ في المعامل يوقع الرسم بين شبكتين فيتلطّخ الخط. لذلك نُدوّر إلى
  // عددٍ صحيح ولا ننزل تحت 2.
  const dpr = Math.max(2, Math.round(window.devicePixelRatio || 1));
  const scale = (targetWidth / base.width) * dpr;
  const viewport = page.getViewport({ scale });
  canvas.width = Math.max(1, Math.round(viewport.width));
  canvas.height = Math.max(1, Math.round(viewport.height));
  // العرض من الـCSS والارتفاع بنسبة الصفحة نفسها. تركه "auto" داخل صندوق
  // ذي aspect-ratio ثابت يجعل المتصفّح يمطّ اللوحة إلى ارتفاع الصندوق،
  // فتُشوّه الحروف رأسياً — وهذا سبب «القطش» في شبكة التقسيم.
  canvas.style.width = "100%";
  canvas.style.height = "auto";
  canvas.style.aspectRatio = `${viewport.width} / ${viewport.height}`;
  const ctx = canvas.getContext("2d", { alpha: false });
  // خلفية بيضاء صريحة: صفحات PDF كثيرة بلا خلفية، وبغيرها يُرسم النصّ
  // الأسود على شفافٍ فيبدو باهتاً فوق رمادي الشبكة.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const task = page.render({ canvasContext: ctx, viewport, background: "#ffffff" });
  await task.promise;
  page.cleanup();
  return { width: targetWidth, height: Math.round(viewport.height / dpr) };
};

/** يفحص خطوط صفحة: أمُضمَّنةٌ هي أم بديلة؟
 *  الحروف المقطوشة في المقررات العربية سببها خطٌّ غير مُضمَّن يسقط pdf.js
 *  معه إلى بديلٍ لاتيني لا رسمَ عربياً فيه. هذا يقولها صراحةً بدل التخمين:
 *  إن ظهر loadedName بلا fontFile فالملف نفسه ناقص، ولا يُصلحه إعدادُ عرض.
 *  يُستدعى من الكونسول: window.__pdfFonts(pdf, 1) */
export const inspectPageFonts = async (pdf, pageNum = 1) => {
  const page = await pdf.getPage(pageNum);
  const ops = await page.getOperatorList();
  const out = [];
  const seen = new Set();
  const objs = page.commonObjs?._objs || {};
  Object.keys(objs).forEach((k) => {
    const d = objs[k]?.data;
    if (!d || !d.loadedName || seen.has(d.loadedName)) return;
    seen.add(d.loadedName);
    out.push({
      name: d.name || d.loadedName,
      embedded: Boolean(d.data || d.file),
      type: d.mimetype || d.type || "?",
      vertical: Boolean(d.vertical),
    });
  });
  page.cleanup();
  void ops;
  return out;
};

/** نسبة ارتفاع الصفحة إلى عرضها — لتثبيت أبعاد الشبكة قبل الرسم فلا تقفز. */
export const pageAspect = async (pdf, pageNum = 1) => {
  const page = await pdf.getPage(pageNum);
  const v = page.getViewport({ scale: 1 });
  page.cleanup();
  return v.height / v.width;
};

/** أول سطر نصّي ذي معنى في صفحة — لاقتراح اسم المحاضرة.
 *  يفشل بهدوء في المقررات الممسوحة ضوئياً (لا طبقة نص) فنعيد "". */
export const firstMeaningfulLine = async (pdf, pageNum) => {
  try {
    const page = await pdf.getPage(pageNum);
    const tc = await page.getTextContent();
    page.cleanup();
    // نجمع العناصر في أسطر بحسب الإحداثي الرأسي
    const lines = new Map();
    tc.items.forEach((it) => {
      const y = Math.round(it.transform[5]);
      if (!lines.has(y)) lines.set(y, []);
      lines.get(y).push(it.str);
    });
    const ordered = [...lines.entries()].sort((a, b) => b[0] - a[0]);
    for (const [, parts] of ordered) {
      const s = parts.join(" ").replace(/\s+/g, " ").trim();
      // نتخطّى أرقام الصفحات ورؤوس الصفحات القصيرة
      if (s.length >= 4 && !/^[\d\s.\-–—/]+$/.test(s)) return s.slice(0, 90);
    }
    return "";
  } catch {
    return "";
  }
};

/** يدمج ملفات في مستند واحد، ويعيد معه حدود كل ملف أصلي.
 *  الحدود تُعرض على الشبكة: المستخدم يحتاج أن يرى أين كان الملف ينتهي
 *  حتى بعد الدمج — تلك معلومة يملكها هو ولا نملكها نحن. */
export const mergeFiles = async (files) => {
  const out = await PDFDocument.create();
  const boundaries = [];
  let cursor = 1;
  for (const f of files) {
    const bytes = await f.arrayBuffer();
    const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const idx = src.getPageIndices();
    const pages = await out.copyPages(src, idx);
    pages.forEach((p) => out.addPage(p));
    boundaries.push({ file: f.name, start: cursor, end: cursor + idx.length - 1 });
    cursor += idx.length;
  }
  const bytes = await out.save();
  return { bytes, boundaries, pageCount: cursor - 1 };
};

/** يقصّ نطاقاً واحداً إلى مستند مستقل.
 *  التحويل 1-based → 0-based يحدث هنا وحده في كل المشروع. */
export const cutRange = async (srcDoc, start, end) => {
  const total = srcDoc.getPageCount();
  const s = Math.max(1, Math.min(start, total));
  const e = Math.max(s, Math.min(end, total));
  const indices = [];
  for (let i = s; i <= e; i++) indices.push(i - 1);
  const doc = await PDFDocument.create();
  const pages = await doc.copyPages(srcDoc, indices);
  pages.forEach((p) => doc.addPage(p));
  return doc.save();
};

export const loadForCutting = (bytes) =>
  PDFDocument.load(bytes, { ignoreEncryption: true });

/** يقصّ كل النطاقات. onProgress(done, total, name) لأن قصّ 40 محاضرة
 *  يستغرق ثوانيَ، والصمت فيها يبدو تعليقاً. */
export const cutAll = async (bytes, ranges, onProgress) => {
  const src = await loadForCutting(bytes);
  const out = [];
  for (let i = 0; i < ranges.length; i++) {
    const r = ranges[i];
    onProgress?.(i, ranges.length, r.name);
    const cut = await cutRange(src, r.start, r.end);
    out.push({
      id: r.id,
      name: r.name,
      start: r.start,
      end: r.end,
      pages: r.end - r.start + 1,
      bytes: cut,
      size: cut.length,
    });
    // نفسح للمتصفّح كي يرسم شريط التقدّم — بدونه تتجمّد الواجهة صامتة
    await new Promise((res) => setTimeout(res, 0));
  }
  onProgress?.(ranges.length, ranges.length, "");
  return out;
};

export const bytesOfFile = async (file) => new Uint8Array(await file.arrayBuffer());

export const formatSize = (n) => {
  if (!n) return "0 ب";
  const u = ["ب", "ك.ب", "م.ب", "غ.ب"];
  const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / 1024 ** i).toFixed(i ? 1 : 0)} ${u[i]}`;
};
