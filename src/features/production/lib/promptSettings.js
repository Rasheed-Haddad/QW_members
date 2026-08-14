import axios from "axios";
import { API_BASE_URL, PASSWORD } from "../../../config";
import { CHUNK_LINES } from "./spellGuards";

// ─── الأعداد المحرَّرة من اللوحة ──────────────────────────────────────────────
// حجم دفعة التدقيق كان ثابتاً في الكود؛ صار إعداداً على الخادم. الواجهة
// تقرؤه قبل بدء التدقيق فلا تُقسّم بقيمةٍ غير التي يراها المحرِّر في اللوحة.
//
// يُقرأ مرةً ويُحفَظ: التدقيق يستدعيه لكل محاضرة، واستعلامٌ لكلٍّ منها هدر.
// وتُبطَل النسخة عند الحفظ من لوحة الموجّهات فيسري التعديل بلا إعادة تحميل.

let cached = null;

export const bustSettingsCache = () => {
  cached = null;
};

export const getNumbers = async () => {
  if (cached) return cached;
  try {
    const r = await axios.post(`${API_BASE_URL}/prompts`, { PASSWORD });
    const nums = r.data?.numbers || {};
    cached = {
      spell_chunk_lines:
        Number(nums.spell_chunk_lines?.value) || CHUNK_LINES,
    };
  } catch {
    // تعذّر الجلب لا يمنع التدقيق: نعمل بقيمة المصنع
    cached = { spell_chunk_lines: CHUNK_LINES };
  }
  return cached;
};

/** حجم الدفعة كما ضبطه المحرِّر */
export const chunkLines = async () => (await getNumbers()).spell_chunk_lines;
