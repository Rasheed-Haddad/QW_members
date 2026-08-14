// ─── حرّاس التصحيح الإملائي ───────────────────────────────────────────────────
// منقولة عن spellcheck.py حرفاً بحرف. كل شرط هنا ثمنُ خطأٍ وقع فعلاً:
// النموذج «صحّح» أرقاماً ومصطلحات وقلب كلمات سليمة إلى أخرى.
//
// المبدأ: النموذج يقترح، والقواعد ترفض. الترك أأمن من التغيير.

const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";

const hasDigit = (s) =>
  [...String(s)].some((c) => /\d/.test(c) || AR_DIGITS.includes(c));

// ─── نسبة التشابه: خوارزمية Ratcliff-Obershelp نفسها التي في difflib ──────────
// ليست مسافة Levenshtein. النسبة = 2×(مجموع الكتل المتطابقة) ÷ (مجموع الطولين)،
// والكتل تُوجَد بالتكرار: أطول كتلة، ثم أطول كتلة يمينها، ثم يسارها.
// استبدالها بـLevenshtein يغيّر أي التصحيحات تُقبل، وهو ما ضُبطت عتبته عليه.

const longestMatch = (a, b, alo, ahi, blo, bhi) => {
  let besti = alo;
  let bestj = blo;
  let bestsize = 0;
  let j2len = new Map();
  for (let i = alo; i < ahi; i++) {
    const next = new Map();
    for (let j = blo; j < bhi; j++) {
      if (b[j] === a[i]) {
        const k = (j2len.get(j - 1) || 0) + 1;
        next.set(j, k);
        if (k > bestsize) {
          besti = i - k + 1;
          bestj = j - k + 1;
          bestsize = k;
        }
      }
    }
    j2len = next;
  }
  return [besti, bestj, bestsize];
};

export const similarity = (aStr, bStr) => {
  const a = String(aStr);
  const b = String(bStr);
  if (!a.length && !b.length) return 1;
  if (!a.length || !b.length) return 0;
  let total = 0;
  const queue = [[0, a.length, 0, b.length]];
  while (queue.length) {
    const [alo, ahi, blo, bhi] = queue.pop();
    const [i, j, k] = longestMatch(a, b, alo, ahi, blo, bhi);
    if (k) {
      total += k;
      if (alo < i && blo < j) queue.push([alo, i, blo, j]);
      if (i + k < ahi && j + k < bhi) queue.push([i + k, ahi, j + k, bhi]);
    }
  }
  return (2 * total) / (a.length + b.length);
};

// ─── الطبقات الأربع ───────────────────────────────────────────────────────────

/** هل هذا تصحيح إملائي فعلاً؟ يعيد {ok, reason}. */
export const isSafeCorrection = (before, after) => {
  const b = String(before || "").trim();
  const a = String(after || "").trim();

  if (!b || !a) return { ok: false, reason: "فارغ" };
  if (b === a) return { ok: false, reason: "بلا تغيير" };
  if (b.includes(" ") && a.includes(" ") && b.split(/\s+/).length > 3) {
    return { ok: false, reason: "عبارة طويلة لا كلمة" };
  }

  // أي مساس بالأرقام مرفوض: الأرقام معلومات لا إملاء
  if (hasDigit(b) || hasDigit(a)) return { ok: false, reason: "يمسّ رقماً" };

  // حارسان أُزيلا بقرار صريح:
  //   • المصطلحات اللاتينية — النموذج الحالي أقدر على تمييزها.
  //   • عتبة التشابه 55% — المسح الضوئي يُخرج أحياناً كلمات مشوّهة تحتاج
  //     إعادة بناءٍ لا تعديل حرف، وكانت العتبة ترفضها.
  // الأمان لم يعد يعتمد عليهما: كل اقتراح يُعرض للمراجعة اليدوية قبل
  // التطبيق، وحارس فرق الطول أدناه ما زال يوقف الاستبدالات المتطرفة.

  // تبديل الحرف الأول يقلب الكلمة إلى أخرى مختلفة تماماً في العربية
  // («بحلول ← يحلول»، «الفواصل ← الفواصد»): النموذج يخمّن لا يصحّح.
  if (b.length > 2 && a.length > 2 && b[0] !== a[0] && b.length === a.length) {
    const hamza = new Set(["أ", "ا", "إ", "آ"]);
    if (!(hamza.has(b[0]) && hamza.has(a[0]))) {
      return { ok: false, reason: "تبديل الحرف الأول" };
    }
  }

  // فرق الطول الكبير يعني حذفاً أو إضافةً لا تصحيحاً
  if (Math.abs(b.length - a.length) > Math.max(3, b.length * 0.5)) {
    return { ok: false, reason: "فرق طول كبير" };
  }

  return { ok: true, reason: "" };
};

