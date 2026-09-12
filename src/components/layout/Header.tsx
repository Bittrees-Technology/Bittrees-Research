import { useState } from "react";
import { Link, NavLink } from "react-router";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount } from "wagmi";
import { BittreesMark } from "@/components/Brand";
import { useMembershipStatus } from "@/hooks/membership/useMembershipStatus";
import { useAdminAccess } from "@/lib/adminAccess";
import { ROUTES } from "@/lib/links";

const NAV = [
  { to: ROUTES.overview, label: "Overview", end: true },
  { to: "/research", label: "Research", end: false },
  { to: ROUTES.contribute, label: "Contribute", end: false },
  { to: ROUTES.forum, label: "Forum", end: false },
  { to: ROUTES.chat, label: "Chat", end: false },
  { to: ROUTES.bnote, label: "BNOTE", end: false },
  { to: ROUTES.bit, label: "BIT", end: false },
  { to: "/structure", label: "Structure", end: false },
];

/** Small membership chip → /membership. Shows days-left, amber when expiring. */
function MemberChip() {
  const { daysLeft, expiringSoon, isLoading } = useMembershipStatus();
  if (isLoading || daysLeft === undefined) return null;
  return (
    <Link
      to="/membership"
      className="badge badge-member"
      style={{
        textDecoration: "none",
        ...(expiringSoon
          ? { borderColor: "#B54708", color: "#B54708", background: "#FFFAEB" }
          : {}),
      }}
      title="Membership status"
    >
      {expiringSoon ? `Renew · ${daysLeft}d` : `Member · ${daysLeft}d`}
    </Link>
  );
}

export default function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { address } = useAccount();
  const isAdmin = useAdminAccess(address) !== "none";
  // Admin sits far-right (after Structure) when present.
  const navItems = isAdmin ? [...NAV, { to: "/admin", label: "Admin", end: false }] : NAV;

  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        background: "#ffffff",
        borderBottom: "1px solid var(--color-border)",
      }}
    >
      <div
        style={{
          maxWidth: "1140px",
          margin: "0 auto",
          padding: "0 1.5rem",
          height: "56px",
          display: "flex",
          alignItems: "center",
          gap: "1.5rem",
        }}
      >
        <NavLink
          to="/"
          style={{
            textDecoration: "none",
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            gap: "0.6rem",
          }}
        >
          <BittreesMark />
          <span
            className="brand-wordmark"
            style={{
              fontFamily: "var(--font-logo)",
              fontWeight: 700,
              fontSize: "1.1rem",
              color: "var(--color-ink)",
              letterSpacing: "-0.01em",
            }}
          >
            Bittrees Research
          </span>
        </NavLink>

        <nav className="nav-desktop" style={{ gap: "0.1rem", flex: 1 }}>
          {navItems.map(({ to, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              style={({ isActive }) => ({
                textDecoration: "none",
                fontFamily: "var(--font-sans)",
                fontSize: "0.85rem",
                fontWeight: isActive ? 600 : 400,
                color: isActive ? "var(--color-ink)" : "var(--color-ink-muted)",
                padding: "0.25rem 0.6rem",
                borderBottom: isActive
                  ? "2px solid var(--color-primary)"
                  : "2px solid transparent",
                transition: "color 0.15s, border-color 0.15s",
                lineHeight: "56px",
              })}
            >
              {label}
            </NavLink>
          ))}
        </nav>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            marginLeft: "auto",
          }}
        >
          <span className="nav-desktop">
            <MemberChip />
          </span>
          <ConnectButton label="Connect" chainStatus="icon" showBalance={false} accountStatus="avatar" />
          <button data-insights="toggle-navigation"
            className="nav-mobile-toggle"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label="Toggle navigation"
            aria-expanded={mobileOpen}
            style={{
              color: "var(--color-ink-muted)",
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "0.25rem",
              alignItems: "center",
            }}
          >
            {mobileOpen ? (
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
                <path d="M4 4l12 12M16 4L4 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
                <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div
          style={{ borderTop: "1px solid var(--color-border)", background: "#ffffff" }}
          onClick={() => setMobileOpen(false)}
        >
          <nav style={{ display: "flex", flexDirection: "column" }}>
            {[...navItems, { to: "/membership", label: "Membership", end: false }].map(
              ({ to, label, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  style={({ isActive }) => ({
                    display: "block",
                    padding: "0.75rem 1.5rem",
                    fontSize: "0.9rem",
                    fontWeight: isActive ? 600 : 400,
                    color: isActive ? "var(--color-ink)" : "var(--color-ink-muted)",
                    textDecoration: "none",
                    borderLeft: `3px solid ${isActive ? "var(--color-primary)" : "transparent"}`,
                    background: isActive ? "var(--color-bg-subtle)" : "transparent",
                  })}
                >
                  {label}
                </NavLink>
              )
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
