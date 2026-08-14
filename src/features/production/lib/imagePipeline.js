// ─── ضغط صور الـOCR ───────────────────────────────────────────────────────────
// **كل صورة تُرفَع.** لا ترشيح آلي ولا استبعاد بعتبات.
//
// كان هنا مرشّح بعتبات حجمٍ وأبعادٍ ونسبةٍ (منقول عن r2_images.py) يستبعد ما
// ظنّه شعاراً أو خطاً زخرفياً. وقع في الميدان أنه يرفض نحو ثلاثة أرباع الصور
// الصحيحة: مخطّطٌ بخلفية بيضاء يمرّ تحت عتبة البايتات، وشريحةٌ عريضة تتجاوز
// نسبة العرض، وصورةٌ مقصوصة بدقّة تسقط دون حدّ المساحة. وكلفة الخطأ غير
// متماثلة: صورةٌ زائدة يحذفها المحرِّر بنقرة في المعاينة، وصورةٌ مفقودة لا
// يعرف أصلاً أنها كانت هناك حتى يعيد المادة كلّها.
//
// القرار للمحرِّر في خطوة المعاينة والمقارنة، لا لعتبةٍ لا ترى المحتوى.
//
// لماذا في المتصفّح؟ لأنه يملك الصور أصلاً من رد Mistral، والضغط قبل الرفع
// يوفّر الحمولة والتخزين.

export const FILTER = {
  JPEG_QUALITY: 0.82,
  MAX_DIMENSION: 1600, // أكبر من هذا لا يفيد على شاشة هاتف
};

const stripDataUrl = (b64) =>
  b64.includes(",") ? b64.slice(b64.indexOf(",") + 1) : b64;

export const b64ToBytes = (b64) => {
  const bin = atob(stripDataUrl(b64));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

const bytesToB64 = (bytes) => {
  let s = "";
  const CH = 0x8000; // دفعات: String.fromCharCode ينهار على مصفوفة ضخمة
  for (let i = 0; i < bytes.length; i += CH) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  }
  return btoa(s);
};

const loadBitmap = (bytes) =>
  new Promise((resolve, reject) => {
    const blob = new Blob([bytes]);
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("تعذّر فتحها"));
    };
    img.src = url;
  });

/** يصغّر ويضغط — الهدف شاشة هاتف لا طباعة. الفشل لا يمنع الرفع. */
export const optimize = async (bytes, preloaded) => {
  try {
    const img = preloaded || (await loadBitmap(bytes));
    let { naturalWidth: w, naturalHeight: h } = img;
    const m = Math.max(w, h);
    if (m > FILTER.MAX_DIMENSION) {
      const k = FILTER.MAX_DIMENSION / m;
      w = Math.round(w * k);
      h = Math.round(h * k);
    }
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    // خلفية بيضاء: JPEG بلا قناة شفافية، وبدونها تصير الشفافية سوداء
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    const blob = await new Promise((r) =>
      canvas.toBlob(r, "image/jpeg", FILTER.JPEG_QUALITY),
    );
    canvas.width = 0;
    canvas.height = 0;
    if (!blob) return bytes;
    return new Uint8Array(await blob.arrayBuffer());
  } catch {
    return bytes;
  }
};

/** يجهّز صور صفحة للإرسال — **بلا استبعاد**.
 *  ما تعذّر فكّ ترميزه يُرسَل خاماً: قرار الحذف للمحرِّر في المعاينة، وصورةٌ
 *  لا تُفتَح هنا قد تُفتَح عند القارئ. */
export const preparePageImages = async (page, stats) => {
  const ready = [];
  for (const img of page?.images || []) {
    const name = img?.id;
    const b64 = img?.image_base64;
    if (!name || !b64) continue;
    let raw;
    try {
      raw = b64ToBytes(b64);
    } catch {
      continue; // ليست بايتات أصلاً — لا شيء يُرفَع
    }
    if (!raw.length) continue;
    // eslint-disable-next-line no-await-in-loop
    const data = await optimize(raw); // يعيد الخام إن تعذّر الضغط
    stats.bytes = (stats.bytes || 0) + raw.length;
    ready.push({ name, b64: bytesToB64(data) });
  }
  // `rejected` باقٍ في العقد وفارغٌ دائماً: المستدعي يحذف إشارات ما لم يُرفع
  // فعلاً (فشل الخادم مثلاً)، وتغيير شكل الردّ يكسره بلا داعٍ.
  return { ready, rejected: [] };
};

// ─── إعادة كتابة الماركداون ───────────────────────────────────────────────────

/** يستبدل ![img-0.jpeg](img-0.jpeg) برابط R2، ويحذف إشارة ما أخفق رفعه.
 *  الصورة تبقى في موضعها من النص — «كما في الشكل» تحتاج الشكل بجوارها. */
export const rewriteMarkdown = (md, mapping) => {
  const out = String(md || "").replace(
    /!\[([^\]]*)\]\(([^)]+)\)/g,
    (whole, alt, src) => {
      const name = src || alt;
      if (Object.prototype.hasOwnProperty.call(mapping, name)) {
        const url = mapping[name];
        return url ? `![شكل](${url})` : "";
      }
      return whole;
    },
  );
  return collapseRepeatedImages(out);
};

/** يحذف تكرار الصورة نفسها **المتتالي** فقط.
 *
 *  شرائح العرض تحمل شعاراً أو شكلاً ثابتاً في كل شريحة، فيستخرجه الـOCR مرةً
 *  لكل صفحة — نفس الصورة 43 مرة في محاضرة واحدة. التخزين لا يتضرّر (مفتاحه
 *  بصمة المحتوى) لكن القارئ يرى تكراراً بلا معنى.
 *
 *  أما تكرارها بعد شرحٍ مختلف فمقصود غالباً («كما في الشكل السابق») ويبقى. */
export const collapseRepeatedImages = (md) => {
  const IMG = /^\s*!\[[^\]]*\]\(([^)]+)\)\s*$/;
  const out = [];
  let lastUrl = null;
  for (const line of String(md || "").split("\n")) {
    const m = IMG.exec(line);
    if (m) {
      if (m[1] === lastUrl) continue; // نفس الصورة مباشرةً — تُحذف
      lastUrl = m[1];
      out.push(line);
      continue;
    }
    if (line.trim()) lastUrl = null; // نصّ حقيقي يفصل ⇒ التكرار التالي مقصود
    out.push(line);
  }
  return out.join("\n");
};

/** يجمع صفحات الرد في ملف ماركداون واحد — بنفس فاصل الخط الأصلي
 *  حتى تتعرّف عليه أدوات التدقيق والتنظيف اللاحقة. */
export const joinPages = (parts) =>
  parts.map((md, i) => `\n\n===== صفحة ${i + 1} =====\n\n${md}`).join("");