/** الطبقة الرابعة: كلمة شائعة في المادة نفسها سليمة غالباً.
 *  «الطباع» و«المشيئة» عربيتان صحيحتان؛ تحويلهما إلى «الضباع» و«المشيقة»
 *  تخريب لا إصلاح. تواتر الكلمة في المقرَّر أصدق من ظنّ النموذج. */
export const isSafeInContext = (before, counts) => {
  const b = String(before || "").trim();
  const n = counts?.[b] || 0;
  if (n >= 4) return { ok: false, reason: `كلمة متكررة في المادة (${n} مرة)` };
  return { ok: true, reason: "" };
};

/** تواتر كلمات النص — نفس نمط بايثون [ء-ي]{2,} */
export const countWords = (text) => {
  const counts = {};
  const re = /[ء-ي]{2,}/g;
  let m;
  // eslint-disable-next-line no-cond-assign
  while ((m = re.exec(String(text || "")))) {
    counts[m[0]] = (counts[m[0]] || 0) + 1;
  }
  return counts;
};

/** يفرز اقتراحات النموذج إلى مقبولة ومرفوضة مع السبب.
 *  المرفوضة تُعرض أيضاً: قد تكون أدرى من القاعدة في حالةٍ بعينها. */
export const screenCorrections = (corrections, fullText) => {
  const counts = countWords(fullText);
  const accepted = [];
  const rejected = [];
  const seen = new Set();

  corrections.forEach((c) => {
    // تكرار نفس (سطر، قبل، بعد) لا يفيد — النموذج يعيده أحياناً
    const key = `${c.line}|${c.before}|${c.after}`;
    if (seen.has(key)) return;
    seen.add(key);

    // حذف سطرٍ دخيل (بسملة، ترويسة كلية، رقم صفحة) عمليةٌ أخرى غير تصحيح
    // كلمة، فحرّاس الكلمات لا تنطبق عليها: فرق الطول كامل بطبيعته، وكلمات
    // الترويسة تتكرر في كل صفحة فيرفضها حارس التواتر. تمرّ للمراجعة اليدوية
    // مباشرةً — وهي معروضة للمحرِّر قبل التطبيق على أي حال.
    const isLineOp = c.kind === "line" || !String(c.after ?? "").trim();
    if (isLineOp) {
      accepted.push({ ...c, reason: "", kind: "line" });
      return;
    }

    const s1 = isSafeCorrection(c.before, c.after);
    if (!s1.ok) {
      rejected.push({ ...c, reason: s1.reason });
      return;
    }
    const s2 = isSafeInContext(c.before, counts);
    if (!s2.ok) {
      rejected.push({ ...c, reason: s2.reason });
      return;
    }
    accepted.push({ ...c, reason: "" });
  });

  return { accepted, rejected };
};

/** يطبّق التصحيحات على النص. من آخر سطر لأوّله كي لا تتغيّر الفهارس،
 *  ويتخطّى ما لم يعد موجوداً بدل أن يستبدل موضعاً خاطئاً. */
export const applyCorrections = (text, corrections) => {
  const lines = String(text || "").split("\n");
  let applied = 0;
  let skipped = 0;
  [...corrections]
    .sort((x, y) => Number(y.line) - Number(x.line))
    .forEach((c) => {
      const ln = Number(c.line);
      if (!Number.isFinite(ln) || ln < 0 || ln >= lines.length) {
        skipped += 1;
        return;
      }
      if (!lines[ln].includes(c.before)) {
        skipped += 1;
        return;
      }
      const next = lines[ln].replace(c.before, c.after);
      // حذف سطرٍ دخيل كاملاً (بسملة، ترويسة، رقم صفحة): الاستبدال بفراغ
      // يترك سطراً خالياً مكانه، فتتراكم فجوات في النصّ. نُسقط السطر نفسه.
      if (!next.trim() && lines[ln].trim()) {
        lines.splice(ln, 1);
      } else {
        lines[ln] = next;
      }
      applied += 1;
    });
  return { text: lines.join("\n"), applied, skipped };
};

/** يقطّع النص إلى دفعات أسطر مرقّمة — الترقيم هو ما يعيده النموذج،
 *  فلا بدّ أن يطابق فهرس السطر في النص الأصلي تماماً. */
export const CHUNK_LINES = 120;

export const buildChunks = (text, size = CHUNK_LINES) => {
  const lines = String(text || "").split("\n");
  const chunks = [];
  for (let start = 0; start < lines.length; start += size) {
    const slice = lines.slice(start, start + size);
    // نتخطّى الدفعات الفارغة تماماً — استدعاء بلا نصّ يهدر من الحصة
    if (!slice.some((l) => l.trim())) continue;
    chunks.push({
      from: start,
      to: Math.min(start + size, lines.length) - 1,
      text: slice.map((l, i) => `${start + i}: ${l}`).join("\n"),
    });
  }
  return chunks;
};
