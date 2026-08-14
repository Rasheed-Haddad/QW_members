// ─── تنظيف الرؤوس والأذيال والزوائد ───────────────────────────────────────────
// منقول عن clean_headers.py حرفاً بحرف.
//
// يُنفَّذ **قبل** التدقيق الإملائي عمداً: ترك الرؤوس يُغري النموذج بـ«تصحيحها»
// فيشتّت حكمه ويستهلك الحصة، ثم تظهر للطالب ضجيجاً.
//
// القواعد قاطعة لا نموذجية: التكرار يكشف الترويسة بلا ذكاء اصطناعي.

const MIN_REPEATS = 3; // أقلّ تكرار يجعل السطر مشتبهاً به
const MAX_LINE_LEN = 90; // الرأس/الذيل سطر قصير؛ الفقرة الطويلة محتوى
const MIN_LINE_LEN = 2;

const PAGE_MARK = /^\s*=+\s*صفحة\s*[\d٠-٩]+\s*=+\s*$/;
const NON_TEXT = /^\s*\[?Non-?Text\]?\s*$/i;
const BARE_NUM = /^\s*[\d٠-٩]{1,4}\s*$/;
// «سطر بلا أي كلمة». الأصل البايثوني يكتبها ^[\W\d_]+$ وتعمل صحيحاً هناك
// لأن re في بايثون3 يعمل بـUnicode: الحرف العربي يطابق \w فلا يطابق \W.
//
// في JS الأمر معكوس: \W تعني «ليس [A-Za-z0-9_]» فالعربية كلها تطابقها،
// وحرفيّةُ النقل كانت تحذف كل سطر عربي في المحاضرة.
// الصياغة الصحيحة: السطر لا يحوي أيّ حرفٍ من أي لغة (\p{L}).
const NO_WORDS = /^[^\p{L}]+$/u;

/** توحيد للمقارنة: مسافات مضغوطة وتشكيل محذوف */
const norm = (s) =>
  String(s || "")
    .replace(/[ً-ْـ]/g, "")
    .replace(/\s+/g, " ")
    .trim();

/** الأسطر المتكرّرة كثيراً — رؤوس وأذيال بحكم تكرارها */
export const findBoilerplate = (text) => {
  const counts = new Map();
  String(text || "")
    .split("\n")
    .forEach((ln) => {
      const s = norm(ln);
      if (s.length >= MIN_LINE_LEN && s.length <= MAX_LINE_LEN) {
        counts.set(s, (counts.get(s) || 0) + 1);
      }
    });
  const out = new Set();
  counts.forEach((c, s) => {
    if (c >= MIN_REPEATS) out.add(s);
  });
  return out;
};

/** يعيد {text, stats} — الإحصاء يُعرض فيرى المستخدم ما حُذف قبل قبوله */
export const cleanHeaders = (text) => {
  const boiler = findBoilerplate(text);
  const stats = {
    page_marks: 0,
    non_text: 0,
    page_numbers: 0,
    boilerplate: 0,
    symbols: 0,
  };
  const out = [];

  String(text || "")
    .split("\n")
    .forEach((ln) => {
      const s = ln.trim();
      const n = norm(ln);

      if (PAGE_MARK.test(s)) {
        stats.page_marks += 1;
        return;
      }
      if (NON_TEXT.test(s)) {
        stats.non_text += 1;
        return;
      }
      if (BARE_NUM.test(s)) {
        stats.page_numbers += 1;
        return;
      }

      // سطر متكرّر: رأس أو ذيل — ما لم يكن عنواناً أو صفَّ جدول أو صورة.
      // صفوف الجداول تتكرّر بطبيعتها (رؤوس أعمدة مُعادة عبر الصفحات)
      // وهي محتوى لا ترويسة، فحذفها يمزّق الجدول.
      const protectedLine =
        s.startsWith("#") || s.includes("|") || s.startsWith("![");
      if (boiler.has(n) && !protectedLine) {
        stats.boilerplate += 1;
        return;
      }

      // سطر بلا أي كلمة (رموز/أرقام فقط) وقصير.
      // يُستثنى ما فيه «|»: فاصل الجدول `| --- | --- |` رموزٌ كلّه،
      // وحذفه يُبطل الجدول فيصير صفوفاً مبعثرة.
      if (s && s.length <= 20 && !s.includes("|") && NO_WORDS.test(s)) {
        stats.symbols += 1;
        return;
      }

      out.push(ln);
    });

  const cleaned = `${out.join("\n").replace(/\n{3,}/g, "\n\n").trim()}\n`;
  const removed =
    stats.page_marks +
    stats.non_text +
    stats.page_numbers +
    stats.boilerplate +
    stats.symbols;
  return { text: cleaned, stats, removed };
};

/** وصف عربي لما حُذف — للعرض في الواجهة */
export const describeClean = (stats) =>
  [
    stats.boilerplate && `${stats.boilerplate} رأس/ذيل متكرّر`,
    stats.page_marks && `${stats.page_marks} علامة صفحة`,
    stats.page_numbers && `${stats.page_numbers} رقم صفحة`,
    stats.symbols && `${stats.symbols} سطر رموز`,
    stats.non_text && `${stats.non_text} Non-Text`,
  ]
    .filter(Boolean)
    .join(" · ");
