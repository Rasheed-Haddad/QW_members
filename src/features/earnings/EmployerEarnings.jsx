import { useEffect, useState } from "react";
import axios from "axios";
import { Loader2, AlertTriangle, RefreshCw } from "lucide-react";
import { API_BASE_URL, PASSWORD } from "../../config";

// ─── أرباح العضو من كل مادة مُسلَّمة له ───────────────────────────────────────
// الصافي = الإيراد − المرتجعات − التكاليف، ونسبة العضو منه.
// الحساب كله في الخادم (`earnings_controller.js`) — هنا عرضٌ فقط.
// اللوحة تمرّر `targetEmployerId`؛ تطبيق الأعضاء لا يمرّره فيأخذ الخادم
// العضو من هويته.

const syp = (v) => (v === null || v === undefined ? "—" : `${Math.round(v).toLocaleString("en")}`);
const usd = (v) => (v ? `$${v >= 1 ? v.toFixed(2) : v.toFixed(3)}` : "$0");

const EmployerEarnings = ({ targetEmployerId }) => {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setBusy(true);
    setError("");
    try {
      const r = await axios.post(`${API_BASE_URL}/earnings/employer`, {
        PASSWORD,
        ...(targetEmployerId ? { target_employer_id: targetEmployerId } : {}),
      });
      setData(r.data);
    } catch (e) {
      setError(e?.response?.data?.message || "تعذّر حساب الأرباح");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetEmployerId]);

  if (!data) {
    return error ? (
      <p className="text-sm text-red-600 p-2">{error}</p>
    ) : (
      <Loader2 className="animate-spin text-gray-400 m-3" />
    );
  }

  const { rows, totals, finance } = data;
  const noRate = rows.some((r) => r.costs_syp === null);
  const unpriced = rows.reduce((s, r) => s + r.unpriced, 0);

  return (
    <div className="space-y-3" dir="rtl">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-2.5">
          <p className="text-[11px] text-green-700">مجموع النسبة ({finance.share_pct}%)</p>
          <p className="text-xl font-bold text-green-800">
            {syp(totals.share)} <span className="text-xs font-normal">ل.س</span>
          </p>
        </div>
        <p className="text-xs text-gray-500 leading-6 flex-1 min-w-[200px]">
          الصافي = الإيراد − المرتجعات − التكاليف (Mistral وGemini وClaude بسعر صرف{" "}
          {finance.usd_rate ? `${finance.usd_rate.toLocaleString("en")} ل.س للدولار` : "غير مضبوط"}
          )، والنسبة {finance.share_pct}% من الصافي.
        </p>
        <button
          onClick={load}
          disabled={busy}
          className="p-2 rounded-lg text-gray-500 hover:bg-gray-100"
          title="تحديث"
        >
          <RefreshCw size={15} className={busy ? "animate-spin" : ""} />
        </button>
      </div>

      {noRate && (
        <div className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          سعر صرف الدولار غير مضبوط، فلا تُحوَّل التكاليف إلى الليرة ولا تُحسب النسبة.
        </div>
      )}
      {unpriced > 0 && (
        <div className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          {unpriced} طلب ذكاء اصطناعي بلا سعر مضبوط لنموذجه — كلفته لم تدخل التكاليف بعد.
        </div>
      )}

      {rows.length === 0 ? (
        <p className="text-sm text-gray-500">لا مواد مُسلَّمة بعد.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-separate border-spacing-y-1 min-w-[720px]">
            <thead>
              <tr className="text-gray-500 text-right">
                <th className="px-2 font-semibold">المادة</th>
                <th className="px-2 font-semibold">ترفيع / معدل</th>
                <th className="px-2 font-semibold">الإيراد</th>
                <th className="px-2 font-semibold">المرتجعات</th>
                <th className="px-2 font-semibold">التكاليف</th>
                <th className="px-2 font-semibold">الصافي</th>
                <th className="px-2 font-bold text-gray-700">النسبة</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.exam_id} className="bg-gray-50">
                  <td className="px-2 py-2 rounded-r-lg font-semibold text-gray-800">{r.name}</td>
                  <td className="px-2 text-gray-600">
                    {r.tarfee_students} / {r.moadal_students}
                  </td>
                  <td className="px-2">{syp(r.revenue)}</td>
                  <td className="px-2 text-red-600">
                    {r.refunds ? `${syp(r.refunds)} (${r.refunds_count})` : "—"}
                  </td>
                  <td className="px-2">
                    {syp(r.costs_syp)}
                    <span className="text-gray-400 mr-1" dir="ltr">
                      {usd(r.costs_usd)}
                    </span>
                  </td>
                  <td className={`px-2 ${r.net !== null && r.net < 0 ? "text-red-600" : ""}`}>
                    {syp(r.net)}
                  </td>
                  <td className="px-2 rounded-l-lg font-bold text-green-700">{syp(r.share)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-bold text-gray-800">
                <td className="px-2 pt-2" colSpan={2}>
                  المجموع (ل.س)
                </td>
                <td className="px-2 pt-2">{syp(totals.revenue)}</td>
                <td className="px-2 pt-2 text-red-600">{syp(totals.refunds)}</td>
                <td className="px-2 pt-2">{syp(totals.costs_syp)}</td>
                <td className="px-2 pt-2">{syp(totals.net)}</td>
                <td className="px-2 pt-2 text-green-700">{syp(totals.share)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
};

export default EmployerEarnings;
