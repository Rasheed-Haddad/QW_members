import { useDispatch, useSelector } from "react-redux";
import { toggleSidebar } from "../store/uiSlice";
import { logout } from "../store/authSlice";
import { MenuIcon, LogOut, UserCircle } from "lucide-react";

const Header = () => {
  const dispatch = useDispatch();
  const employer = useSelector((state) => state.auth.employer);

  const handleLogout = () => {
    if (window.confirm("هل تريد تسجيل الخروج؟")) {
      dispatch(logout());
    }
  };

  return (
    <header className="bg-white py-3 px-4 sm:py-4 sm:px-6 border-b border-gray-100">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            onClick={() => dispatch(toggleSidebar())}
            className="p-1.5 sm:p-2 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100 focus:outline-none"
          >
            <MenuIcon size={20} className="text-brand sm:w-5 sm:h-5" />
          </button>
        </div>

        <div className="flex items-center gap-3">
          {employer && (
            <div className="flex items-center gap-1.5 text-gray-700">
              <UserCircle size={18} className="text-brand" />
              <span className="text-sm font-medium">{employer.name}</span>
            </div>
          )}
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-red-50 hover:bg-red-100 transition-colors"
          >
            <LogOut size={16} color="#dc2626" />
            <span className="text-sm font-medium text-red-600">خروج</span>
          </button>
        </div>
      </div>
    </header>
  );
};

export default Header;
