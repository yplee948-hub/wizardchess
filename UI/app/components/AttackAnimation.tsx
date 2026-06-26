'use client'

import { useCallback, useEffect, useRef } from 'react'
import { PieceSymbol, Color } from 'chess.js'

const pieceFile: Record<PieceSymbol, (color: Color) => string> = {
  k: () => '/pieces/King.svg',
  q: () => '/pieces/Queen.svg',
  r: () => '/pieces/Rook.svg',
  b: () => '/pieces/Bishop.svg',
  n: (color) => color === 'w' ? '/pieces/Knight_1.svg' : '/pieces/Knight_2.svg',
  p: () => '/pieces/Pawn.svg',
}

type Crop = { x: number; y: number; w: number; h: number }
type VideoPieceBase = {
  src: string
  crop: Crop
  height: string
  mobileHeight: string
  bottom: string
  mobileBottom: string
  xOffset?: string
  mobileXOffset?: string
  edgeThreshold?: number
  keyLow?: number
  keyHigh?: number
  darkCleanupLow?: number
  darkCleanupHigh?: number
  darkLineProtectLum?: number
  darkLineProtectRadius?: number
  darkLineProtectMinDirections?: number
  greenKeyMin?: number
  greenKeyDiff?: number
  greenKeyFeather?: number
  greenKeyProtectLum?: number
  greenKeyStartTime?: number
  greenDarkCleanupLum?: number
  greenDarkCleanupMinArea?: number
  playbackRate?: number
  startTime?: number
  trimEndTime?: number
  finalFrameHoldMs?: number
  monochrome?: boolean
  enabledFor?: Color[]
}
type VideoPiece = VideoPieceBase & {
  variants?: Partial<Record<Color, Partial<VideoPieceBase>>>
}

// Pieces with a rendered video clip (black bg, keyed out to alpha on canvas).
// Every clip shares the same 2670x1964 render canvas, but each statue sits at
// a different size/position within it (the rearing knight spans far more of
// the frame than the slender bishop), so crop boxes are tracked per piece —
// each is the union bounding box of the statue sampled across its whole clip,
// padded ~15px, so the keyed sprite is tightly framed like the SVG pieces
// instead of floating in empty space.
const _disabledPieceVideo: Partial<Record<PieceSymbol, VideoPiece>> = {
  p: {
    src: '/effects/pawn_move.mp4',
    crop: { x: 580, y: 100, w: 2060, h: 1800 },
    height: '92%',
    mobileHeight: '86%',
    bottom: '-45%',
    mobileBottom: '-37%',
  },
  k: {
    src: '/effects/king_move.mp4',
    crop: { x: 460, y: 0, w: 2210, h: 1964 },
    height: '92%',
    mobileHeight: '86%',
    bottom: '-42%',
    mobileBottom: '-34%',
    playbackRate: 2.0,
    monochrome: true,
  },
  n: {
    src: '/effects/knight_move.mp4',
    crop: { x: 326, y: 213, w: 1539, h: 1751 },
    height: '92%',
    mobileHeight: '86%',
    bottom: '-24%',
    mobileBottom: '-8%',
  },
  b: {
    src: '/effects/bishop_move.mp4',
    crop: { x: 834, y: 132, w: 1119, h: 1724 },
    height: '92%',
    mobileHeight: '86%',
    bottom: '-42%',
    mobileBottom: '-34%',
  },
  q: {
    src: '/effects/queen_move.mp4',
    crop: { x: 520, y: 60, w: 2140, h: 1840 },
    height: '92%',
    mobileHeight: '86%',
    bottom: '-42%',
    mobileBottom: '-34%',
    playbackRate: 1.0,
    monochrome: true,
  },
  r: {
    src: '/effects/rook_move.mp4',
    crop: { x: 855, y: 216, w: 1152, h: 1710 },
    height: '92%',
    mobileHeight: '86%',
    bottom: '-42%',
    mobileBottom: '-34%',
  },
}

