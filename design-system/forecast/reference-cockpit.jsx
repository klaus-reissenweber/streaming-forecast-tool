/**
 * Instrument Edition visual specimen for the /release/[id] cockpit.
 * Not imported by the Next.js app. Tokens must match app/globals.css.
 */
const T = {
  canvas: "#EDEEF1",
  canvasSubtle: "#F4F5F7",
  surface: "#FFFFFF",
  border: "#E2E6EB",
  borderSubtle: "#ECEEF2",
  foreground: "#12151A",
  secondary: "#545B66",
  muted: "#868E98",
  accent: "#C8E600",
  accentHover: "#B3CF00",
  accentReadable: "#5A6600",
  accentTint: "#F7FCE8",
  accentBorder: "#DFEBA3",
  positive: "#1F6B52",
  positiveBg: "#ECF5F1",
  warning: "#8A6400",
  warningBg: "#F8F3E4",
  negative: "#9B2335",
  negativeBg: "#F9ECEE",
  info: "#1565A8",
  infoBg: "#ECF2FA",
  chartLocked: "#8FA800",
  chartMarquee: "#1DB954",
  chartShowcase: "#0D7A3A",
  chartMeta: "#1877F2",
  chartProjected: "#1565A8",
  chartActual: "#12151A",
  chartGrid: "#ECEEF2",
  fontSerif: '"Source Serif 4", ui-serif, Georgia, serif',
  fontSans: '"IBM Plex Sans", ui-sans-serif, system-ui, sans-serif',
  fontMono: '"IBM Plex Mono", ui-monospace, monospace',
  radius: 4,
  radiusTag: 2,
};

const NAV = [
  { section: "Releases", items: ["Active releases", "New release", "Archive"] },
  { section: "Ads", items: ["Ad results", "Reports"] },
  { section: "Model", items: ["Retrain", "Approve drafts"] },
];

const SERIES = [
  { id: "locked", label: "Locked", value: "412K", color: T.chartLocked, on: true },
  { id: "marquee", label: "Marquee", value: "18.4K", color: T.chartMarquee, on: false },
  { id: "showcase", label: "Showcase", value: "6.1K", color: T.chartShowcase, on: false },
  { id: "meta", label: "Meta", value: "22.0K", color: T.chartMeta, on: false },
  { id: "projected", label: "Projected", value: "438K", color: T.chartProjected, on: false },
  { id: "actual", label: "Actual", value: "128K", color: T.chartActual, on: true },
];

const BANDS = [
  { name: "Weak", range: "Below 19K", active: false },
  { name: "Typical", range: "19K – 53K", active: false },
  { name: "Strong", range: "53K – 72K", active: true },
  { name: "Elite", range: "Above 72K", active: false },
];

function Pill({ tone = "neutral", children }) {
  const map = {
    neutral: { bg: T.canvas, fg: T.secondary },
    positive: { bg: T.positiveBg, fg: T.positive },
    warning: { bg: T.warningBg, fg: T.warning },
    negative: { bg: T.negativeBg, fg: T.negative },
    info: { bg: T.infoBg, fg: T.info },
    accent: { bg: T.accentTint, fg: T.accentReadable },
  };
  const c = map[tone];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        borderRadius: 999,
        padding: "2px 8px",
        fontSize: 10,
        fontWeight: 500,
        background: c.bg,
        color: c.fg,
      }}
    >
      {children}
    </span>
  );
}

function SectionTitle({ children, hint }) {
  return (
    <div>
      <h2
        style={{
          margin: 0,
          fontSize: 17,
          fontWeight: 600,
          lineHeight: 1.3,
          color: T.foreground,
        }}
      >
        {children}
      </h2>
      {hint ? (
        <p style={{ margin: "4px 0 0", fontSize: 14, color: T.muted }}>{hint}</p>
      ) : null}
    </div>
  );
}

