// ─── عارض ماركداون صغير ───────────────────────────────────────────────────────
// لماذا لا مكتبة جاهزة؟ لأن المعروض هنا ناتج OCR ونموذج لغوي — نصّ غير موثوق
// يُحقن في DOM. مكتبة كاملة تعني سطح هجوم أوسع وتعقيداً لا نحتاجه: المطلوب
// عناوين وفقرات وقوائم وجداول وصور، لا أكثر.
//
// القاعدة الحاكمة: نهرّب HTML أولاً، ثم نبني الوسوم التي نعرفها وحدها.
// فلا يمكن لنصٍّ في المقرَّر أن يُنفّذ شيئاً مهما بدا.

const escapeHtml = (s) =>
  String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/** الروابط المسموحة فقط: http(s) وdata:image. javascript: ممنوع. */
const safeUrl = (u) => {
  const s = String(u || "").trim();
  if (/^https?:\/\//i.test(s)) return s;
  if (/^data:image\//i.test(s)) return s;
  return "";
};

/** نصّ السمة: التهريب وحده يكفي نظرياً، لكن ترك محارف مثل " و= داخل سمةٍ
 *  يجعل سلامة المخرَج معلّقةً على صحة التهريب وحدها ويصعّب تدقيقه.
 *  نصّ الـalt لصورة في مقرَّر زينةٌ لا معنى، فحذف هذه المحارف لا يكلّف شيئاً
 *  ويجعل النتيجة آمنةً بالبناء لا بالثقة. */
const attrText = (s) =>
  escapeHtml(String(s || "").replace(/["'<>=`]/g, "")).slice(0, 120);

const inline = (text) => {
  let s = escapeHtml(text);
  // الصور قبل الروابط: صيغتهما متشابهة والفارق علامة التعجب
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (m, alt, url) => {
    const u = safeUrl(url);
    if (!u) return "";
    return `<img src="${u}" alt="${attrText(alt) || "شكل"}" data-img="${u}" loading="lazy" />`;
  });
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label, url) => {
    const u = safeUrl(url);
    return u
      ? `<a href="${u}" target="_blank" rel="noopener noreferrer">${label}</a>`
      : label;
  });
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
  return s;
};

const isTableRow = (l) => /^\s*\|.*\|\s*$/.test(l);
const isTableSep = (l) => /^\s*\|[\s:|-]+\|\s*$/.test(l);
const cells = (l) =>
  l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());

/** يحوّل ماركداون إلى HTML آمن. */
export const renderMarkdown = (md) => {
  const lines = String(md || "").split("\n");
  const out = [];
  let list = null; // "ul" | "ol"

  const closeList = () => {
    if (list) {
      out.push(`</${list}>`);
      list = null;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // فاصل الصفحات الذي يكتبه خط الإنتاج — نُبرزه ليسهل التطابق مع المقرَّر
    const page = line.match(/^\s*=====\s*صفحة\s*(\d+)\s*=====\s*$/);
    if (page) {
      closeList();
      out.push(
        `<div class="mdpage" data-page="${page[1]}">صفحة ${page[1]}</div>`,
      );
      continue;
    }

    if (!line.trim()) {
      closeList();
      continue;
    }

    // جدول
    if (isTableRow(line) && isTableRow(lines[i + 1] || "") && isTableSep(lines[i + 1])) {
      closeList();
      const head = cells(line);
      i += 2;
      const body = [];
      while (i < lines.length && isTableRow(lines[i])) {
        body.push(cells(lines[i]));
        i += 1;
      }
      i -= 1;
      out.push(
        `<div class="mdtablewrap"><table><thead><tr>${head
          .map((c) => `<th>${inline(c)}</th>`)
          .join("")}</tr></thead><tbody>${body
          .map(
            (r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`,
          )
          .join("")}</tbody></table></div>`,
      );
      continue;
    }

    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      closeList();
      const n = h[1].length;
      out.push(`<h${n}>${inline(h[2])}</h${n}>`);
      continue;
    }

    if (/^\s*[-*+]\s+/.test(line)) {
      if (list !== "ul") {
        closeList();
        out.push("<ul>");
        list = "ul";
      }
      out.push(`<li>${inline(line.replace(/^\s*[-*+]\s+/, ""))}</li>`);
      continue;
    }
    if (/^\s*\d+[.)]\s+/.test(line)) {
      if (list !== "ol") {
        closeList();
        out.push("<ol>");
        list = "ol";
      }
      out.push(`<li>${inline(line.replace(/^\s*\d+[.)]\s+/, ""))}</li>`);
      continue;
    }

    if (/^\s*(---+|___+|\*\*\*+)\s*$/.test(line)) {
      closeList();
      out.push("<hr />");
      continue;
    }

    closeList();
    out.push(`<p>${inline(line)}</p>`);
  }
  closeList();
  return out.join("\n");
};

/** كل روابط الصور بترتيب ورودها — لعرضها وحذفها من لوحة جانبية. */
export const listImages = (md) => {
  const out = [];
  const re = /!\[([^\]]*)\]\(([^)\s]+)\)/g;
  let m;
  // eslint-disable-next-line no-cond-assign
  while ((m = re.exec(String(md || "")))) {
    out.push({ alt: m[1], url: m[2], index: m.index, raw: m[0] });
  }
  return out;
};

/** يحذف إشارة صورة بعينها من النص — وسطرها إن صار فارغاً. */
export const removeImage = (md, url) => {
  const lines = String(md || "").split("\n");
  const out = [];
  let removed = 0;
  for (const line of lines) {
    const stripped = line.replace(
      /!\[([^\]]*)\]\(([^)\s]+)\)/g,
      (whole, alt, u) => {
        if (u === url) {
          removed += 1;
          return "";
        }
        return whole;
      },
    );
    // السطر الذي كان صورةً وحده يُحذف بدل أن يبقى فراغاً
    if (stripped !== line && !stripped.trim()) continue;
    out.push(stripped);
  }
  return { text: out.join("\n"), removed };
};

/** إحصاء سريع للمقارنة مع المقرَّر */
export const stats = (md) => {
  const s = String(md || "");
  const words = s.trim() ? s.trim().split(/\s+/).length : 0;
  return {
    chars: s.length,
    words,
    lines: s.split("\n").length,
    images: listImages(s).length,
    pages: (s.match(/=====\s*صفحة\s*\d+\s*=====/g) || []).length,
  };
};
