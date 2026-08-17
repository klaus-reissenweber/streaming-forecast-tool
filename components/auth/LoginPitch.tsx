import { STREAM_CURVE_BASELINE } from "@/lib/constants";

const MARK_CLASS = "size-6 shrink-0";
const NEUTRAL_STROKE = "stroke-secondary";

function curveToPath(
  values: readonly number[],
  width: number,
  height: number,
  inset: number,
): string {
  const max = Math.max(...values, 1);
  const innerW = width - inset * 2;
  const innerH = height - inset * 2;
  const last = values.length - 1;
  return values
    .map((value, index) => {
      const x = inset + (index / last) * innerW;
      const y = inset + (1 - value / max) * innerH;
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

const FORECAST_CURVE = STREAM_CURVE_BASELINE.median;
const FORECAST_MARK_PATH = curveToPath(FORECAST_CURVE, 24, 24, 2.5);
const AMBIENT_CURVE_PATH = curveToPath(FORECAST_CURVE, 800, 360, 8);

function MarkForecast() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={MARK_CLASS}
      aria-hidden="true"
    >
      <path
        d={FORECAST_MARK_PATH}
        className="stroke-accent"
        strokeWidth="1"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MarkSpend() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={`${MARK_CLASS} ${NEUTRAL_STROKE}`}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="8.25" strokeWidth="1" />
      <circle cx="12" cy="12" r="4.75" strokeWidth="1" />
      <path d="M12 3.75v3.5M20.25 12h-3.5" strokeWidth="1" strokeLinecap="round" />
    </svg>
  );
}

function MarkTrack() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={`${MARK_CLASS} ${NEUTRAL_STROKE}`}
      aria-hidden="true"
    >
      <path
        d={FORECAST_MARK_PATH}
        strokeWidth="1"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <path
        d="M2.5 18.2 7 15.4 9.2 11.6 13 13.1 16.4 12.2 21.5 10.4"
        strokeWidth="1"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MarkShare() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={`${MARK_CLASS} ${NEUTRAL_STROKE}`}
      aria-hidden="true"
    >
      <rect x="6" y="3.5" width="12" height="17" rx="1.5" strokeWidth="1" />
      <path d="M9 8.5h6M9 12h6M9 15.5h4" strokeWidth="1" strokeLinecap="round" />
    </svg>
  );
}

function MarkRetrain() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={`${MARK_CLASS} ${NEUTRAL_STROKE}`}
      aria-hidden="true"
    >
      <path
        d="M6.2 8.1a7 7 0 1 1-1.1 6.4"
        strokeWidth="1"
        strokeLinecap="round"
      />
      <path d="M6.2 4.6v4h4" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const CAPABILITIES = [
  {
    id: "forecast",
    Mark: MarkForecast,
    text: "Forecast week-one streams and saves before a release goes out",
  },
  {
    id: "spend",
    Mark: MarkSpend,
    text: "Plan Meta and Spotify spend against the forecast",
  },
  {
    id: "track",
    Mark: MarkTrack,
    text: "Track daily performance against the forecast",
  },
  {
    id: "share",
    Mark: MarkShare,
    text: "Share campaign reports with managers and labels",
  },
  {
    id: "retrain",
    Mark: MarkRetrain,
    text: "Retrain the model as releases close",
  },
] as const;

function LoginAmbientCurve() {
  return (
    <svg
      viewBox="0 0 800 360"
      className="pointer-events-none absolute -right-8 bottom-0 h-[min(22rem,55vw)] w-[min(48rem,140%)] max-w-none translate-y-6 opacity-[0.22] md:h-[28rem] md:w-[52rem] md:translate-x-8 md:translate-y-10"
      aria-hidden="true"
    >
      <path
        d={AMBIENT_CURVE_PATH}
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function LoginPitch() {
  return (
    <div className="relative min-w-0 md:flex-1">
      <LoginAmbientCurve />
      <ul className="relative z-10 space-y-5">
        {CAPABILITIES.map((item) => (
          <li key={item.id} className="flex items-start gap-3">
            <item.Mark />
            <span className="pt-0.5 text-body-sm text-foreground">{item.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
