import axios from "axios";
import { API_BASE_URL, PASSWORD } from "../../config";

// ─── واجهة الهيكل الموحَّد ────────────────────────────────────────────────────
// كل قراءة وكتابة للمواد تمرّ من هنا. الغرض ألّا يتكرّر شكل الطلب في الشاشات
// فتفترق عند أول تعديل — وهو ما حدث سابقاً حين تكرّر عنوان الخادم في ١٦ ملفاً.
//
// المطابقة بـlecture_id وحده. لا أسماء، لا فهارس، لا مسارات نصّية.

/** نطاقات الجلب — كلٌّ ينقل ما يُستعمل وحده */
export const SCOPE = {
  LIST: "list", // أعداد بلا محتوى (للقائمة ومؤشّر الاكتمال)
  TARFI3: "tarfi3", // ملخص وأسئلة (خطة ترفيع)
  MOADAL: "moadal", // + بطاقات وتحريري، بلا نصوص
  FULL: "full", // كل شيء بما فيه النصوص
};

export const getSubject = async (id, scope = SCOPE.LIST) => {
  const r = await axios.post(`${API_BASE_URL}/v2/subject`, {
    PASSWORD,
    _id: id,
    scope,
  });
  return r.data;
};

/** محاضرة واحدة كاملة — بما فيها نصّ المقرَّر */
export const getLecture = async (id, lectureId) => {
  const r = await axios.post(`${API_BASE_URL}/v2/subject`, {
    PASSWORD,
    _id: id,
    scope: "lecture",
    lecture_id: lectureId,
  });
  return r.data;
};

/** نصّ محاضرة وحده — أخفّ ما يمكن حين لا يُراد غيره */
export const getCurriculum = async (id, lectureId) => {
  const r = await axios.post(`${API_BASE_URL}/v2/subject`, {
    PASSWORD,
    _id: id,
    scope: "curriculum",
    lecture_id: lectureId,
  });
  return r.data;
};

export const listSubjects = async (collegeId) => {
  const r = await axios.post(`${API_BASE_URL}/v2/subjects`, {
    PASSWORD,
    college_id: collegeId,
  });
  return r.data;
};

/** حفظ جزئي: ما لا يُذكر في payload لا يُمَسّ */
export const saveLecture = async (id, lectureId, payload) => {
  const r = await axios.put(`${API_BASE_URL}/v2/lecture/save`, {
    PASSWORD,
    _id: id,
    lecture_id: lectureId,
    payload,
  });
  return r.data;
};

export const addLecture = async (id, name) => {
  const r = await axios.put(`${API_BASE_URL}/v2/lecture/manage`, {
    PASSWORD,
    _id: id,
    action: "add",
    name,
  });
  return r.data;
};

export const removeLecture = async (id, lectureId) => {
  const r = await axios.put(`${API_BASE_URL}/v2/lecture/manage`, {
    PASSWORD,
    _id: id,
    action: "remove",
    lecture_id: lectureId,
  });
  return r.data;
};

export const reorderLectures = async (id, orderedIds) => {
  const r = await axios.put(`${API_BASE_URL}/v2/lecture/manage`, {
    PASSWORD,
    _id: id,
    action: "reorder",
    order: orderedIds,
  });
  return r.data;
};

// ─── ربط نصوص المقرَّرات ──────────────────────────────────────────────────────

export const listUnlinkedTexts = async (search) => {
  const r = await axios.post(`${API_BASE_URL}/v2/texts/unlinked`, {
    PASSWORD,
    search,
  });
  return r.data;
};

export const getTextFull = async (relPath) => {
  const r = await axios.post(`${API_BASE_URL}/v2/texts/full`, {
    PASSWORD,
    rel_path: relPath,
  });
  return r.data;
};

export const linkText = async (relPath, subjectId, lectureId, keepSource) => {
  const r = await axios.put(`${API_BASE_URL}/v2/texts/link`, {
    PASSWORD,
    rel_path: relPath,
    subject_id: subjectId,
    lecture_id: lectureId,
    keep_source: Boolean(keepSource),
  });
  return r.data;
};

// ─── مساعدات مشتركة ──────────────────────────────────────────────────────────

/** الأنواع الخمسة التي تكتمل بها المحاضرة — أساس أهلية «معدل» */
export const PARTS = [
  { key: "curriculum", label: "نص المقرر", color: "#0ea5e9" },
  { key: "summary", label: "الملخص", color: "#8C52FF" },
  { key: "questions", label: "الأسئلة", color: "#f59e0b" },
  { key: "flash", label: "البطاقات", color: "#10b981" },
  { key: "written", label: "التحريري", color: "#ef4444" },
];

/** اكتمال محاضرة من صيغة النطاق list (أعداد) أو من الكائن الكامل */
export const completeness = (l) => ({
  curriculum:
    l.has_curriculum ?? Boolean(String(l.curriculum?.text || "").trim()),
  summary:
    (l.summary_sections ?? (l.summary?.sections || []).length) > 0,
  questions: (l.questions_count ?? (l.questions || []).length) > 0,
  flash: (l.flash_count ?? (l.flash_cards || []).length) > 0,
  written:
    (l.written_count ?? (l.written_exam?.questions || []).length) > 0,
});

export const completedCount = (l) =>
  Object.values(completeness(l)).filter(Boolean).length;

/** المادة مؤهّلة لـ«معدل» إن اكتملت كل محاضراتها */
export const moadalReady = (lectures) =>
  (lectures || []).length > 0 &&
  lectures.every((l) => completedCount(l) === 5);
