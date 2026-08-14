import axios from "axios";
import { preparePageImages, rewriteMarkdown, joinPages } from "./imagePipeline";
import { cleanHeaders } from "./cleanHeaders";
import { API_BASE_URL, PASSWORD } from "../../../config";

// ─── مسح محاضرة واحدة ─────────────────────────────────────────────────────────
// المفتاح يُدخله المستخدم في الواجهة عمداً: منصّة Mistral تُبطل المفاتيح كل
// ساعة تقريباً فهو يتجدّد باستمرار وليس سرّاً يستحق خزنةً في الخادم.
//
// الرفع **مباشر دائماً** من المتصفّح إلى Mistral. لا وسيط.
//
// كان هنا تحوّلٌ تلقائي إلى وسيطٍ عبر خادمنا عند أي خطأ بلا استجابة، وكان
// عطباً مركّباً:
//   • Mistral يسمح بالمتصفّح صراحةً (access-control-allow-origin: *)،
//     فالتحوّل لم يكن مبرَّراً أصلاً.
//   • حالة الناقل كانت على مستوى الوحدة، فانقطاعٌ لحظي واحد يثبّت الوسيط
//     لبقية الجلسة.
//   • ومنذ ذلك، كل ملف يمرّ بـRender مضخَّماً 33% بـbase64، فيصطدم بحدّ
//     جسم الطلب (10م.ب) ويردّ 413 — وعتبة الملف الفعلية تصير 7.5م.ب
//     بدل حدّ Mistral (50م.ب)، مع استنزاف صامت للخطة المجانية.
// الفشل الآن يفشل ويقول سببه، ولا يمرّ بخادمنا خِلسة.

const MISTRAL = "https://api.mistral.ai/v1";

export const OCR_MODEL = "mistral-ocr-latest";

const directUpload = async (apiKey, fileName, bytes) => {
  const form = new FormData();
  form.append("purpose", "ocr");
  form.append("file", new Blob([bytes], { type: "application/pdf" }), fileName);
  const up = await axios.post(`${MISTRAL}/files`, form, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const signed = await axios.get(`${MISTRAL}/files/${up.data.id}/url?expiry=24`, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
  });
  return { file_id: up.data.id, url: signed.data.url };
};

const directOcr = async (apiKey, documentUrl, model) => {
  const r = await axios.post(
    `${MISTRAL}/ocr`,
    {
      model: model || OCR_MODEL,
      document: { type: "document_url", document_url: documentUrl },
      include_image_base64: true,
    },
    { headers: { Authorization: `Bearer ${apiKey}` } },
  );
  return r.data;
};

// ─── الرفع إلى R2 ─────────────────────────────────────────────────────────────

export const checkR2 = async () => {
  try {
    const r = await axios.post(`${API_BASE_URL}/production/r2-status`, {
      PASSWORD,
    });
    return r.data;
  } catch {
    return { ready: false };
  }
};

/** يرفع الصور على دفعات: الحمولة الواحدة قد تتجاوز حدّ جسم الطلب،
 *  والفشل عندها يضيع كل صور المحاضرة لا صورةً واحدة. */
const uploadImages = async (subject, images, onNote) => {
  if (!images.length) return { urls: {}, uploaded: 0, deduped: 0 };
  const BATCH = 8;
  const urls = {};
  let uploaded = 0;
  let deduped = 0;
  for (let i = 0; i < images.length; i += BATCH) {
    const slice = images.slice(i, i + BATCH);
    // eslint-disable-next-line no-await-in-loop
    const r = await axios.post(`${API_BASE_URL}/production/upload-images`, {
      PASSWORD,
      subject,
      images: slice,
    });
    if (r.data?.disabled) {
      onNote?.(r.data.message);
      return { urls: {}, uploaded: 0, deduped: 0, disabled: true };
    }
    Object.assign(urls, r.data?.urls || {});
    uploaded += r.data?.uploaded || 0;
    deduped += r.data?.deduped || 0;
  }
  return { urls, uploaded, deduped };
};

// ─── العملية الكاملة ──────────────────────────────────────────────────────────

/**
 * يمسح محاضرةً واحدة ويعيد الماركداون النهائي بروابط الصور في مواضعها.
 * onStage(text) يبثّ ما يجري — المسح يستغرق دقائق والصمت فيها يبدو تعليقاً.
 */
export const scanLecture = async ({
  apiKey,
  subject,
  name,
  bytes,
  model,
  onStage,
  withImages = true,
}) => {
  const stats = { uploaded: 0, deduped: 0 };
  const fileName = `${name || "lecture"}.pdf`;

  // ١) الرفع والتوقيع — إلى Mistral مباشرةً
  const MB = 1024 * 1024;
  if (bytes.length > 50 * MB) {
    throw new Error(
      `الملف ${(bytes.length / MB).toFixed(1)} م.ب ويتجاوز حدّ Mistral (50 م.ب). اضغطه أو قسّمه.`,
    );
  }
  onStage?.("جارٍ رفع الملف إلى Mistral…");
  const signed = await directUpload(apiKey, fileName, bytes);

  // ٢) المسح
  onStage?.("جارٍ المسح الضوئي…");
  const resp = await directOcr(apiKey, signed.url, model);

  const pages = resp?.pages || [];
  if (!pages.length) throw new Error("لم يُعِد Mistral أي صفحة");

  // ٣) الصور: ترشيح ← رفع ← استبدال الإشارات، صفحةً صفحة
  const mds = [];
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    let md = page?.markdown || "";
    if (withImages) {
      onStage?.(`الصور: صفحة ${i + 1} من ${pages.length}…`);
      // eslint-disable-next-line no-await-in-loop
      const { ready } = await preparePageImages(page, stats);
      // eslint-disable-next-line no-await-in-loop
      const up = await uploadImages(subject, ready, (m) => onStage?.(m));
      stats.uploaded += up.uploaded;
      stats.deduped += up.deduped;
      const mapping = { ...up.urls };
      // ما أخفق رفعه إلى الخادم: إشارته تُحذف بدل أن تبقى مكسورة في النصّ.
      // هذا **إخفاق رفع** لا حكماً على الصورة — لا ترشيح هنا إطلاقاً.
      ready.forEach((r) => {
        if (!(r.name in mapping)) mapping[r.name] = null;
      });
      if (Object.keys(mapping).length) md = rewriteMarkdown(md, mapping);
      if (up.disabled) stats.imagesDisabled = true;
    }
    mds.push(md);
  }

  // التنظيف بعد التجميع لا قبله: كشف الترويسة يقوم على تكرارها عبر
  // الصفحات، ولا يظهر التكرار إلا بعد ضمّها. وهو قبل التدقيق الإملائي
  // عمداً — ترك الرؤوس يُغري النموذج بـ«تصحيحها» ويستهلك الحصة.
  const joined = joinPages(mds);
  const cleaned = cleanHeaders(joined);
  stats.cleaned = cleaned.stats;
  stats.cleanedLines = cleaned.removed;

  return {
    markdown: cleaned.text,
    rawMarkdown: joined, // الأصل محفوظ إن أردت المقارنة
    pages: pages.length,
    stats,
  };
};