const pieceVideo: Partial<Record<PieceSymbol, VideoPiece>> = {
  p: {
    src: '/effects/pawn_2d_move.mp4',
    crop: { x: 520, y: 220, w: 1760, h: 1540 },
    height: '84%',
    mobileHeight: '84%',
    bottom: '-31%',
    mobileBottom: '-27%',
    xOffset: '-68px',
    mobileXOffset: '-24px',
    edgeThreshold: 42,
    keyLow: 1,
    keyHigh: 55,
    playbackRate: 2.0,
    variants: {
      b: {
        src: '/effects/pawn_2d_move_black.mp4',
        edgeThreshold: 16,
        keyLow: 1,
        keyHigh: 32,
      },
    },
  },
  k: {
    src: '/effects/king_2d_move.mp4',
    crop: { x: 80, y: 0, w: 2500, h: 1964 },
    height: '120%',
    mobileHeight: '111%',
    bottom: '-37%',
    mobileBottom: '-31%',
    xOffset: '-72px',
    mobileXOffset: '-46px',
    edgeThreshold: 16,
    keyLow: 1,
    keyHigh: 24,
    greenKeyMin: 54,
    greenKeyDiff: 12,
    greenKeyFeather: 40,
    playbackRate: 2.0,
    finalFrameHoldMs: 150,
    enabledFor: ['w'],
    variants: {
      b: {
        src: '/effects/king_2d_move_black.mp4',
        greenKeyMin: 64,
        greenKeyDiff: 18,
        greenKeyFeather: 56,
        playbackRate: 2.0,
        finalFrameHoldMs: 150,
        enabledFor: ['b'],
      },
    },
  },
  n: {
    src: '/effects/knight_2d_move.mp4',
    crop: { x: 330, y: 60, w: 2050, h: 1840 },
    height: '102%',
    mobileHeight: '94%',
    bottom: '-27%',
    mobileBottom: '-21%',
    xOffset: '-56px',
    mobileXOffset: '-36px',
    edgeThreshold: 120,
    keyLow: 1,
    keyHigh: 150,
    darkCleanupLow: 8,
    darkCleanupHigh: 74,
    playbackRate: 2.0,
    enabledFor: ['w'],
    variants: {
      b: {
        src: '/effects/knight_2d_move_black.mp4',
        edgeThreshold: 4,
        keyLow: 0,
        keyHigh: 12,
        darkLineProtectLum: 22,
        darkLineProtectRadius: 5,
        darkLineProtectMinDirections: 2,
        darkCleanupLow: undefined,
        darkCleanupHigh: undefined,
        playbackRate: 1.5,
        enabledFor: ['b'],
      },
    },
  },
  b: {
    src: '/effects/bishop_2d_move.mp4',
    crop: { x: 280, y: 40, w: 2040, h: 1860 },
    height: '104%',
    mobileHeight: '97%',
    bottom: '-29%',
    mobileBottom: '-23%',
    xOffset: '-64px',
    mobileXOffset: '-42px',
    edgeThreshold: 16,
    keyLow: 1,
    keyHigh: 24,
    greenKeyMin: 72,
    greenKeyDiff: 24,
    greenKeyFeather: 54,
    playbackRate: 2.0,
    finalFrameHoldMs: 150,
    enabledFor: ['w'],
    variants: {
      b: {
        src: '/effects/bishop_2d_move_black.mp4',
        greenKeyMin: 64,
        greenKeyDiff: 18,
        greenKeyFeather: 56,
        playbackRate: 2.0,
        startTime: 0.35,
        finalFrameHoldMs: 150,
        enabledFor: ['b'],
      },
    },
  },
  q: {
    src: '/effects/queen_2d_move.mp4',
    crop: { x: 120, y: 0, w: 2450, h: 1964 },
    height: '114%',
    mobileHeight: '106%',
    bottom: '-35%',
    mobileBottom: '-29%',
    xOffset: '-68px',
    mobileXOffset: '-44px',
    edgeThreshold: 16,
    keyLow: 1,
    keyHigh: 24,
    greenKeyMin: 54,
    greenKeyDiff: 12,
    greenKeyFeather: 40,
    playbackRate: 2.5,
    finalFrameHoldMs: 150,
    enabledFor: ['w'],
    variants: {
      b: {
        src: '/effects/queen_2d_move_black.mp4',
        height: '122%',
        mobileHeight: '114%',
        bottom: '-38%',
        mobileBottom: '-32%',
        greenKeyMin: 64,
        greenKeyDiff: 18,
        greenKeyFeather: 56,
        playbackRate: 2.5,
        finalFrameHoldMs: 150,
        enabledFor: ['b'],
      },
    },
  },
  r: {
    src: '/effects/rook_2d_move.mp4',
    crop: { x: 300, y: 0, w: 1960, h: 1440 },
    height: '108%',
    mobileHeight: '101%',
    bottom: '-27%',
    mobileBottom: '-23%',
    xOffset: '-104px',
    mobileXOffset: '-38px',
    edgeThreshold: 16,
    keyLow: 1,
    keyHigh: 24,
    greenKeyMin: 72,
    greenKeyDiff: 24,
    greenKeyFeather: 54,
    playbackRate: 1.0,
    finalFrameHoldMs: 180,
    enabledFor: ['w'],
    variants: {
      b: {
        src: '/effects/rook_2d_move_black.mp4',
        crop: { x: 0, y: 90, w: 2100, h: 1780 },
        height: '110%',
        mobileHeight: '104%',
        bottom: '-29%',
        mobileBottom: '-24%',
        xOffset: '-226px',
        mobileXOffset: '-102px',
        greenKeyMin: 64,
        greenKeyDiff: 18,
        greenKeyFeather: 56,
        playbackRate: 10.0,
        finalFrameHoldMs: 500,
        enabledFor: ['b'],
      },
    },
  },
}

