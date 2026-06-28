import { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { employer_login, clearAuthError } from "../../store/authSlice";
import { LogIn, AlertCircle, XCircle, Phone, KeyRound } from "lucide-react";

const Login = () => {
  const dispatch = useDispatch();
  const { loading, error } = useSelector((state) => state.auth);

  const [form, setForm] = useState({
    phone_number: "",
    password1: "",
    password2: "",
    password3: "",
  });

  const handleChange = (name, value) => {
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (
      !form.phone_number ||
      !form.password1 ||
      !form.password2 ||
      !form.password3
    ) {
      return;
    }
    dispatch(employer_login(form));
  };

  return (
    <div
      dir="rtl"
      className="min-h-screen flex items-center justify-center bg-gray-50 p-4"
    >
      <div className="w-full max-w-md bg-white rounded-2xl border border-gray-200 shadow-sm p-6 sm:p-8">
        {/* Header */}
        <div className="flex flex-col items-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-brand/10 flex items-center justify-center mb-3">
            <LogIn size={26} className="text-brand" />
          </div>
          <h1 className="text-xl font-bold text-gray-800">تسجيل دخول العضو</h1>
          <p className="text-sm text-gray-500 mt-1">
            أدخل رقم موبايلك والكلمات الثلاث
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
            <div className="flex flex-row items-start gap-3">
              <AlertCircle color="#dc2626" size={20} />
              <span className="flex-1 text-red-600 text-sm">
                {error?.message ?? error}
              </span>
              <button
                type="button"
                onClick={() => dispatch(clearAuthError())}
                className="hover:opacity-70"
              >
                <XCircle color="#f87171" size={18} />
              </button>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Phone */}
          <div>
            <label className="text-xs text-gray-600 mb-1 flex items-center gap-1.5">
              <Phone size={14} /> رقم الموبايل
            </label>
            <input
              type="text"
              value={form.phone_number}
              onChange={(e) => handleChange("phone_number", e.target.value)}
              className="w-full border border-gray-300 p-3 rounded-lg text-sm bg-white focus:outline-none focus:border-brand"
              placeholder="09xxxxxxxx"
              style={{ direction: "ltr", textAlign: "right" }}
            />
          </div>

          {/* 3 passwords */}
          {[1, 2, 3].map((n) => (
            <div key={n}>
              <label className="text-xs text-gray-600 mb-1 flex items-center gap-1.5">
                <KeyRound size={14} /> كلمة المرور {n}
              </label>
              <input
                value={form[`password${n}`]}
                onChange={(e) => handleChange(`password${n}`, e.target.value)}
                className="w-full border border-gray-300 p-3 rounded-lg text-sm bg-white focus:outline-none focus:border-brand"
                placeholder={`••••••`}
              />
            </div>
          ))}

          <button
            type="submit"
            disabled={loading}
            className="bg-brand text-white py-3 rounded-lg font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 mt-2"
          >
            {loading ? "جاري التحقق..." : "تسجيل الدخول"}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;
