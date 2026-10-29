import axios from "axios";

// ─── عنوان الخادم وهوية العضو ─────────────────────────────────────────────────
// شاشات المواد منسوخة من لوحة التحكم **حرفياً**، وهي تستورد `PASSWORD` وترسله
// في كل طلب. الفارق الوحيد يُحقَن هنا في طبقة الشبكة، فلا يُمَسّ منطق شاشةٍ
// واحدة — وأي إصلاح لاحق في اللوحة يُنسَخ كما هو بلا تحويل.

const CLOUD = "https://qaddha-wqdood-employers.onrender.com";

export const API_BASE_URL = import.meta.env?.VITE_API_URL?.trim() || CLOUD;

// ⚠ فارغة عمداً: كلمة اللوحة تفتح كل المواد وكل الطلاب، ولا يجوز أن تُشحن
// في تطبيقٍ يُوزَّع على الأعضاء. صلاحية العضو تأتي من `employer_id` وحده،
// والخادم يتحقّق أن المادة **مُسلَّمة له** قبل أي قراءة أو كتابة.
export const PASSWORD = "";

// هوية العضو الحالي — تُضبَط عند تسجيل الدخول.
// خارج Redux عمداً: الاعتراض أدناه يعمل في كل طلب axios بما فيها ما تطلقه
// الشاشات المنسوخة، وهي لا تعرف متجرنا ولا يصحّ أن تعرفه.
// تُقرأ من المخزن فور تحميل الوحدة لا في تأثيرٍ بعد أوّل رسمة: بعد تحديث
// الصفحة تكون الجلسة مستعادةً والشاشة تطلق طلباتها في الرسمة الأولى، فلو
// انتظرنا useEffect لخرج أوّل طلبٍ بلا هوية فيردّه الخادم 401.
// المفتاح نفسه الذي يكتبه `store/authSlice.js` — إن غُيّر هناك فليُغيَّر هنا.
let CURRENT_EMPLOYER_ID = (() => {
  try {
    const raw = localStorage.getItem("employer_session_v1");
    const e = raw ? JSON.parse(raw) : null;
    return e && e._id ? String(e._id) : null;
  } catch {
    return null;
  }
})();

export const setEmployerId = (id) => {
  CURRENT_EMPLOYER_ID = id ? String(id) : null;
};

export const getEmployerId = () => CURRENT_EMPLOYER_ID;

// ─── الاعتراض ─────────────────────────────────────────────────────────────────
// يُلحق `employer_id` بكل طلبٍ إلى خادمنا، ويحذف `PASSWORD` الفارغة كي لا
// تُقرأ في الخادم على أنها محاولة مصادقة فاشلة.
axios.interceptors.request.use((cfg) => {
  const url = String(cfg.url || "");
  if (!url.startsWith(API_BASE_URL)) return cfg;
  if (!CURRENT_EMPLOYER_ID) return cfg;

  // الجسم قد يكون كائناً (أكثر الطلبات) أو نصّاً/بايتات (رفع الصوت الخام).
  // لا نلمس إلا الكائن الصريح — إلحاق مفتاحٍ ببايتات ملفٍّ يفسده.
  if (cfg.data && typeof cfg.data === "object" && !(cfg.data instanceof FormData)) {
    if (cfg.data instanceof ArrayBuffer || ArrayBuffer.isView(cfg.data)) return cfg;
    if (cfg.data.PASSWORD === "") delete cfg.data.PASSWORD;
    if (cfg.data.employer_id === undefined) {
      cfg.data.employer_id = CURRENT_EMPLOYER_ID;
    }
  } else if (cfg.data === undefined && (cfg.method || "").toLowerCase() !== "get") {
    cfg.data = { employer_id: CURRENT_EMPLOYER_ID };
  }
  return cfg;
});

export default API_BASE_URL;