void _disabledPieceVideo

const filterW = 'brightness(1.65) contrast(0.9) saturate(0.2) sepia(0.55) drop-shadow(1px 2px 1px rgba(80,50,0,0.4))'
const filterB = 'brightness(0.82) contrast(1.6) drop-shadow(0px 2px 4px rgba(0,8,35,0.9))'

// The clip's backdrop is pure black (lum === 0), but the statue's own shadow
// folds render down to near-zero luminance too — a plain per-pixel threshold
// can't tell them apart and punches holes through the cloak. Instead, flood-fill
// from the frame border through dark pixels (lum < EDGE_THRESHOLD): the backdrop
// is one blob touching every edge, while shadows *inside* the silhouette are
// surrounded by bright material and never connect to the border, so they survive.
// KEY_LOW/KEY_HIGH then only shape the soft alpha ramp at the background edge.
const EDGE_THRESHOLD = 18
const KEY_LOW = 1
const KEY_HIGH = 24
const DEFAULT_PLAYBACK_RATE = 2.0
const CANVAS_WIDTH = 640

// Keep the final drawn frame visible briefly so the hit pose lands before the
// overlay fades out.
const FINAL_FRAME_HOLD_MS = 500

// Must match `attack-video-fade-out`'s duration in globals.css — JS owns the
// unmount timing (via `onComplete`) but the fade itself is pure CSS, so the
// two have to agree on how long "leaving" lasts.
const FADE_OUT_MS = 200

