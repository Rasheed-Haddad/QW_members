// ─── معاينة الملخّص كما يراه الطالب ──────────────────────────────────────────
// الملخّص يُحرَّر JSON خاماً — وهو الشكل الوحيد الذي يقبل أنواع الكتل كلّها.
// لكن قراءة JSON لا تُري المحرِّر ما سيراه الطالب: هل ظهر العنوان؟ أوقعت
// القائمة في موضعها؟ أصار الجدول عمودين؟
//
// هذه المعاينة تعرض الأنواع الاثني عشر التي يرسمها تطبيق الطلاب
// (`app/(main)/Summary.tsx`). نوعٌ لا نعرفه يُعرض خاماً مع تنبيه بدل أن
// يُبتلَع صامتاً — الصمت يخفي خطأً في البيانات حتى يراه الطالب.

const txt = (v) => (v === null || v === undefined ? "" : String(v));

function Blocks({ blocks }) {
  const list = Array.isArray(blocks) ? blocks : [];
  if (!list.length)
    return <p className="text-xs text-gray-400 m-0">لا كتل محتوى في هذا القسم</p>;
  return (
    <div className="flex flex-col gap-2.5">
      {list.map((b, i) => (
        <Block key={i} b={b} />
      ))}
    </div>
  );
}

function Block({ b }) {
  if (!b || !b.type)
    return (
      <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-2 py-1 m-0">
        كتلة بلا نوع — لن تظهر للطالب
      </p>
    );

  const items = Array.isArray(b.items) ? b.items : [];

  switch (b.type) {
    case "h3":
      return (
        <h4 className="text-base font-bold text-gray-900 m-0">{txt(b.text)}</h4>
      );
    case "h4":
      return (
        <h5 className="text-sm font-bold text-gray-700 m-0">{txt(b.text)}</h5>
      );
    case "paragraph":
      return (
        <p className="text-sm text-gray-700 leading-8 m-0">{txt(b.text)}</p>
      );

    case "bullet_list":
      return (
        <ul className="m-0 pr-5 flex flex-col gap-1">
          {items.map((it, i) => (
            <li key={i} className="text-sm text-gray-700 leading-7">
              {txt(it?.text ?? it)}
            </li>
          ))}
        </ul>
      );

    case "process_list":
      return (
        <ol className="m-0 pr-5 flex flex-col gap-1">
          {items.map((it, i) => (
            <li key={i} className="text-sm text-gray-700 leading-7">
              {txt(it?.text ?? it)}
            </li>
          ))}
        </ol>
      );

    case "definition":
      return (
        <div className="rounded-xl border border-gray-200 px-3 py-2">
          <span className="text-sm font-bold text-brand">{txt(b.term)}</span>
          <p className="text-sm text-gray-700 m-0 mt-0.5 leading-7">
            {txt(b.text ?? b.description)}
          </p>
        </div>
      );

    case "highlight_card":
      return (
        <div className="rounded-xl bg-brand/5 border border-brand/25 px-3 py-2">
          {b.title && (
            <p className="text-sm font-bold text-brand m-0">{txt(b.title)}</p>
          )}
          <p className="text-sm text-gray-700 m-0 leading-7">{txt(b.text)}</p>
        </div>
      );

    case "info_box":
      return (
        <div className="rounded-xl bg-sky-50 border border-sky-200 px-3 py-2">
          {b.title && (
            <p className="text-sm font-bold text-sky-700 m-0">{txt(b.title)}</p>
          )}
          <p className="text-sm text-gray-700 m-0 leading-7">{txt(b.text)}</p>
        </div>
      );

    case "warning_box":
      return (
        <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2">
          {b.title && (
            <p className="text-sm font-bold text-amber-700 m-0">
              {txt(b.title)}
            </p>
          )}
          <p className="text-sm text-gray-700 m-0 leading-7">{txt(b.text)}</p>
        </div>
      );

    case "two_column":
      return (
        <div className="grid grid-cols-2 gap-2">
          {[b.right, b.left].map((col, i) => (
            <div
              key={i}
              className="rounded-xl border border-gray-200 px-3 py-2 bg-white"
            >
              {col?.title && (
                <p className="text-xs font-bold text-gray-700 m-0 mb-1">
                  {txt(col.title)}
                </p>
              )}
              {Array.isArray(col?.items) ? (
                <ul className="m-0 pr-4 flex flex-col gap-0.5">
                  {col.items.map((it, j) => (
                    <li key={j} className="text-xs text-gray-600 leading-6">
                      {txt(it?.text ?? it)}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-gray-600 m-0 leading-6">
                  {txt(col?.text)}
                </p>
              )}
            </div>
          ))}
        </div>
      );

    case "items_grid":
      return (
        <div className="grid grid-cols-2 gap-2">
          {items.map((it, i) => (
            <div
              key={i}
              className="rounded-xl border border-gray-200 px-3 py-2 bg-white"
            >
              {it?.title && (
                <p className="text-xs font-bold text-gray-800 m-0">
                  {txt(it.title)}
                </p>
              )}
              <p className="text-xs text-gray-600 m-0 leading-6">
                {txt(it?.text ?? it)}
              </p>
            </div>
          ))}
        </div>
      );

    case "badge_card":
      return (
        <div className="rounded-xl border border-gray-200 px-3 py-2 bg-white">
          <div className="flex items-center gap-2">
            {b.badge && (
              <span className="text-[11px] bg-brand text-white rounded-full px-2 py-0.5">
                {txt(b.badge)}
              </span>
            )}
            {b.title && (
              <span className="text-sm font-bold text-gray-800">
                {txt(b.title)}
              </span>
            )}
          </div>
          {b.text && (
            <p className="text-sm text-gray-700 m-0 mt-1 leading-7">
              {txt(b.text)}
            </p>
          )}
        </div>
      );

    default:
      // نوعٌ لا يرسمه التطبيق: نقولها بدل أن تختفي الكتلة عند الطالب
      return (
        <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2">
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
    <div className="flex flex-col gap-4">
      {list.map((sec, i) => (
        <div
          key={sec?.id || i}
          className="rounded-2xl border border-gray-200 bg-white p-3"
        >
          <div className="flex items-center gap-2 mb-2 pb-2 border-b border-gray-100">
            <span className="text-[11px] text-gray-300 font-bold">{i + 1}</span>
            <span className="text-sm font-bold text-gray-900">
              {txt(sec?.title || sec?.section_title || sec?.name) ||
                `قسم ${i + 1}`}
            </span>
            <span className="mr-auto text-[11px] text-gray-400">
              {(sec?.content_blocks || []).length} كتلة
            </span>
          </div>
          <Blocks blocks={sec?.content_blocks} />
        </div>
      ))}
    </div>
  );
}
