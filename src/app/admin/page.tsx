// Private operator dashboard: /admin?key=YOUR_ADMIN_KEY
//
// Server-rendered. Access is gated by the ADMIN_KEY env var — if that var is
// unset, or the ?key= doesn't match, nothing is revealed. Name-only sign-in
// means "users" = distinct names that have ever signed in (an approximation of
// people, since two friends who type the same name share one account).

import { ADMIN_KEY } from "@/lib/config";
import { getOperatorStats } from "@/lib/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = { title: "Operator · Book Engine", robots: "noindex" };

function fmt(ts: number | null): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const page: React.CSSProperties = {
  maxWidth: 820,
  margin: "0 auto",
  padding: "48px 20px 80px",
  fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif",
  color: "oklch(25% 0 0)",
};

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ key?: string }>;
}) {
  const { key } = await searchParams;

  if (!ADMIN_KEY) {
    return (
      <main style={page}>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Operator page is off</h1>
        <p style={{ marginTop: 12, color: "oklch(45% 0 0)", lineHeight: 1.6 }}>
          Set an <code>ADMIN_KEY</code> environment variable (in Vercel →
          Settings → Environment Variables), redeploy, then visit{" "}
          <code>/admin?key=YOUR_KEY</code>.
        </p>
      </main>
    );
  }

  if (key !== ADMIN_KEY) {
    return (
      <main style={page}>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Not authorised</h1>
        <p style={{ marginTop: 12, color: "oklch(45% 0 0)", lineHeight: 1.6 }}>
          Add your operator key to the address: <code>/admin?key=YOUR_KEY</code>.
        </p>
      </main>
    );
  }

  const { totalUsers, users } = await getOperatorStats();

  const th: React.CSSProperties = {
    textAlign: "left",
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: ".04em",
    textTransform: "uppercase",
    color: "oklch(55% 0 0)",
    padding: "8px 12px",
    borderBottom: "1px solid oklch(90% 0 0)",
  };
  const td: React.CSSProperties = {
    padding: "10px 12px",
    fontSize: 14,
    borderBottom: "1px solid oklch(94% 0 0)",
  };

  return (
    <main style={page}>
      <div style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "oklch(55% 0.09 70)" }}>
        Operator
      </div>
      <h1 style={{ fontSize: 30, fontWeight: 800, marginTop: 6 }}>
        {totalUsers} {totalUsers === 1 ? "account" : "accounts"} signed in
      </h1>
      <p style={{ marginTop: 8, color: "oklch(48% 0 0)", lineHeight: 1.6, fontSize: 14 }}>
        Each account is one distinct name that has signed in. Because sign-in is
        name-only, this counts names, not verified people.
      </p>

      {users.length === 0 ? (
        <p style={{ marginTop: 28, color: "oklch(45% 0 0)" }}>No accounts yet.</p>
      ) : (
        <div style={{ marginTop: 28, overflowX: "auto", border: "1px solid oklch(92% 0 0)", borderRadius: 12 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
            <thead>
              <tr>
                <th style={th}>Name</th>
                <th style={th}>First signed in</th>
                <th style={th}>Last active</th>
                <th style={{ ...th, textAlign: "right" }}>Shelf</th>
                <th style={{ ...th, textAlign: "right" }}>Reading list</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u, i) => (
                <tr key={i}>
                  <td style={{ ...td, fontWeight: 600 }}>{u.name}</td>
                  <td style={{ ...td, color: "oklch(45% 0 0)" }}>{fmt(u.createdAt)}</td>
                  <td style={{ ...td, color: "oklch(45% 0 0)" }}>{fmt(u.lastActive)}</td>
                  <td style={{ ...td, textAlign: "right" }}>{u.shelfCount}</td>
                  <td style={{ ...td, textAlign: "right" }}>{u.wishlistCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