function KeyedVideo({
  src,
  crop,
  edgeThreshold = EDGE_THRESHOLD,
  keyLow = KEY_LOW,
  keyHigh = KEY_HIGH,
  darkCleanupLow,
  darkCleanupHigh,
  darkLineProtectLum,
  darkLineProtectRadius = 0,
  darkLineProtectMinDirections = 1,
  greenKeyMin,
  greenKeyDiff = 32,
  greenKeyFeather = 64,
  greenKeyProtectLum,
  greenKeyStartTime,
  greenDarkCleanupLum,
  greenDarkCleanupMinArea = 0,
  playbackRate = DEFAULT_PLAYBACK_RATE,
  startTime = 0,
  trimEndTime,
  finalFrameHoldMs = FINAL_FRAME_HOLD_MS,
  monochrome = false,
  className,
  style,
  onComplete,
}: {
  src: string
  crop: Crop
  edgeThreshold?: number
  keyLow?: number
  keyHigh?: number
  darkCleanupLow?: number
  darkCleanupHigh?: number
  darkLineProtectLum?: number
  darkLineProtectRadius?: number
  darkLineProtectMinDirections?: number
  greenKeyMin?: number
  greenKeyDiff?: number
  greenKeyFeather?: number
  greenKeyProtectLum?: number
  greenKeyStartTime?: number
  greenDarkCleanupLum?: number
  greenDarkCleanupMinArea?: number
  playbackRate?: number
  startTime?: number
  trimEndTime?: number
  finalFrameHoldMs?: number
  monochrome?: boolean
  className?: string
  style?: React.CSSProperties
  onComplete: () => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const holdTimerRef = useRef<number | null>(null)
  const completeTimerRef = useRef<number | null>(null)
  const completedRef = useRef(false)
  const buffersRef = useRef<{ lum: Float32Array; bg: Uint8Array; seen: Uint8Array; queue: Int32Array; w: number; h: number } | null>(null)
  const canvasHeight = Math.round((crop.h / crop.w) * CANVAS_WIDTH)

  const finishPlayback = useCallback(() => {
    if (completedRef.current) return
    completedRef.current = true

    if (holdTimerRef.current !== null) window.clearTimeout(holdTimerRef.current)
    if (completeTimerRef.current !== null) window.clearTimeout(completeTimerRef.current)

    holdTimerRef.current = window.setTimeout(() => {
      canvasRef.current?.classList.add('is-leaving')
      completeTimerRef.current = window.setTimeout(onComplete, FADE_OUT_MS)
    }, finalFrameHoldMs)
  }, [finalFrameHoldMs, onComplete])

  useEffect(() => {
    return () => {
      if (holdTimerRef.current !== null) window.clearTimeout(holdTimerRef.current)
      if (completeTimerRef.current !== null) window.clearTimeout(completeTimerRef.current)
    }
  }, [])

  useEffect(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return
    canvas.classList.remove('is-ready', 'is-leaving')

    // `display: none` keeps autoplay from ever starting in Chromium, so the
    // source video must stay laid out (just visually hidden behind the canvas)
    // and playback must be kicked explicitly rather than relying on `autoPlay`.
    completedRef.current = false
    const safePlaybackRate = Math.max(0.25, Math.min(playbackRate, 16))
    try {
      video.playbackRate = safePlaybackRate
    } catch {
      video.playbackRate = DEFAULT_PLAYBACK_RATE
    }
    if (startTime > 0) {
      const seekToStart = () => {
        if (video.currentTime < startTime) {
          try { video.currentTime = startTime } catch { /* ignore */ }
        }
      }
      if (video.readyState >= HTMLMediaElement.HAVE_METADATA) seekToStart()
      else video.addEventListener('loadedmetadata', seekToStart, { once: true })
    }
    video.play().catch(() => {})

    let raf = 0
    let revealed = false
    const draw = () => {
      if (video.videoWidth) {
        if (trimEndTime !== undefined && revealed && video.currentTime >= trimEndTime) {
          video.pause()
          finishPlayback()
          return
        }

        const w = CANVAS_WIDTH
        const h = canvasHeight
        if (canvas.width !== w) {
          canvas.width = w
          canvas.height = h
        }

        const n = w * h
        let buf = buffersRef.current
        if (!buf || buf.w !== w || buf.h !== h) {
          buf = { lum: new Float32Array(n), bg: new Uint8Array(n), seen: new Uint8Array(n), queue: new Int32Array(n), w, h }
          buffersRef.current = buf
        }
        const { lum, bg, seen, queue } = buf
        bg.fill(0)

        ctx.drawImage(video, crop.x, crop.y, crop.w, crop.h, 0, 0, w, h)
        const frame = ctx.getImageData(0, 0, w, h)
        const d = frame.data

        for (let p = 0, i = 0; p < n; p++, i += 4) {
          lum[p] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
        }

        // BFS flood-fill the background inward from the frame border, only
        // travelling through dark pixels. The backdrop is one connected blob
        // touching every edge; shadow folds *inside* the silhouette are walled
        // off by brighter material and never get reached, so they stay opaque.
        const isGreenBackdrop = (i: number) => {
          if (greenKeyMin === undefined) return false
          const r = d[i]
          const g = d[i + 1]
          const b = d[i + 2]
          return g >= greenKeyMin && g - Math.max(r, b) >= greenKeyDiff
        }

        let greenBorderSamples = 0
        let greenFrameSamples = 0
        let frameSamples = 0
        const sampleBorder = (p: number) => {
          if (isGreenBackdrop(p * 4)) greenBorderSamples += 1
        }
        const sampleFrame = (p: number) => {
          frameSamples += 1
          if (isGreenBackdrop(p * 4)) greenFrameSamples += 1
        }
        for (let x = 0; x < w; x += 8) {
          sampleBorder(x)
          sampleBorder((h - 1) * w + x)
        }
        for (let y = 0; y < h; y += 8) {
          sampleBorder(y * w)
          sampleBorder(y * w + w - 1)
        }
        for (let y = 0; y < h; y += 16) {
          for (let x = 0; x < w; x += 16) {
            sampleFrame(y * w + x)
          }
        }
        const greenBackdropFrame =
          (greenKeyStartTime !== undefined && video.currentTime >= greenKeyStartTime) ||
          greenBorderSamples > 0 ||
          greenFrameSamples > frameSamples * 0.015

        let qHead = 0
        let qTail = 0
        const visit = (p: number) => {
          const i = p * 4
          const isBackdrop = greenBackdropFrame
            ? isGreenBackdrop(i)
            : lum[p] < edgeThreshold || isGreenBackdrop(i)

          if (!bg[p] && isBackdrop) {
            bg[p] = 1
            queue[qTail++] = p
          }
        }
        for (let x = 0; x < w; x++) {
          visit(x)
          visit((h - 1) * w + x)
        }
        for (let y = 0; y < h; y++) {
          visit(y * w)
          visit(y * w + w - 1)
        }
        while (qHead < qTail) {
          const p = queue[qHead++]
          const x = p % w
          if (x > 0) visit(p - 1)
          if (x < w - 1) visit(p + 1)
          if (p >= w) visit(p - w)
          if (p < n - w) visit(p + w)
        }

        for (let p = 0, i = 0; p < n; p++, i += 4) {
          if (!bg[p]) continue
          if (
            darkLineProtectLum !== undefined &&
            darkLineProtectRadius > 0 &&
            lum[p] <= keyHigh
          ) {
            const x = p % w
            const y = Math.floor(p / w)
            let subjectDirections = 0
            const directions = [
              [1, 0],
              [-1, 0],
              [0, 1],
              [0, -1],
              [1, 1],
              [-1, 1],
              [1, -1],
              [-1, -1],
            ]

            for (const [dx, dy] of directions) {
              let foundSubject = false
              for (let step = 1; step <= darkLineProtectRadius; step++) {
                const xx = x + dx * step
                const yy = y + dy * step
                if (xx < 0 || xx >= w || yy < 0 || yy >= h) break

                const next = yy * w + xx
                if (!bg[next] && lum[next] >= darkLineProtectLum) {
                  foundSubject = true
                  break
                }
              }

              if (foundSubject) subjectDirections += 1
            }

            if (subjectDirections >= darkLineProtectMinDirections) continue
          }
          if (isGreenBackdrop(i)) {
            d[i + 3] = 0
            continue
          }
          const l = lum[p]
          if (l <= keyLow) {
            d[i + 3] = 0
          } else {
            const a = (l - keyLow) / (keyHigh - keyLow)
            // Un-blend edge pixels from the assumed-black backdrop (observed = fg*a),
            // recovering their true color — otherwise translucent edges keep a dark
            // "matte fringe" baked in from the original blend with black.
            d[i] = Math.min(255, d[i] / a)
            d[i + 1] = Math.min(255, d[i + 1] / a)
            d[i + 2] = Math.min(255, d[i + 2] / a)
            d[i + 3] = Math.round(d[i + 3] * a)
          }
        }

        if (
          greenBackdropFrame &&
          greenDarkCleanupLum !== undefined &&
          greenDarkCleanupMinArea > 0
        ) {
          seen.fill(0)
          const isDarkResidue = (p: number) => !bg[p] && !seen[p] && d[p * 4 + 3] > 0 && lum[p] < greenDarkCleanupLum

          for (let start = 0; start < n; start++) {
            if (!isDarkResidue(start)) continue

            let qHead = 0
            let qTail = 0
            seen[start] = 1
            queue[qTail++] = start

            while (qHead < qTail) {
              const p = queue[qHead++]
              const x = p % w
              const visitDark = (next: number) => {
                if (isDarkResidue(next)) {
                  seen[next] = 1
                  queue[qTail++] = next
                }
              }
              if (x > 0) visitDark(p - 1)
              if (x < w - 1) visitDark(p + 1)
              if (p >= w) visitDark(p - w)
              if (p < n - w) visitDark(p + w)
            }

            if (qTail < greenDarkCleanupMinArea) continue
            for (let q = 0; q < qTail; q++) {
              d[queue[q] * 4 + 3] = 0
            }
          }
        }

        if (darkCleanupLow !== undefined && darkCleanupHigh !== undefined) {
          for (let p = 0, i = 0; p < n; p++, i += 4) {
            if (bg[p]) continue
            const l = lum[p]
            if (l <= darkCleanupLow) {
              d[i + 3] = 0
            } else if (l < darkCleanupHigh) {
              const a = (l - darkCleanupLow) / (darkCleanupHigh - darkCleanupLow)
              d[i + 3] = Math.round(d[i + 3] * a)
            }
          }
        }

        if (greenKeyMin !== undefined) {
          for (let p = 0, i = 0; p < n; p++, i += 4) {
            if (d[i + 3] === 0 || bg[p]) continue
            const r = d[i]
            const g = d[i + 1]
            const b = d[i + 2]
            const greenDiff = g - Math.max(r, b)
            if (
              greenKeyProtectLum !== undefined &&
              lum[p] < greenKeyProtectLum &&
              greenDiff < greenKeyDiff + 2
            ) {
              continue
            }
            const greenLift = g - greenKeyMin
            const removeByDiff = (greenDiff - greenKeyDiff) / greenKeyFeather
            const removeByLift = greenLift / greenKeyFeather
            const remove = Math.max(0, Math.min(1, Math.min(removeByDiff, removeByLift)))

            if (remove <= 0) continue
            d[i + 3] = Math.round(d[i + 3] * (1 - remove))

            if (d[i + 3] > 0) {
              // Knock down green spill on compressed edge pixels without
              // changing dark metal tones that were never keyed.
              d[i + 1] = Math.min(d[i + 1], Math.max(d[i], d[i + 2]) + 10)
            }
          }
        }

        if (monochrome) {
          for (let p = 0, i = 0; p < n; p++, i += 4) {
            if (d[i + 3] === 0) continue
            const gray = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2])
            d[i] = gray
            d[i + 1] = gray
            d[i + 2] = gray
          }
        }

        ctx.putImageData(frame, 0, 0)

        // `currentTime > 0` is the first point we know a real decoded frame
        // exists (vs. a blank/no-data frame that keys out to fully transparent).
        // Gate the slide-in until after that frame is drawn so the sprite never
        // reveals at the browser's default 300x150 canvas size.
        if (!revealed && video.currentTime > 0) {
          revealed = true
          canvas.classList.add('is-ready')
        }

      }
      if (!video.ended) raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [canvasHeight, crop.h, crop.w, crop.x, crop.y, darkCleanupHigh, darkCleanupLow, darkLineProtectLum, darkLineProtectMinDirections, darkLineProtectRadius, edgeThreshold, finishPlayback, greenDarkCleanupLum, greenDarkCleanupMinArea, greenKeyDiff, greenKeyFeather, greenKeyMin, greenKeyProtectLum, greenKeyStartTime, keyHigh, keyLow, monochrome, playbackRate, src, startTime, trimEndTime])

  return (
    <>
      <video
        ref={videoRef}
        src={src}
        autoPlay
        muted
        playsInline
        onEnded={finishPlayback}
        style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
      />
      <canvas
        ref={canvasRef}
        width={CANVAS_WIDTH}
        height={canvasHeight}
        className={className}
        style={style}
      />
    </>
  )
}

