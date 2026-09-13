/**
 * An admiralty-style compass rose. Kubernetes means "helmsman", and the whole
 * vocabulary of this ecosystem — manifests, ports, pods, helm — is maritime.
 * Drawn rather than illustrated: every tick is placed by angle.
 */
export function CompassRose({ className }: { className?: string }) {
  const R = 200
  const rings = [200, 176, 128, 104, 40]

  const ticks = Array.from({ length: 72 }, (_, i) => {
    const deg = i * 5
    const major = deg % 30 === 0
    const rad = ((deg - 90) * Math.PI) / 180
    const outer = 200
    const inner = major ? 168 : 182
    return {
      deg,
      major,
      x1: Math.cos(rad) * inner,
      y1: Math.sin(rad) * inner,
      x2: Math.cos(rad) * outer,
      y2: Math.sin(rad) * outer,
    }
  })

  // Eight-point star: each point is a kite of two triangles, light and dark.
  const points = Array.from({ length: 8 }, (_, i) => {
    const deg = i * 45
    const cardinal = deg % 90 === 0
    const tip = cardinal ? 128 : 92
    const waist = 22
    const a = ((deg - 90) * Math.PI) / 180
    const l = ((deg - 90 - 45) * Math.PI) / 180
    const r = ((deg - 90 + 45) * Math.PI) / 180
    return {
      deg,
      cardinal,
      left: `M0,0 L${Math.cos(l) * waist},${Math.sin(l) * waist} L${Math.cos(a) * tip},${Math.sin(a) * tip} Z`,
      right: `M0,0 L${Math.cos(r) * waist},${Math.sin(r) * waist} L${Math.cos(a) * tip},${Math.sin(a) * tip} Z`,
    }
  })

  const labels = [
    { t: 'N', deg: 0 },
    { t: 'E', deg: 90 },
    { t: 'S', deg: 180 },
    { t: 'W', deg: 270 },
  ]

  return (
    <svg
      viewBox="-220 -220 440 440"
      className={className}
      aria-hidden="true"
      role="presentation"
      fill="none"
    >
      {rings.map((r, i) => (
        <circle
          key={r}
          r={r}
          className="draw"
          style={{ '--dash': 2 * Math.PI * r, '--d': `${i * 90}ms` } as React.CSSProperties}
          stroke="currentColor"
          strokeWidth={i === 0 ? 1.5 : 0.75}
          opacity={i === 0 ? 0.55 : 0.3}
        />
      ))}

      {ticks.map((t) => (
        <line
          key={t.deg}
          x1={t.x1}
          y1={t.y1}
          x2={t.x2}
          y2={t.y2}
          stroke="currentColor"
          strokeWidth={t.major ? 1.25 : 0.6}
          opacity={t.major ? 0.5 : 0.28}
        />
      ))}

      {points.map((p) => (
        <g key={p.deg} opacity={p.cardinal ? 0.65 : 0.4}>
          <path d={p.left} fill="currentColor" opacity={0.22} />
          <path d={p.right} stroke="currentColor" strokeWidth={0.75} />
        </g>
      ))}

      {/* The meridian, held by the signal colour — this is the course's heading. */}
      <line
        y1={-R}
        y2={R}
        stroke="var(--signal)"
        strokeWidth={1.25}
        opacity={0.85}
        className="draw"
        style={{ '--dash': 2 * R, '--d': '400ms' } as React.CSSProperties}
      />
      <circle r={5} fill="var(--signal)" />

      {labels.map(({ t, deg }) => {
        const rad = ((deg - 90) * Math.PI) / 180
        return (
          <text
            key={t}
            x={Math.cos(rad) * 150}
            y={Math.sin(rad) * 150}
            dominantBaseline="central"
            textAnchor="middle"
            fill="currentColor"
            opacity={0.6}
            style={{ fontSize: 19, fontStretch: '84%', fontWeight: 620, letterSpacing: '0.08em' }}
          >
            {t}
          </text>
        )
      })}
    </svg>
  )
}

/**
 * Depth contours — the soft banded lines a chart uses to show the seabed
 * shelving away. Purely atmospheric; sits behind content at low opacity.
 */
export function DepthContours({ className }: { className?: string }) {
  const bands = [0, 1, 2, 3, 4, 5]
  return (
    <svg
      viewBox="0 0 1200 400"
      preserveAspectRatio="none"
      className={className}
      aria-hidden="true"
      role="presentation"
      fill="none"
    >
      {bands.map((b) => (
        <path
          key={b}
          d={`M-40,${60 + b * 52} C 200,${20 + b * 52} 380,${140 + b * 46} 620,${96 + b * 50} S 1000,${40 + b * 54} 1240,${88 + b * 50}`}
          stroke="currentColor"
          strokeWidth={b === 0 ? 1.4 : 0.8}
          opacity={0.42 - b * 0.05}
          className="draw"
          style={{ '--dash': 1800, '--d': `${300 + b * 120}ms` } as React.CSSProperties}
        />
      ))}
    </svg>
  )
}
