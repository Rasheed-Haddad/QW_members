import { useDispatch, useSelector } from "react-redux";
import { Link, useLocation } from "react-router-dom";
import { setActiveTab, toggleSidebar } from "../store/uiSlice";
import { FileTextIcon, Wallet } from "lucide-react";

const Sidebar = () => {
  const dispatch = useDispatch();
  const location = useLocation();
  const { sidebarOpen } = useSelector((state) => state.ui);

  const menuItems = [
    {
      id: "exams",
      label: "المواد",
      icon: <FileTextIcon size={20} />,
      path: "/exams",
    },
    {
      id: "earnings",
      label: "أرباحي",
      icon: <Wallet size={20} />,
      path: "/earnings",
    },
  ];

  // دالة إغلاق الـ sidebar على الموبايل
  const handleLinkClick = (itemId) => {
    dispatch(setActiveTab(itemId));
    // إغلاق الـ sidebar على شاشات الموبايل فقط
    if (window.innerWidth < 768 && sidebarOpen) {
      dispatch(toggleSidebar());
    }
  };

  // دالة إغلاق الـ sidebar عند النقر على الـ overlay
  const handleOverlayClick = () => {
    if (sidebarOpen) {
      dispatch(toggleSidebar());
    }
  };

  return (
    <>
      {/* Overlay للموبايل */}
      {sidebarOpen && (
        <div
          dir="rtl"
          className="fixed inset-0 bg-black/50 z-[9] md:hidden"
          onClick={handleOverlayClick}
        />
      )}

      {/* Sidebar */}
      <aside
        dir="rtl"
        className={`fixed top-0 right-0 h-full bg-brand text-white transition-all duration-200 z-10 ${
          sidebarOpen ? "w-44 sm:w-48 md:w-52" : "w-0 md:w-12 hidden md:block"
        }`}
      >
        <nav className="mt-4 sm:mt-6">
          <ul className="space-y-1.5 sm:space-y-2 pl-1.5 sm:pl-2">
            {menuItems.map((item) => {
              const isActive =
                location.pathname === item.path ||
                (location.pathname.startsWith(`${item.path}/`) &&
                  item.path !== "/");
              return (
                <li key={item.id}>
                  <Link
                    to={item.path}
                    className={`flex items-center pl-3 sm:px-4 py-2.5 sm:py-3 rounded-l-md transition-colors ${
                      isActive
                        ? "bg-white text-brand"
                        : "text-white hover:bg-gray-700"
                    }`}
                    onClick={() => handleLinkClick(item.id)}
                  >
                    <span className="ml-2 flex-shrink-0">{item.icon}</span>
                    {sidebarOpen && (
                      <span className="text-sm sm:text-base">{item.label}</span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </aside>
    </>
  );
};

export default Sidebar;