export default function AttackAnimation({
  piece,
  color,
  onComplete,
}: {
  piece: PieceSymbol
  color: Color
  onComplete: () => void
}) {
  const baseVideo = pieceVideo[piece]
  const video = baseVideo
    ? { ...baseVideo, ...baseVideo.variants?.[color] }
    : undefined

  if (video && (!video.enabledFor || video.enabledFor.includes(color))) {
    const videoStyle = {
      '--attack-video-height': video.height,
      '--attack-video-mobile-height': video.mobileHeight,
      '--attack-video-bottom': video.bottom,
      '--attack-video-mobile-bottom': video.mobileBottom,
      '--attack-video-x-offset': video.xOffset ?? '0px',
      '--attack-video-mobile-x-offset': video.mobileXOffset ?? video.xOffset ?? '0px',
    } as React.CSSProperties

    return (
      <div className="absolute inset-0 pointer-events-none z-20 overflow-hidden">
        <KeyedVideo
          src={video.src}
          crop={video.crop}
          edgeThreshold={video.edgeThreshold}
          keyLow={video.keyLow}
          keyHigh={video.keyHigh}
          darkCleanupLow={video.darkCleanupLow}
          darkCleanupHigh={video.darkCleanupHigh}
          darkLineProtectLum={video.darkLineProtectLum}
          darkLineProtectRadius={video.darkLineProtectRadius}
          darkLineProtectMinDirections={video.darkLineProtectMinDirections}
          greenKeyMin={video.greenKeyMin}
          greenKeyDiff={video.greenKeyDiff}
          greenKeyFeather={video.greenKeyFeather}
          greenKeyProtectLum={video.greenKeyProtectLum}
          greenKeyStartTime={video.greenKeyStartTime}
          greenDarkCleanupLum={video.greenDarkCleanupLum}
          greenDarkCleanupMinArea={video.greenDarkCleanupMinArea}
          playbackRate={video.playbackRate}
          startTime={video.startTime}
          trimEndTime={video.trimEndTime}
          finalFrameHoldMs={video.finalFrameHoldMs}
          monochrome={video.monochrome}
          onComplete={onComplete}
          className="absolute w-auto attack-video"
          style={videoStyle}
        />
      </div>
    )
  }

  return (
    <div className="absolute inset-0 pointer-events-none z-20 overflow-hidden">
      <img
        src={pieceFile[piece](color)}
        alt=""
        className="absolute w-auto attack-rpg"
        style={{
          filter: color === 'w' ? filterW : filterB,
          height: '90%',
          bottom: '-45%',
          left: '-60px',
        }}
        onAnimationEnd={onComplete}
      />
    </div>
  )
}
