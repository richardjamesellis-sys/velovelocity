import * as React from "react"
import { animate, motion, useMotionValue, useTransform } from "motion/react"

import { cn } from "@/lib/utils"

// Apple's momentum projection (from "Designing Fluid Interfaces"):
// how far a flick at this velocity would travel before coming to rest.
function project(velocityPx: number, decelerationRate = 0.99) {
  return ((velocityPx / 1000) * decelerationRate) / (1 - decelerationRate)
}

const clamp01 = (n: number) => Math.min(Math.max(n, 0), 1)

interface ScrubberProps {
  /** Number of snap stops along the track */
  count: number
  /** Index of the active stop */
  value: number
  onChange: (index: number) => void
  label: string
  valueText?: string
  className?: string
}

/**
 * A slider that tracks the pointer 1:1 while dragging, updates live,
 * and on release projects the flick's momentum and springs to the
 * nearest stop, carrying the release velocity into the spring.
 */
export function Scrubber({ count, value, onChange, label, valueText, className }: ScrubberProps) {
  const max = Math.max(count - 1, 0)
  const trackRef = React.useRef<HTMLDivElement>(null)
  const progress = useMotionValue(max ? value / max : 0)
  const dragging = React.useRef(false)
  const grabOffset = React.useRef(0)
  const committed = React.useRef(value)
  const [pressed, setPressed] = React.useState(false)

  const percent = useTransform(progress, (p) => `${clamp01(p) * 100}%`)

  const settle = React.useCallback(
    (index: number, velocity = 0) => {
      const target = max ? index / max : 0
      animate(progress, target, {
        type: "spring",
        velocity,
        // A little bounce only when a flick carried momentum into the release
        bounce: Math.abs(velocity) > 1.2 ? 0.2 : 0,
        duration: 0.4,
      })
    },
    [max, progress]
  )

  // Follow changes made elsewhere (new route, back to start)
  React.useEffect(() => {
    if (dragging.current || value === committed.current) return
    committed.current = value
    settle(value)
  }, [value, settle])

  React.useEffect(() => {
    if (!dragging.current) {
      committed.current = value
      progress.jump(max ? value / max : 0)
    }
    // Only when the number of stops changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [max])

  const pointerToProgress = (clientX: number) => {
    const rect = trackRef.current!.getBoundingClientRect()
    return (clientX - rect.left) / rect.width
  }

  const commit = (index: number) => {
    if (index !== committed.current) {
      committed.current = index
      onChange(index)
    }
  }

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (max === 0 || e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    dragging.current = true
    setPressed(true)
    progress.stop()

    const rect = trackRef.current!.getBoundingClientRect()
    const p = pointerToProgress(e.clientX)
    const thumbX = clamp01(progress.get()) * rect.width
    // Grabbing the thumb keeps the finger where it grabbed; tapping the track jumps there
    grabOffset.current = Math.abs(e.clientX - rect.left - thumbX) < 22 ? p - progress.get() : 0

    const next = clamp01(p - grabOffset.current)
    progress.set(next)
    commit(Math.round(next * max))
  }

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return
    const next = clamp01(pointerToProgress(e.clientX) - grabOffset.current)
    progress.set(next)
    commit(Math.round(next * max))
  }

  const release = () => {
    if (!dragging.current) return
    dragging.current = false
    setPressed(false)

    const width = trackRef.current!.getBoundingClientRect().width || 1
    const velocity = progress.getVelocity() // progress units per second
    const projected = clamp01(progress.get() + project(velocity * width) / width)
    const index = Math.round(projected * max)
    commit(index)
    settle(index, velocity)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    let next: number | null = null
    if (e.key === "ArrowRight" || e.key === "ArrowUp") next = Math.min(value + 1, max)
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") next = Math.max(value - 1, 0)
    if (e.key === "Home") next = 0
    if (e.key === "End") next = max
    if (next === null) return
    e.preventDefault()
    commit(next)
    settle(next)
  }

  return (
    <div
      role="slider"
      tabIndex={max === 0 ? -1 : 0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={valueText}
      aria-disabled={max === 0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={release}
      onPointerCancel={release}
      onKeyDown={onKeyDown}
      className={cn("relative flex h-11 cursor-pointer select-none items-center rounded-full", className)}
      style={{ touchAction: "pan-y" }}
    >
      <div ref={trackRef} className="relative h-1 w-full rounded-full bg-fill">
        {/* Stops */}
        {count > 1 && count <= 24 &&
          Array.from({ length: count }, (_, i) => (
            <span
              key={i}
              className="absolute top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-label-3"
              style={{ left: `${(i / max) * 100}%` }}
            />
          ))}
        <motion.div className="absolute inset-y-0 left-0 rounded-full bg-tint" style={{ width: percent }} />
        <motion.div
          className="absolute top-1/2 h-7 w-7 rounded-full bg-white"
          style={{
            left: percent,
            x: "-50%",
            y: "-50%",
            boxShadow: "0 0.5px 4px rgba(0,0,0,0.12), 0 6px 13px rgba(0,0,0,0.12), 0 0 0 0.5px rgba(0,0,0,0.04)",
          }}
          animate={{ scale: pressed ? 1.12 : 1 }}
          transition={{ type: "spring", bounce: 0, duration: 0.25 }}
        />
      </div>
    </div>
  )
}
