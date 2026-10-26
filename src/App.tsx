import { useEffect, useState, type ReactNode } from "react";
import OwnerAccounts from "./views/OwnerAccounts";
import OwnerQuota from "./views/OwnerQuota";
import AdminDoctors from "./views/AdminDoctors";
import AdminResponses from "./views/AdminResponses";
import Login from "./views/Login";
import { clearSession, restoreSession, signOut, type ApiRole, type SignInResponse } from "./lib/auth";
import { cancelRequests } from "./lib/apiClient";
import { touchSession } from "./lib/session";
import ChangePassword from "./views/ChangePassword";

type Role = "owner" | "admin";

function toUiRole(role: ApiRole): Role {
  return role === "ADMIN" ? "owner" : "admin";
}

interface NavItem {
  key: string;
  label: string;
  icon: ReactNode;
  view: ReactNode;
}

const icons = {
  account: <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />,
  quota: <path d="M3 3v18h18M18 17V9M13 17V5M8 17v-3" />,
  doctor: <path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2ZM12 14v4M10 16h4" />,
  board: <path d="M4 4h16v16H4zM4 9h16M9 9v11" />,
};

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

const roleConfig: Record<Role, { brand: string; badge: string; org: string; nav: NavItem[] }> = {
  owner: {
    brand: "완화의료 통합 관리",
    badge: "관리자",
    org: "완화의료 통합관리본부",
    nav: [
      { key: "accounts", label: "완화의료 계정 관리", icon: <Icon>{icons.account}</Icon>, view: <OwnerAccounts /> },
      { key: "quota", label: "고유번호 할당 & 현황", icon: <Icon>{icons.quota}</Icon>, view: <OwnerQuota /> },
    ],
  },
  admin: {
    brand: "완화의료 관리",
    badge: "완화의료",
    org: "소속 의료기관 관리",
    nav: [
      { key: "doctors", label: "의사 관리 & 고유번호 발급", icon: <Icon>{icons.doctor}</Icon>, view: <AdminDoctors /> },
      { key: "responses", label: "통합 응답 결과 게시판", icon: <Icon>{icons.board}</Icon>, view: <AdminResponses /> },
    ],
  },
};

export default function App() {
  const [restored] = useState(restoreSession);
  const [role, setRole] = useState<Role | null>(() => (restored ? toUiRole(restored.role) : null));
  const [mustChangePassword, setMustChangePassword] = useState(() => restored?.mustChangePassword ?? false);
  const [logoutMessage, setLogoutMessage] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);
  const [sessionKey, setSessionKey] = useState(0);
  const [active, setActive] = useState(0);
  const [collapsed, setCollapsed] = useState(false);

  const login = (session: SignInResponse) => {
    setLogoutMessage("");
    setSessionKey((key) => key + 1);
    setRole(toUiRole(session.role));
    setMustChangePassword(session.mustChangePassword);
    setActive(0);
  };

  const clearUi = () => {
    cancelRequests();
    clearSession();
    setRole(null);
    setMustChangePassword(false);
  };

  const logout = async () => {
    setLoggingOut(true);
    const request = signOut();
    setRole(null);
    setMustChangePassword(false);
    const revoked = await request;
    setLogoutMessage(revoked ? "로그아웃되었습니다." : "브라우저에서 로그아웃했습니다. 서버 세션 폐기를 확인하지 못했습니다. 관리자에게 문의해주세요.");
    setLoggingOut(false);
  };
  useEffect(() => {
    const expired = () => { clearUi(); setLogoutMessage("세션이 만료되었습니다. 다시 로그인해주세요."); };
    const activity = (event: Event) => { if (event.isTrusted) touchSession(); };
    const check = () => { restoreSession(); };
    const timer = window.setInterval(check, 5000);
    window.addEventListener("pda:unauthorized", expired);
    window.addEventListener("pointerdown", activity);
    window.addEventListener("keydown", activity);
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      clearInterval(timer);
      window.removeEventListener("pda:unauthorized", expired);
      window.removeEventListener("pointerdown", activity);
      window.removeEventListener("keydown", activity);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, []);

  if (!role) return <Login onLogin={login} message={logoutMessage} disabled={loggingOut} />;
  if (mustChangePassword) return <ChangePassword onComplete={() => setMustChangePassword(false)} onLogout={logout} />;

  const cfg = roleConfig[role];
  const current = cfg.nav[Math.min(active, cfg.nav.length - 1)];

  return (
    <div className="flex h-full bg-[#F8FAFC] text-[#0F172A]">
      {/* LNB */}
      <aside className={`flex shrink-0 flex-col border-r border-[#E2E8F0] bg-white transition-[width] duration-200 ${collapsed ? "w-[76px]" : "w-[264px]"}`}>
        <div className="flex h-16 shrink-0 items-center justify-center overflow-hidden border-b border-[#DCE7E5] bg-[#F0F7F6] px-3 text-center">
          <div className={`font-bold tracking-[-0.03em] text-[#164E63] ${collapsed ? "text-[12px] leading-tight" : "text-[20px]"}`}>
            {collapsed ? "완화의료" : cfg.brand}
          </div>
        </div>

        <nav className="flex-1 space-y-1 p-3">
          {!collapsed && <div className="px-3 pb-2 pt-3 text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8]">Menu</div>}
          {cfg.nav.map((item, i) => (
            <button key={item.key} onClick={() => setActive(i)} title={item.label} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-medium transition-colors ${active === i ? "bg-[#DBEAFE] text-[#1E40AF]" : "text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#0F172A]"} ${collapsed ? "justify-center" : ""}`}>
              {item.icon}
              {!collapsed && <span className="truncate">{item.label}</span>}
            </button>
          ))}
        </nav>

        <button onClick={() => setCollapsed((c) => !c)} className="m-3 flex items-center justify-center gap-2 rounded-lg py-2 text-[13px] font-medium text-[#94A3B8] transition-colors hover:bg-[#F1F5F9] hover:text-[#334155]">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={collapsed ? "rotate-180" : ""}>
            <path d="m15 18-6-6 6-6" />
          </svg>
          {!collapsed && "사이드바 접기"}
        </button>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* GNB */}
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-[#E2E8F0] bg-white/80 px-6 backdrop-blur">
          <div className="flex items-center gap-3">
            <span className="rounded-full bg-[#DBEAFE] px-3 py-1 text-[13px] font-semibold text-[#1E40AF]">{cfg.badge}</span>
            <span className="hidden text-[14px] font-medium text-[#334155] sm:block">{cfg.org}</span>
          </div>

          <div className="flex items-center gap-3">
            <div className="grid size-9 place-items-center rounded-full bg-[#0F172A] text-[13px] font-semibold text-white">{role === "owner" ? "OW" : "PC"}</div>

            <button onClick={logout} className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-medium text-[#64748B] transition-colors hover:bg-[#F1F5F9] hover:text-[#9F1239]">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
              </svg>
              로그아웃
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6 lg:p-8">
          <div className="mx-auto max-w-[1200px]"><div key={sessionKey}>{current.view}</div></div>
        </main>
      </div>
    </div>
  );
}
