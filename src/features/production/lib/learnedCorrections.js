// ─── ذاكرة التصحيحات المقبولة ─────────────────────────────────────────────────
// يُحفَظ ما **قبِلته أنت** وحده — لا ما اقترحه النموذج. وقد تكون عدّلت
// «الآن» قبل القبول، فالمحفوظ هو صيغتك النهائية لا صيغته.
//
// تُقدَّم للنموذج **استئناساً لا قاعدة**: الكلمة نفسها قد ترد في سياق آخر
// يكون فيه الأصل صحيحاً، وإلزامه بالتصحيح يحوّل خطأً واحداً إلى خطأ دائم.
// لذلك يقول الموجّه صراحةً: «إن لم يقبل السياق التصحيح هنا، تجاهله».
//
// المخزن localStorage: الملف محليّ بطبيعته — تجربتك أنت على جهازك، ولا
// معنى لمشاركتها بين محرّرين قد يختلف مجالهم.

const STORE = "spell_learned_v1";
const MAX = 400; // سقف: الموجّه لا يحتمل أكثر، والأقدم أقلّ صلة

const load = () => {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE) || "[]");
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
};

const save = (list) => {
  try {
    localStorage.setItem(STORE, JSON.stringify(list.slice(-MAX)));
  } catch {
    // امتلاء المخزن لا يُفشل التدقيق
  }
};

/** كل الأزواج المتعلَّمة، الأحدث آخراً */
export const getLearned = () => load();

/** الأزواج التي تُرسَل للنموذج: بلا تكرار، الأحدث أولاً */
export const learnedForPrompt = (limit = 60) => {
  const seen = new Set();
  const out = [];
  for (let i = load().length - 1; i >= 0 && out.length < limit; i--) {
    const x = load()[i];
    const k = `${x.before}→${x.after}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ before: x.before, after: x.after });
  }
  return out;
};

/** يسجّل ما قُبل فعلاً. `count` يرتفع للزوج المتكرّر — تكراره يرفع ثقته. */
export const recordAccepted = (corrections) => {
  if (!Array.isArray(corrections) || !corrections.length) return;
  const list = load();
  const index = new Map(list.map((x, i) => [`${x.before}→${x.after}`, i]));
  corrections.forEach((c) => {
    const before = String(c.before || "").trim();
    const after = String(c.after || "").trim();
    if (!before || !after || before === after) return;
    const k = `${before}→${after}`;
    if (index.has(k)) {
      const it = list[index.get(k)];
      it.count = (it.count || 1) + 1;
      it.at = Date.now();
    } else {
      list.push({ before, after, count: 1, at: Date.now() });
      index.set(k, list.length - 1);
    }
  });
  save(list);
};

/** يحذف زوجاً بعينه. المفتاح before→after لا الفهرس: القائمة تُفرز في
 *  العرض، والفهرس المعروض لا يطابق فهرس المخزن فيُحذف الخطأ غير المقصود. */
export const forgetPair = (before, after) => {
  const k = `${String(before || "").trim()}→${String(after || "").trim()}`;
  const next = load().filter(
    (x) => `${String(x.before || "").trim()}→${String(x.after || "").trim()}` !== k,
  );
  try {
    localStorage.setItem(STORE, JSON.stringify(next));
  } catch {
    // امتلاء المخزن لا يُفشل الحذف المنطقي
  }
  return next;
};

/** يحذف عدّة أزواج دفعةً واحدة — لتنظيفٍ بعد مراجعةٍ بالجملة */
export const forgetMany = (pairs) => {
  const kill = new Set(
    (pairs || []).map(
      (p) => `${String(p.before || "").trim()}→${String(p.after || "").trim()}`,
    ),
  );
  const next = load().filter(
    (x) => !kill.has(`${String(x.before || "").trim()}→${String(x.after || "").trim()}`),
  );
  try {
    localStorage.setItem(STORE, JSON.stringify(next));
  } catch {
    // لا شيء
  }
  return next;
};

export const clearLearned = () => {
  try {
    localStorage.removeItem(STORE);
  } catch {
    // لا شيء
  }
};

/** تصدير ملف JSON — لتنقله بين أجهزتك أو تراجعه بعينك */
export const exportLearned = () => {
  const blob = new Blob([JSON.stringify(load(), null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "تصحيحات-متعلَّمة.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
};

/** استيراد ملف سابق — يُدمج ولا يستبدل */
export const importLearned = async (file) => {
  const txt = await file.text();
  const incoming = JSON.parse(txt);
  if (!Array.isArray(incoming)) throw new Error("ملف غير صالح");
  recordAccepted(incoming);
  return incoming.length;
};
