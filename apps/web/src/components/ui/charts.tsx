import { useState } from 'react'
import type { DailyCount } from '../../types/api'

// Brand palette, validated with the dataviz palette validator against the paper surface (#fafcfc):
// raven plum, blue, aqua. Aqua is below 3:1 contrast, so every chart also shows values as text and a table.
// Light: #a3477c, #2a78d6, #1baf7a. Dark (validated against #131316): #c35a98, #3987e5, #199e70.
// The values live in index.css (--series-1..3) so they switch with the theme.
const SERIES = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)'] as const

const shortDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString([], { month: 'short', day: 'numeric', timeZone: 'UTC' })

/** Axis maximum for counts: a round number that is even, so the midpoint tick is whole too. */
function niceMax(value: number): number {
  if (value <= 4) return 4
  const step = 10 ** Math.floor(Math.log10(value))
  const max = Math.ceil(value / step) * step
  return max % 2 === 0 ? max : max + step
}

function DataTable({ caption, rows }: { caption: string; rows: [string, number][] }) {
  return (
    <details className="mt-3 text-xs text-graphite">
      <summary className="annot cursor-pointer select-none hover:text-ink">View as table</summary>
      <table className="mt-2 w-full text-left">
        <caption className="sr-only">{caption}</caption>
        <tbody>
          {rows.map(([label, value]) => (
            <tr key={label} className="border-t border-line">
              <th scope="row" className="py-1 font-normal">
                {label}
              </th>
              <td className="py-1 text-right font-mono tabular-nums text-ink">{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  )
}

/** Single-series daily column chart. The title names the series, so there is no legend. */
export function DailyColumnChart({ title, data, unit }: { title: string; data: DailyCount[]; unit: string }) {
  const [hover, setHover] = useState<number | null>(null)
  const W = 560
  const H = 200
  const pad = { top: 20, right: 8, bottom: 24, left: 32 }
  const plotW = W - pad.left - pad.right
  const plotH = H - pad.top - pad.bottom
  const max = niceMax(Math.max(0, ...data.map((d) => d.count)))
  const slot = plotW / Math.max(1, data.length)
  const barW = Math.min(24, slot * 0.6)
  const y = (v: number) => pad.top + plotH - (v / max) * plotH
  const ticks = [0, max / 2, max]
  const peak = data.reduce((best, d, i) => (d.count > (data[best]?.count ?? -1) ? i : best), 0)
  const labelled = new Set([data.length - 1, peak])
  const hovered = hover === null ? null : data[hover]

  return (
    <figure className="m-0">
      <figcaption className="mb-3 text-sm font-medium tracking-tight text-ink">{title}</figcaption>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`${title}: ${data.map((d) => `${shortDate(d.date)} ${d.count}`).join(', ')}`}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.left} x2={W - pad.right} y1={y(t)} y2={y(t)} stroke="var(--color-line)" strokeWidth={1} strokeDasharray={t === 0 ? undefined : '2 4'} />
              <text x={pad.left - 6} y={y(t)} textAnchor="end" dominantBaseline="middle" className="fill-mute font-mono text-[9.5px]">
                {t}
              </text>
            </g>
          ))}
          {data.map((d, i) => {
            const cx = pad.left + slot * i + slot / 2
            const top = y(d.count)
            const h = pad.top + plotH - top
            const r = Math.min(4, h)
            return (
              <g key={d.date} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                {/* Hit target spans the whole slot, larger than the mark. */}
                <rect x={pad.left + slot * i} y={pad.top} width={slot} height={plotH} fill="transparent" />
                {d.count > 0 && (
                  <path
                    d={`M${cx - barW / 2},${top + h} V${top + r} q0,${-r} ${r},${-r} H${cx + barW / 2 - r} q${r},0 ${r},${r} V${top + h} Z`}
                    fill={hover === i ? 'var(--color-ink)' : SERIES[0]}
                    opacity={hover === null || hover === i ? 1 : 0.5}
                  />
                )}
                {labelled.has(i) && d.count > 0 && (
                  <text x={cx} y={top - 5} textAnchor="middle" className="fill-ink font-mono text-[10px] font-medium">
                    {d.count}
                  </text>
                )}
                {(i % 2 === data.length % 2 || i === data.length - 1) && (
                  <text x={cx} y={H - 6} textAnchor="middle" className="fill-mute font-mono text-[9.5px]">
                    {shortDate(d.date)}
                  </text>
                )}
              </g>
            )
          })}
          <line x1={pad.left} x2={W - pad.right} y1={pad.top + plotH} y2={pad.top + plotH} stroke="var(--color-ink)" strokeWidth={1} />
        </svg>
        {hovered && hover !== null && (
          <div
            className="pointer-events-none absolute top-0 -translate-x-1/2 rounded-full bg-ink px-3 py-1 font-mono text-[10.5px] text-paper shadow-[0_3px_0_0_var(--color-plum-700)]"
            style={{ left: `${((pad.left + slot * hover + slot / 2) / W) * 100}%` }}
          >
            {shortDate(hovered.date)}: <strong>{hovered.count}</strong> {unit}
          </div>
        )}
      </div>
      <DataTable caption={title} rows={data.map((d) => [shortDate(d.date), d.count])} />
    </figure>
  )
}

/** Part-to-whole for a few categories: one stacked bar, a legend with counts, and a table. */
export function SplitBar({ title, parts }: { title: string; parts: { label: string; value: number }[] }) {
  const total = parts.reduce((sum, p) => sum + p.value, 0)
  return (
    <figure className="m-0">
      <figcaption className="mb-3 text-sm font-medium tracking-tight text-ink">{title}</figcaption>
      {total === 0 ? (
        <p className="text-sm text-mute">No conversations yet.</p>
      ) : (
        <div className="flex h-8 w-full gap-0.5 overflow-hidden" role="img" aria-label={parts.map((p) => `${p.label} ${p.value}`).join(', ')}>
          {parts.map((p, i) =>
            p.value > 0 ? (
              <div key={p.label} title={`${p.label}: ${p.value}`} style={{ width: `${(p.value / total) * 100}%`, background: SERIES[i % SERIES.length] }} />
            ) : null,
          )}
        </div>
      )}
      <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
        {parts.map((p, i) => (
          <li key={p.label} className="flex items-center gap-2 text-graphite">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: SERIES[i % SERIES.length] }} aria-hidden />
            {p.label}
            <span className="font-mono font-medium tabular-nums text-ink">{p.value}</span>
            {total > 0 && <span className="font-mono text-xs text-mute">{Math.round((p.value / total) * 100)}%</span>}
          </li>
        ))}
      </ul>
      <DataTable caption={title} rows={parts.map((p) => [p.label, p.value])} />
    </figure>
  )
}
