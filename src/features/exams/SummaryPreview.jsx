import { useMemo } from "react";

// ─── معاينة الملخّص كما يراه الطالب ──────────────────────────────────────────
// منقولة عن `QW/app/(main)/Summary.tsx` كتلةً بكتلة: الألوان والحواف والمسافات
// وترتيب العناصر نفسها. الغرض ألّا يكون بين ما يراه المحرِّر وما يراه الطالب
// فرقٌ يُكتشف بعد النشر.
//
// فرقان مقصودان عن التطبيق:
//   • **قسمٌ واحد متّصل** لا كاروسيل: المحرِّر يراجع الملخّص كلّه دفعةً،
//     والتنقّل بين الشرائح يخفي ما لم يُفتح بعد.
//   • لا ملاحظات زملاء ولا شكاوى: تلك بيانات طلابٍ لا شأن للمعاينة بها.
//
// نوعٌ لا يرسمه التطبيق يُعرض خاماً مع تنبيه — الصمت يخفي خطأً في البيانات
// حتى يراه الطالب.

const txt = (v) => (v === null || v === undefined ? "" : String(v));

const toListItem = (item) => {
  // العنصر قد يأتي نصّاً مجرّداً في ملخّصات قديمة
  if (typeof item === "string") {
    return { text: item, keywords: [], items: [] };
  }
  const it = item || {};
  return {
    text: it.text ?? "",
    keywords: it.keywords ?? [],
    strong: it.strong,
    is_example: it.is_example,
    emoji: it.emoji,
    title: it.title,
    description: it.description,
    type: it.type,
    items: it.items ?? [],
  };
};

const getItemText = (item) =>
  (item && (item.text || item.description)) || "";