function Card({ children, pad = 20, style }) {
  return (
    <div
      style={{
        background: T.surface,
        border: `1px solid ${T.border}`,
        borderRadius: T.radius,
        padding: pad,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function SidebarIcon({ d }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}

function Sparkline() {
  const locked =
    "M12 92 C 40 88, 70 54, 100 48 S 160 58, 190 52 S 250 64, 280 70 S 340 78, 370 74 S 430 86, 460 82";
  const actual =
    "M12 90 C 40 86, 70 50, 100 44 S 140 40, 160 46";
  return (
    <svg
      viewBox="0 0 480 120"
      width="100%"
      height="148"
      role="img"
      aria-label="28-day stream curve, locked versus actual"
    >
      {[20, 44, 68, 92].map((y) => (
        <line
          key={y}
          x1="8"
          x2="472"
          y1={y}
          y2={y}
          stroke={T.chartGrid}
          strokeWidth="1"
        />
      ))}
      <path d={locked} fill="none" stroke={T.chartLocked} strokeWidth="2" />
      <path d={actual} fill="none" stroke={T.chartActual} strokeWidth="2" />
      <circle cx="160" cy="46" r="3.5" fill={T.chartActual} />
      <line
        x1="160"
        x2="160"
        y1="12"
        y2="108"
        stroke={T.accent}
        strokeWidth="1.5"
        strokeDasharray="3 3"
      />
    </svg>
  );
}

export default function ReferenceCockpit() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        background: T.canvas,
        color: T.foreground,
        fontFamily: T.fontSans,
        fontSize: 14,
        lineHeight: 1.5,
        WebkitFontSmoothing: "antialiased",
      }}
    >
      <aside
        style={{
          width: 224,
          flexShrink: 0,
          background: T.canvasSubtle,
          borderRight: `1px solid ${T.border}`,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            padding: "16px",
            borderBottom: `1px solid ${T.border}`,
          }}
        >
          <div
            style={{
              fontFamily: T.fontSerif,
              fontSize: 20,
              fontWeight: 600,
              letterSpacing: "-0.02em",
            }}
          >
            Forecast
          </div>
          <div
            style={{
              marginTop: 2,
              fontSize: 10,
              fontWeight: 500,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: T.muted,
            }}
          >
            Instrument Edition
          </div>
        </div>
        <nav aria-label="Internal" style={{ padding: "16px 12px", flex: 1 }}>
          {NAV.map((group) => (
            <div key={group.section} style={{ marginBottom: 24 }}>
              <p
                style={{
                  margin: "0 0 6px 8px",
                  fontSize: 10,
                  fontWeight: 500,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: T.muted,
                }}
              >
                {group.section}
              </p>
              {group.items.map((item) => {
                const active = item === "Active releases";
                return (
                  <div
                    key={item}
                    style={{
                      position: "relative",
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "6px 8px",
                      borderRadius: T.radius,
                      background: active ? T.accentTint : "transparent",
                      color: active ? T.foreground : T.secondary,
                      fontWeight: active ? 500 : 400,
                    }}
                  >
                    {active ? (
                      <span
                        aria-hidden="true"
                        style={{
                          position: "absolute",
                          left: 0,
                          top: 4,
                          bottom: 4,
                          width: 3,
                          borderRadius: "0 2px 2px 0",
                          background: T.accent,
                        }}
                      />
                    ) : null}
                    <SidebarIcon d="M2.5 3.5h11v9h-11z M5 7.5h6M5 10h4" />
                    <span>{item}</span>
                  </div>
                );
              })}
            </div>
          ))}
        </nav>
      </aside>

      <main style={{ flex: 1, minWidth: 0, maxWidth: 1152, margin: "0 auto", padding: "32px 20px" }}>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            marginBottom: 16,
          }}
        >
          {[
            ["Canvas", T.canvas],
            ["Surface", T.surface],
            ["Accent", T.accent],
            ["Readable", T.accentReadable],
            ["Positive", T.positive],
            ["Warning", T.warning],
            ["Negative", T.negative],
            ["Info", T.info],
          ].map(([label, color]) => (
            <span
              key={label}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontFamily: T.fontMono,
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: "0.04em",
                color: T.secondary,
                background: "#F0F2F5",
                borderRadius: T.radiusTag,
                padding: "2px 6px",
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 1,
                  background: color,
                  border: `1px solid ${T.border}`,
                }}
              />
              {label}
            </span>
          ))}
        </div>

        <nav aria-label="Breadcrumb" style={{ fontSize: 14, fontWeight: 500, color: T.secondary }}>
          <span style={{ color: T.accentReadable }}>Releases</span>
          <span style={{ color: T.muted, margin: "0 6px" }}>&gt;</span>
          <span style={{ color: T.foreground }}>Is It Over Now?</span>
        </nav>

        <header
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 16,
            marginTop: 16,
            paddingBottom: 16,
            borderBottom: `1px solid ${T.border}`,
          }}
        >
          <div>
            <h1
              style={{
                margin: 0,
                fontFamily: T.fontSerif,
                fontSize: 28,
                fontWeight: 600,
                lineHeight: 1.2,
              }}
            >
              Is It Over Now?
              <span style={{ fontWeight: 400, color: T.secondary }}> · Elderbrook</span>
            </h1>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: T.secondary }}>
              House · Release 14 Aug 2025 · Editorial tier 2 (Medium)
            </p>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
            <Pill tone="positive">Active</Pill>
            <button
              type="button"
              style={{
                border: `1px solid ${T.border}`,
                background: T.surface,
                color: T.secondary,
                borderRadius: T.radius,
                padding: "6px 12px",
                fontSize: 13,
                fontWeight: 500,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Close release
            </button>
          </div>
        </header>

        <div style={{ display: "flex", flexDirection: "column", gap: 24, marginTop: 24 }}>
          <section
            aria-label="Week-1 forecast"
            style={{
              position: "relative",
              overflow: "hidden",
              background: T.accentTint,
              border: `1px solid ${T.border}`,
              borderRadius: T.radius,
              padding: "14px 20px",
            }}
          >
            <span
              aria-hidden="true"
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                bottom: 0,
                width: 4,
                background: T.accent,
              }}
            />
            <SectionTitle hint="Locked 7 Aug 2025">Week-1 forecast</SectionTitle>
            <div
              role="table"
              aria-label="Week-1 forecast vs actual"
              style={{
                display: "grid",
                gridTemplateColumns: "max-content repeat(3, minmax(0, 1fr))",
                marginTop: 12,
                textAlign: "center",
              }}
            >
              <div />
              {["Streams", "Saves", "Save rate"].map((h, i) => (
                <div
                  key={h}
                  style={{
                    paddingBottom: 8,
                    fontSize: 11,
                    fontWeight: 500,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    color: T.muted,
                    borderLeft: i ? `1px solid ${T.border}66` : undefined,
                  }}
                >
                  {h}
                </div>
              ))}
              <div style={{ padding: "8px 12px 8px 0", textAlign: "left", fontSize: 12, color: T.muted }}>
                Forecast
              </div>
              {[
                { v: "412K", note: "+46.4K ads" },
                { v: "58.2K", note: null },
                { v: "14%", note: null },
              ].map((cell, i) => (
                <div
                  key={cell.v}
                  style={{
                    padding: "8px 12px",
                    borderLeft: i ? `1px solid ${T.border}66` : undefined,
                  }}
                >
                  <div
                    style={{
                      fontFamily: T.fontMono,
                      fontSize: 40,
                      fontWeight: 600,
                      lineHeight: 1,
                      letterSpacing: "-0.02em",
                    }}
                  >
                    {cell.v}
                  </div>
                  <div style={{ minHeight: "2.1rem", marginTop: 4 }}>
                    {cell.note ? (
                      <span
                        style={{
                          fontFamily: T.fontMono,
                          fontSize: 15,
                          fontWeight: 500,
                          color: T.muted,
                        }}
                      >
                        {cell.note}
                      </span>
                    ) : null}
                  </div>
                </div>
              ))}
              <div
                style={{
                  padding: "8px 12px 8px 0",
                  textAlign: "left",
                  fontSize: 12,
                  color: T.muted,
                  background: "rgba(255,255,255,0.5)",
                }}
              >
                Actual
              </div>
              {["128K", "21.4K", "16.7%"].map((v, i) => (
                <div
                  key={v}
                  style={{
                    padding: "8px 12px",
                    background: "rgba(255,255,255,0.5)",
                    borderLeft: i ? `1px solid ${T.border}66` : undefined,
                    fontFamily: T.fontMono,
                    fontSize: 40,
                    fontWeight: 600,
                    lineHeight: 1,
                    letterSpacing: "-0.02em",
                  }}
                >
                  {v}
                </div>
              ))}
              <div style={{ padding: "8px 12px 8px 0", textAlign: "left", fontSize: 12, color: T.muted }}>
                Difference
              </div>
              {[
                { v: "−69%", tone: T.warning, cap: "Below band" },
                { v: "−63%", tone: T.warning, cap: null },
                { v: "+19%", tone: T.positive, cap: "Above band" },
              ].map((cell, i) => (
                <div
                  key={cell.v}
                  style={{
                    padding: "8px 12px",
                    borderLeft: i ? `1px solid ${T.border}66` : undefined,
                  }}
                >
                  <div
                    style={{
                      fontFamily: T.fontMono,
                      fontSize: 40,
                      fontWeight: 600,
                      lineHeight: 1,
                      letterSpacing: "-0.02em",
                      color: cell.tone,
                    }}
                  >
                    {cell.v}
                  </div>
                  <div style={{ minHeight: "2.1rem", marginTop: 4, fontSize: 12, color: cell.tone }}>
                    {cell.cap}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section
            aria-label="Release health"
            style={{
              position: "relative",
              overflow: "hidden",
              background: T.surface,
              border: `1px solid ${T.border}`,
              borderRadius: T.radius,
              padding: "8px 14px 8px 18px",
            }}
          >
            <span
              aria-hidden="true"
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                bottom: 0,
                width: 3,
                background: T.warning,
              }}
            />
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "6px 8px" }}>
              <span style={{ display: "inline-flex", alignItems: "baseline", gap: 6, fontWeight: 600 }}>
                <Pill tone="negative">Lagging</Pill>
                <span style={{ color: T.warning, fontSize: 14 }}>Streams behind locked curve</span>
              </span>
              <span style={{ color: T.muted }} aria-hidden="true">
                ·
              </span>
              <span style={{ fontSize: 13, color: T.secondary }}>
                D3 actuals are 31% below the locked median path. Save rate is holding above the house band.
              </span>
            </div>
          </section>

          <section aria-label="Key metrics">
            <SectionTitle>Metrics</SectionTitle>
            <div
              style={{
                marginTop: 16,
                display: "flex",
                background: T.surface,
                border: `1px solid ${T.border}`,
                borderRadius: T.radius,
                overflow: "hidden",
              }}
            >
              {[
                { label: "Save velocity", value: "112%", sub: "Vs median week-1 saves for this artist size" },
                { label: "Algo positioning", value: "Strong", sub: "Above 53K week-1 saves" },
              ].map((m, i) => (
                <div
                  key={m.label}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    padding: "16px 20px",
                    borderTop: `1px solid ${T.accent}66`,
                    borderLeft: i ? `1px solid ${T.borderSubtle}` : undefined,
                  }}
                >
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 500,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      color: T.muted,
                    }}
                  >
                    {m.label}
                  </div>
                  <div
                    style={{
                      marginTop: 8,
                      fontFamily: T.fontMono,
                      fontSize: 36,
                      fontWeight: 600,
                      lineHeight: 1,
                      letterSpacing: "-0.02em",
                    }}
                  >
                    {m.value}
                  </div>
                  <p style={{ margin: "4px 0 0", fontSize: 12, color: T.muted }}>{m.sub}</p>
                </div>
              ))}
            </div>
          </section>

          <section aria-label="Flags">
            <SectionTitle>Flags</SectionTitle>
            <ul
              style={{
                listStyle: "none",
                margin: "16px 0 0",
                padding: 0,
                background: T.surface,
                border: `1px solid ${T.border}`,
                borderRadius: T.radius,
                overflow: "hidden",
              }}
            >
              {[
                {
                  pill: "Warning",
                  tone: "warning",
                  rule: T.warning,
                  title: "Streams lag locked path",
                  detail: "Cumulative D1–D3 is 31% below the locked median. Watch D4 editorial pickup.",
                },
                {
                  pill: "Positive",
                  tone: "positive",
                  rule: T.positive,
                  title: "Save velocity above typical",
                  detail: "Week-1 save pace is 112% of the median for this artist size.",
                },
                {
                  pill: "Info",
                  tone: "info",
                  rule: T.info,
                  title: "Other share ticking up",
                  detail: "Source-of-streams Other is +4pts since D1 — paid is converting.",
                },
              ].map((flag, i, arr) => (
                <li
                  key={flag.title}
                  style={{
                    borderLeft: `3px solid ${flag.rule}`,
                    padding: "10px 14px",
                    borderBottom: i === arr.length - 1 ? undefined : `1px solid ${T.borderSubtle}`,
                  }}
                >
                  <p style={{ margin: 0, display: "flex", flexWrap: "wrap", gap: 6, fontSize: 13, fontWeight: 600 }}>
                    <Pill tone={flag.tone}>{flag.pill}</Pill>
                    <span style={{ color: flag.rule }}>{flag.title}</span>
                  </p>
                  <p style={{ margin: "2px 0 0", fontSize: 13, color: T.secondary }}>{flag.detail}</p>
                </li>
              ))}
            </ul>
          </section>

          <section aria-label="Stream curve">
            <Card pad={20}>
              <SectionTitle hint="Locked organic path vs daily actuals">Stream curve</SectionTitle>
              <div
                style={{
                  marginTop: 16,
                  display: "grid",
                  gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
                  gap: 8,
                }}
              >
                {SERIES.map((s) => (
                  <div
                    key={s.id}
                    style={{
                      border: `1px solid ${T.border}`,
                      borderRadius: T.radius,
                      padding: "8px 10px",
                      background: s.on ? T.surface : T.canvas,
                      opacity: s.on ? 1 : 0.55,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: T.secondary }}>
                      <span
                        aria-hidden="true"
                        style={{
                          width: 14,
                          height: 14,
                          borderRadius: T.radiusTag,
                          border: `2px solid ${s.color}`,
                          background: s.on ? s.color : "transparent",
                        }}
                      />
                      {s.label}
                    </div>
                    <div
                      style={{
                        marginTop: 4,
                        fontFamily: T.fontMono,
                        fontSize: 16,
                        fontWeight: 600,
                        letterSpacing: "-0.02em",
                      }}
                    >
                      {s.value}
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 12 }}>
                <Sparkline />
              </div>
            </Card>
          </section>

          <section aria-label="Algorithmic positioning">
            <Card>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
                <SectionTitle hint="Week-1 save count vs similar artists (forecast)">
                  Algo positioning
                </SectionTitle>
                <div style={{ textAlign: "right" }}>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 500,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      color: T.muted,
                    }}
                  >
                    Current projection
                  </div>
                  <div
                    style={{
                      fontFamily: T.fontMono,
                      fontSize: 28,
                      fontWeight: 600,
                      letterSpacing: "-0.02em",
                    }}
                  >
                    58.2K <span style={{ fontFamily: T.fontSans, fontSize: 16, fontWeight: 500, color: T.muted }}>saves</span>
                  </div>
                </div>
              </div>
              <div
                style={{
                  marginTop: 20,
                  display: "grid",
                  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                  gap: 12,
                }}
              >
                {BANDS.map((band) => (
                  <div
                    key={band.name}
                    style={{
                      border: `1px solid ${T.border}`,
                      borderLeft: band.active ? `3px solid ${T.accent}` : `1px solid ${T.border}`,
                      borderRadius: T.radius,
                      padding: 16,
                      background: band.active ? T.accentTint : T.canvas,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <h3
                        style={{
                          margin: 0,
                          fontSize: 13,
                          fontWeight: 600,
                          color: band.active ? T.accentReadable : T.foreground,
                        }}
                      >
                        {band.name}
                      </h3>
                      {band.active ? <Pill tone="accent">Current</Pill> : null}
                    </div>
                    <p style={{ margin: "8px 0 0", fontFamily: T.fontMono, fontSize: 12, color: T.secondary }}>
                      {band.range}
                    </p>
                  </div>
                ))}
              </div>
            </Card>
          </section>
        </div>
      </main>
    </div>
  );
}
