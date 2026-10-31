import axios from "axios";
import { API_BASE_URL, getEmployerId, PASSWORD } from "../../../config";

// ─── تفريغ تسجيل صوتي ─────────────────────────────────────────────────────────
// البايتات تذهب من المتصفّح إلى Google مباشرةً، ولا تمرّ بخادمنا إطلاقاً.
//
// لماذا؟ تسجيل ساعة ≈ 60م.ب. مروره بخادمنا يعني: ترميز base64 في المتصفّح
// (79م.ب نصّاً في الذاكرة)، ورفعه إلى Render عبر شبكةٍ قد تكون بطيئة
// (Network Error)، ثم ~198م.ب في ذاكرة Render التي سعتها 512 (502).
//
// الآن: خادمنا يطلب رابط رفعٍ من Google بمفتاحه، ويسلّمه للمتصفّح. الرابط
// تصريحٌ في ذاته فلا يتسرّب المفتاح، والبايتات تُرسَل خاماً بلا base64.

const POLL_MS = 3000;
const POLL_MAX = 200; // ~10 دقائق: معالجة Google لتسجيلٍ طويل تأخذ وقتاً

/**
 * يرفع ملفاً (صوتاً أو PDF أو صورة) إلى Gemini Files وينتظر جاهزيته.
 * مشترك بين التفريغ الصوتي وتفريغ الدورات.
 * يعيد { fileName, uri, mimeType }.
 */
export const uploadGeminiFile = async (
  file,
  { onStage, onProgress, label = "الملف" } = {},
) => {
  // ١+٢) الرفع: البايتات خاماً إلى خادمنا، وهو يمرّرها مجرىً إلى Google.
  // المباشر من المتصفّح مستحيل: Google لا يرسل ترويسات CORS على رابط الرفع.
  onStage?.(`جارٍ رفع ${label}…`);
  let up;
  try {
    up = await axios.post(`${API_BASE_URL}/production/transcribe-upload`, file, {
      headers: {
        "Content-Type": file.type || "application/octet-stream",
        "X-Panel-Password": PASSWORD,
        // الرفع مجرىً خام لا JSON، فلا يمرّ بالاعتراض الذي يحقن هوية العضو
        // في الجسم — تُرسَل في ترويسة
        "X-Employer-Id": getEmployerId() || "",
        "X-Audio-Mime": file.type || "audio/mpeg",
        "X-Audio-Name": encodeURIComponent(file.name || "file"),
      },
      timeout: 0, // رفع 60م.ب على شبكةٍ بطيئة يتجاوز أي مهلة افتراضية
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      onUploadProgress: (e) => {
        if (e.total) onProgress?.(Math.round((e.loaded / e.total) * 100));
      },
    });
  } catch (e) {
    const d = e?.response?.data;
    if (e?.response?.status === 404) {
      throw new Error(
        "مسار الرفع غير موجود على الخادم — ادفع الخادم أو انتظر اكتمال النشر.",
      );
    }
    throw new Error(
      [d?.message, d?.detail].filter(Boolean).join(" — ") ||
        e.message ||
        `تعذّر رفع ${label}`,
    );
  }

  const fileName = up.data?.fileName;
  if (!fileName) throw new Error("لم يُعِد Google معرّف الملف");

  // ٣) الانتظار حتى تكتمل معالجته
  onStage?.(`Google يعالج ${label}…`);
  let state = up.data?.state;
  let uri = up.data?.uri;
  for (let i = 0; i < POLL_MAX && state === "PROCESSING"; i++) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, POLL_MS));
    // eslint-disable-next-line no-await-in-loop
    const st = await axios.post(`${API_BASE_URL}/production/transcribe-status`, {
      PASSWORD,
      fileName,
    });
    state = st.data?.state;
    uri = st.data?.uri || uri;
    if (st.data?.error) throw new Error(st.data.error);
    onStage?.(`Google يعالج ${label}… (${i + 1})`);
  }
  if (state !== "ACTIVE") {
    throw new Error(`الملف لم يجهز (${state || "?"}) — أعد المحاولة`);
  }
  return { fileName, uri, mimeType: up.data?.mimeType || file.type };
};

/** حذف الملف من Google — فشله لا يهمّ: Google يحذفه تلقائياً بعد 48 ساعة */
export const cleanupGeminiFile = (fileName) =>
  axios
    .post(`${API_BASE_URL}/production/transcribe-cleanup`, { PASSWORD, fileName })
    .catch(() => {});

/**
 * @param {File} file            الملف الصوتي
 * @param {object} opts          { model, prompt, onStage, onProgress }
 */
export const transcribeAudio = async (
  file,
  { model, prompt, onStage, onProgress, cost } = {},
) => {
  const { fileName, uri, mimeType } = await uploadGeminiFile(file, {
    onStage,
    onProgress,
    label: "التسجيل",
  });

  // ٤) التفريغ — الجسم صغير، لكن الرد يستغرق دقائق
  onStage?.("جارٍ التفريغ — قد يستغرق دقائق حسب طول التسجيل…");
  try {
    const r = await axios.post(
      `${API_BASE_URL}/production/transcribe-run`,
      { PASSWORD, fileUri: uri, mimeType: mimeType || "audio/mpeg", model, prompt, cost },
      { timeout: 15 * 60 * 1000 },
    );
    return r.data;
  } finally {
    // التنظيف في كل الأحوال — لا نترك تسجيلات المقرَّر على خوادم Google
    cleanupGeminiFile(fileName);
  }
};