// ─── إبراز الكلمات المفتاحية ─────────────────────────────────────────────────
// الأطول أولاً: لو سبقت «قلب» كلمةَ «قلب مفتوح» لالتُقط الجزء وضاع الكل.
function Highlighted({ text, keywords = [], className = "" }) {
  const sorted = useMemo(
    () => (keywords || []).filter(Boolean).slice().sort((a, b) => b.length - a.length),
    [keywords],
  );
  const parts = useMemo(() => {
    if (!text || sorted.length === 0) return null;
    const escaped = sorted.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    return String(text).split(new RegExp(`(${escaped.join("|")})`, "g"));
  }, [text, sorted]);

  if (!text) return null;
  if (!parts) return <span className={className}>{txt(text)}</span>;

  return (
    <span className={className}>
      {parts.map((part, i) =>
        sorted.includes(part) ? (
          <span key={i} className="text-brand font-bold">
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </span>
  );
}

// ─── عنصر القائمة المتداخل ───────────────────────────────────────────────────
function Item({ item, level = 0, showNumber = false, numberIndex = 0 }) {
  const li = toListItem(item);
  return (
    <div className="mb-3">
      <div style={{ paddingInlineStart: level * 20 }}>
        {showNumber && (
          <span className="w-7 h-7 rounded-full bg-brand/10 border border-brand/20 flex items-center justify-center text-brand text-sm mb-2">
            {numberIndex + 1}
          </span>
        )}

        <div className="w-full">
          {li.emoji && <div className="text-2xl mb-1">{li.emoji}</div>}
          {li.title && (
            <div className="text-brand text-sm font-bold mb-1">{txt(li.title)}</div>
          )}
          {li.description && (
            <Highlighted
              text={li.description}
              keywords={li.keywords}
              className="block text-gray-500 text-[15px] leading-relaxed mb-1"
            />
          )}

          {li.is_example ? (
            <div className="bg-brand/5 p-3 rounded border-r-4 border-brand/40 w-full mt-1 shadow-sm">
              <Highlighted
                text={li.text}
                keywords={li.keywords}
                className="block text-gray-800 text-[15px] leading-relaxed"
              />
            </div>
          ) : li.strong ? (
            <div className="mt-2 w-full">
              <span className="inline-flex bg-brand h-8 px-3 rounded-full items-center mb-2 shadow-sm">
                <span className="text-white text-sm font-bold">{txt(li.strong)}</span>
              </span>
              <Highlighted
                text={li.text}
                keywords={li.keywords}
                className="block text-gray-800 text-[15px] leading-relaxed"
              />
            </div>
          ) : li.text !== li.title ? (
            <Highlighted
              text={li.text}
              keywords={li.keywords}
              className="block text-gray-800 text-[15px] leading-relaxed"
            />
          ) : null}
        </div>
      </div>

      {li.items?.length > 0 && (
        <div className="mt-3">
          {li.items.map((nested, i) => (
            <Item key={i} item={nested} level={level + 1} numberIndex={i} />
          ))}
        </div>
      )}
    </div>
  );
}

/** ترويسة الكتلة: إيموجي + عنوان — تتكرّر في أكثر الأنواع.
 *  الأصناف مكتوبةٌ كاملةً لا مركّبةً بقالب: Tailwind يمسح المصدر نصّاً
 *  ولا يولّد صنفاً لم يره حرفياً، فـ`text-${size}` لا يخرج في الحزمة. */
const Head = ({ b }) =>
  b.emoji || b.label || b.title ? (
    <div className="flex items-center gap-2 mb-3">
      {b.emoji && <span className="text-2xl">{b.emoji}</span>}
      {(b.label || b.title) && (
        <span className="text-gray-900 text-base font-bold">
          {txt(b.label ?? b.title)}
        </span>
      )}
    </div>
  ) : null;

const BulletList = ({ b }) => (
  <div className="my-4">
    <Head b={b} />
    {b.text && (
      <Highlighted
        text={b.text}
        keywords={b.keywords ?? []}
        className="block text-gray-500 text-sm mb-3"
      />
    )}
    <div>
      {(b.items ?? []).map((item, i) => (
        <div key={i} className="flex items-start gap-3 px-1 py-1">
          <span className="mt-2.5 w-1.5 h-1.5 rounded-full bg-brand shrink-0" />
          <div className="flex-1 min-w-0">
            <Item item={item} numberIndex={i} />
          </div>
        </div>
      ))}
    </div>
  </div>
);

const ProcessList = ({ b }) => {
  const items = b.items ?? [];
  return (
    <div className="my-6 bg-white rounded border border-black/5 p-5 shadow-sm">
      {(b.emoji || b.label || b.title) && (
        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-black/5">
          {b.emoji && <span className="text-2xl">{b.emoji}</span>}
          {(b.label || b.title) && (
            <span className="text-gray-900 text-lg font-bold">
              {txt(b.label ?? b.title)}
            </span>
          )}
        </div>
      )}
      {b.text && (
        <Highlighted
          text={b.text}
          keywords={b.keywords ?? []}
          className="block text-gray-500 text-sm mb-4"
        />
      )}
      <div>
        {items.map((item, i) => (
          <div key={i} className="flex gap-3">
            {/* العمود: رقمٌ وخطٌّ واصل — تسلسل الخطوات يُقرأ بصرياً */}
            <div className="flex flex-col items-center">
              <span className="w-9 h-9 rounded-full bg-brand flex items-center justify-center shadow-sm shrink-0">
                <span className="text-white text-sm font-bold">{i + 1}</span>
              </span>
              {i < items.length - 1 && (
                <span className="w-0.5 flex-1 bg-brand/15 my-1" />
              )}
            </div>
            <div className="flex-1 min-w-0 pb-5">
              <Item item={item} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const DefinitionBox = ({ b }) => (
  <div className="my-5 bg-white rounded border-r-4 border-brand px-5 py-4 shadow-sm">
    {(b.emoji || b.label || b.title) && (
      <div className="flex items-center gap-2 mb-2">
        {b.emoji && <span className="text-xl">{b.emoji}</span>}
        {(b.label || b.title) && (
          <span className="text-brand text-sm font-bold">
            {txt(b.label ?? b.title)}
          </span>
        )}
      </div>
    )}
    {b.text && (
      <Highlighted
        text={b.text}
        keywords={b.keywords ?? []}
        className="block text-gray-800 text-[15px] leading-7"
      />
    )}
    {b.items?.length > 0 && (
      <div className="mt-3">
        <BulletList b={{ items: b.items }} />
      </div>
    )}
  </div>
);

const HighlightCard = ({ b }) => (
  <div className="my-5 bg-amber-50 rounded overflow-hidden shadow">
    <div className="px-5 pt-4 pb-2 flex items-center gap-2">
      <span className="text-amber-500 text-lg">✦</span>
      {b.emoji && <span className="text-xl">{b.emoji}</span>}
      {(b.badge || b.title) && (
        <span className="text-amber-800 text-sm font-bold">
          {txt(b.badge ?? b.title)}
        </span>
      )}
    </div>
    <div className="px-5 pb-4">
      {b.text && (
        <Highlighted
          text={b.text}
          keywords={b.keywords ?? []}
          className="block text-gray-800 text-[15px] leading-7"
        />
      )}
      {b.items?.length > 0 && (
        <div className="mt-3">
          <BulletList b={{ items: b.items }} />
        </div>
      )}
    </div>
  </div>
);

const InfoBox = ({ b }) => (
  <div className="my-4 bg-white border border-black/5 rounded px-5 py-4 shadow-sm">
    {(b.emoji || b.label || b.title) && (
      <div className="flex items-center gap-2 mb-2">
        {b.emoji && <span className="text-xl">{b.emoji}</span>}
        {(b.label || b.title) && (
          <span className="text-brand text-sm font-bold">
            {txt(b.label ?? b.title)}
          </span>
        )}
      </div>
    )}
    {b.text && (
      <Highlighted
        text={b.text}
        keywords={b.keywords ?? []}
        className="block text-gray-800 text-[15px] leading-7"
      />
    )}
    {b.items?.length > 0 && (
      <div className="mt-3">
        <BulletList b={{ items: b.items }} />
      </div>
    )}
  </div>
);

const WarningBox = ({ b }) => (
  <div className="my-5 bg-red-50 rounded border-r-4 border-red-400 px-5 py-4 shadow-sm">
    <div className="flex items-center gap-2 mb-2">
      {b.emoji ? (
        <span className="text-xl">{b.emoji}</span>
      ) : (
        <span className="text-red-500 text-lg">⚠</span>
      )}
      <span className="text-red-700 text-sm font-bold">
        {txt(b.label ?? b.title ?? b.badge ?? "تنبيه")}
      </span>
    </div>
    {b.text && (
      <Highlighted
        text={b.text}
        keywords={b.keywords ?? []}
        className="block text-gray-800 text-[15px] leading-7"
      />
    )}
    {b.items?.length > 0 && (
      <div className="mt-3">
        <BulletList b={{ items: b.items }} />
      </div>
    )}
  </div>
);

const TwoColumnItem = ({ item, index = 0 }) => {
  const subItems = item?.items ?? [];
  const isEven = index % 2 === 0;
  return (
    <div
      className={`rounded p-4 mb-2 shadow-sm ${
        isEven ? "bg-brand/5" : "bg-white border border-black/5"
      }`}
    >
      {item?.title && (
        <div className="text-brand text-sm font-bold mb-1">{txt(item.title)}</div>
      )}
      {item?.description && (
        <Highlighted
          text={item.description}
          keywords={item.keywords ?? []}
          className="block text-gray-500 text-[15px] leading-7"
        />
      )}
      {subItems.length > 0 && (
        <div className="mt-2 flex flex-col gap-1">
          {subItems.map((sub, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="mt-2 w-1.5 h-1.5 rounded-full bg-brand/50 shrink-0" />
              <div className="flex-1 min-w-0">
                <Item item={sub} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const TwoColumn = ({ b }) => (
  <div className="my-4">
    <Head b={b} />
    {b.text && (
      <Highlighted
        text={b.text}
        keywords={b.keywords ?? []}
        className="block text-gray-500 text-[15px] leading-7 mb-3"
      />
    )}
    {(b.items ?? []).map((item, i) => (
      <TwoColumnItem key={i} item={item} index={i} />
    ))}
  </div>
);

const ItemsGrid = ({ b }) => {
  const items = b.items ?? [];
  // شبكةٌ بلا عناصر وفيها نصّ هي صندوق معلومات فعلياً — كما في التطبيق
  if (items.length === 0 && b.text) return <InfoBox b={b} />;

  return (
    <div className="my-5">
      <Head b={b} />
      {b.text && (
        <Highlighted
          text={b.text}
          keywords={b.keywords ?? []}
          className="block text-gray-500 text-[15px] leading-7 mb-3"
        />
      )}
      <div className="flex flex-col gap-3">
        {items.map((item, i) => {
          const displayText = getItemText(item);
          return (
            <div
              key={i}
              className="bg-white border border-black/5 rounded p-4 w-full shadow-sm"
            >
              <div className="flex items-center gap-2 mb-2">
                {item?.emoji && <span className="text-3xl">{item.emoji}</span>}
                {item?.title && (
                  <span className="text-brand text-base font-bold">
                    {txt(item.title)}
                  </span>
                )}
              </div>
              {displayText && (
                <Highlighted
                  text={displayText}
                  keywords={item?.keywords ?? []}
                  className="block text-gray-500 text-[15px] leading-7"
                />
              )}
              {item?.items?.length > 0 && (
                <div className="mt-2 w-full">
                  {item.items.map((nested, idx) => (
                    <Item key={idx} item={nested} numberIndex={idx} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

const BADGE_STYLES = {
  warning: { container: "bg-orange-100 border-orange-200", text: "text-orange-600" },
  success: { container: "bg-green-100 border-green-200", text: "text-green-600" },
  info: { container: "bg-blue-100 border-blue-200", text: "text-blue-600" },
  default: { container: "bg-brand/10 border-brand/20", text: "text-brand" },
};

const BadgeCard = ({ b }) => {
  const st = BADGE_STYLES[b.style] ?? BADGE_STYLES.default;
  return (
    <div className="my-4">
      {(b.emoji || b.badge) && (
        <span
          className={`inline-flex items-center gap-2 px-4 h-8 rounded-full border shadow-sm ${st.container}`}
        >
          {b.emoji && <span className="text-base">{b.emoji}</span>}
          {b.badge && (
            <span className={`text-sm font-bold ${st.text}`}>{txt(b.badge)}</span>
          )}
        </span>
      )}
      {b.text && (
        <Highlighted
          text={b.text}
          keywords={b.keywords ?? []}
          className="block text-gray-800 text-[15px] leading-7 mt-2"
        />
      )}
      {b.items?.length > 0 && (
        <div className="mt-3">
          <BulletList b={{ items: b.items }} />
        </div>
      )}
    </div>
  );
};

function Block({ b }) {
  if (!b || !b.type)
    return (
      <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-2 py-1 m-0">
        كتلة بلا نوع — لن تظهر للطالب
      </p>
    );

  switch (b.type) {
    case "process_list":
      return <ProcessList b={b} />;
    case "bullet_list":
      return <BulletList b={b} />;
    case "definition":
      return <DefinitionBox b={b} />;
    case "highlight_card":
      return <HighlightCard b={b} />;
    case "info_box":
      return <InfoBox b={b} />;
    case "warning_box":
      return <WarningBox b={b} />;
    case "two_column":
      return <TwoColumn b={b} />;
    case "items_grid":
      return <ItemsGrid b={b} />;
    case "badge_card":
      return <BadgeCard b={b} />;

    case "h3":
      return (
        <div className="mt-8 mb-2">
          <div className="flex flex-col items-center gap-2 mb-4">
            {b.emoji && <span className="text-2xl text-center">{b.emoji}</span>}
            <span className="text-brand text-xl text-center font-bold">
              {txt(b.text)}
            </span>
          </div>
          {b.items?.length > 0 && <BulletList b={{ items: b.items }} />}
        </div>
      );

    case "h4":
      return (
        <div className="mt-6 mb-2 flex flex-col items-center">
          <span className="text-brand text-lg text-center font-bold">
            {b.emoji ? `${b.emoji} ` : ""}
            {txt(b.title ?? b.text)}
          </span>
          {b.items?.length > 0 && (
            <div className="w-full">
              <BulletList b={{ items: b.items }} />
            </div>
          )}
        </div>
      );

    case "paragraph":
      return (
        <div className="my-4 flex flex-col items-center">
          {b.emoji && <span className="text-3xl mb-1 text-center">{b.emoji}</span>}
          {(b.label || b.title) && (
            <span className="text-brand text-lg mb-3 text-center font-bold">
              {txt(b.label ?? b.title)}
            </span>
          )}
          {b.text && (
            <Highlighted
              text={b.text}
              keywords={b.keywords ?? []}
              className="block text-gray-800 text-[15px] leading-8 text-center"
            />
          )}
          {b.items?.length > 0 && (
            <div className="mt-3 w-full">
              <BulletList b={{ items: b.items }} />
            </div>
          )}
        </div>
      );

    default:
      // نوعٌ لا يرسمه التطبيق: نقولها بدل أن تختفي الكتلة عند الطالب
      return (
        <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 my-2">
          <p className="text-xs font-bold text-red-700 m-0">
            نوع غير معروف: {txt(b.type)} — لن يظهر للطالب
          </p>
          <pre
            dir="ltr"
            className="text-[11px] text-gray-600 m-0 mt-1 whitespace-pre-wrap"
          >
            {JSON.stringify(b, null, 1).slice(0, 400)}
          </pre>
        </div>
      );
  }
}

export default function SummaryPreview({ sections }) {
  const list = Array.isArray(sections) ? sections : [];
  if (!list.length)
    return (
      <p className="text-sm text-gray-400 text-center py-8 m-0">
        لا ملخّص بعد — الصق JSON أو ولّده
      </p>
    );

  return (
    // خلفية رمادية خفيفة كخلفية شاشة التطبيق: البطاقات البيضاء لا تُقرأ
    // على أبيض، وقد كانت حدودها هي ما يفصلها وهو ما لا يراه الطالب.
    <div dir="rtl" className="flex flex-col bg-gray-50 rounded-2xl p-4 font-arabic">
      {list.map((sec, i) => {
        const title =
          txt(sec?.title || sec?.section_title || sec?.name) || `قسم ${i + 1}`;
        return (
          <section key={sec?.id || i} className="mb-2">
            {/* فاصلٌ بين الأقسام: التطبيق يفصلها بشرائح الكاروسيل، وهنا
                يتّصل الملخّص كلّه فيلزم ما يدلّ على بداية القسم. */}
            <div className="flex items-center gap-2 mt-6 mb-3 first:mt-0">
              <span className="w-6 h-6 rounded-full bg-brand/10 text-brand text-[11px] font-bold flex items-center justify-center shrink-0">
                {i + 1}
              </span>
              <h3 className="text-base font-bold text-gray-900 m-0">{title}</h3>
              <span className="mr-auto text-[11px] text-gray-400">
                {(sec?.content_blocks || []).length} كتلة
              </span>
            </div>

            {(sec?.content_blocks || []).length === 0 ? (
              <p className="text-xs text-gray-400 m-0">لا كتل محتوى في هذا القسم</p>
            ) : (
              sec.content_blocks.map((b, j) => <Block key={j} b={b} />)
            )}
          </section>
        );
      })}
    </div>
  );
}
