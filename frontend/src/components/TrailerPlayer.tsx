import { useEffect, useRef, useState } from 'react'
import type Hls from 'hls.js'
import type { Movie } from '../types/game'

type PlaybackMode = 'file' | 'native-hls' | 'hlsjs' | 'unsupported'

function pickMode(video: HTMLVideoElement, movie: Movie, hlsSupported: boolean): PlaybackMode {
  if (movie.mp4 || movie.webm) return 'file' // apps antiguas con ficheros progresivos
  if (!movie.hls) return 'unsupported'
  // Safari (macOS/iOS) y la mayoría de WebView Android reproducen HLS de forma nativa.
  if (video.canPlayType('application/vnd.apple.mpegurl')) return 'native-hls'
  return hlsSupported ? 'hlsjs' : 'unsupported'
}

/**
 * Reproductor de tráileres de Steam (que hoy se sirven como HLS .m3u8).
 * - HLS nativo cuando el navegador lo soporta (iOS, Android WebView, Safari).
 * - hls.js (import dinámico, chunk aparte) en el resto de escritorio.
 * - playsInline + controles nativos para que funcione dentro del WebView de Capacitor.
 * - No descarga segmentos hasta que el usuario pulsa play (ahorro de datos en móvil).
 */
export function TrailerPlayer({ movie, autoPlay = false, onUnavailable }: {
  movie: Movie
  autoPlay?: boolean
  onUnavailable?: () => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<PlaybackMode | null>(null)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    let hls: Hls | null = null
    let cancelled = false
    setError(null)

    const fail = (msg: string) => {
      if (cancelled) return
      setError(msg)
      onUnavailable?.()
    }

    const setup = async () => {
      // hls.js solo se descarga si hace falta: en iOS/Android nunca se pide.
      const needsLib = !(movie.mp4 || movie.webm) && movie.hls && !video.canPlayType('application/vnd.apple.mpegurl')
      // Build "light": sin DRM/subtítulos/audio alternativo, de sobra para tráileres.
      const HlsLib = needsLib ? (await import('hls.js/light')).default : null
      if (cancelled) return
      const m = pickMode(video, movie, Boolean(HlsLib?.isSupported()))
      setMode(m)

      if (m === 'file') {
        video.src = movie.webm && video.canPlayType('video/webm') ? movie.webm : (movie.mp4 ?? movie.webm)!
      } else if (m === 'native-hls') {
        video.src = movie.hls!
      } else if (m === 'hlsjs' && HlsLib) {
        hls = new HlsLib({ autoStartLoad: false, capLevelToPlayerSize: true, startLevel: -1 })
        hls.attachMedia(video)
        hls.loadSource(movie.hls!)
        let started = false
        const start = () => {
          if (!started && hls) {
            started = true
            hls.startLoad()
          }
        }
        video.addEventListener('play', start, { once: true })
        if (autoPlay) start()
        let recovered = false
        hls.on(HlsLib.Events.ERROR, (_evt, data) => {
          if (!data.fatal || !hls) return
          if (data.type === HlsLib.ErrorTypes.MEDIA_ERROR && !recovered) {
            recovered = true
            hls.recoverMediaError()
          } else if (data.type === HlsLib.ErrorTypes.NETWORK_ERROR && !recovered) {
            recovered = true
            hls.startLoad()
          } else {
            fail('No se pudo cargar el tráiler.')
          }
        })
      } else if (m === 'unsupported') {
        fail('Tu navegador no puede reproducir este tráiler.')
      }
      if (autoPlay && m !== 'unsupported') video.play().catch(() => { /* autoplay bloqueado: el usuario pulsará play */ })
    }

    setup().catch(() => fail('No se pudo cargar el reproductor.'))

    return () => {
      cancelled = true
      hls?.destroy()
      video.pause()
      video.removeAttribute('src')
      video.load()
    }
  }, [movie.id, movie.hls, movie.mp4, movie.webm])

  return (
    <div className="relative size-full bg-black">
      <video
        ref={videoRef}
        className="size-full object-contain"
        poster={movie.thumbnail}
        controls
        playsInline
        {...{ 'webkit-playsinline': 'true' }}
        preload="none"
        controlsList="nodownload"
        disablePictureInPicture={false}
        onError={() => mode === 'native-hls' || mode === 'file' ? setError('No se pudo cargar el tráiler.') : undefined}
        aria-label={movie.name ?? 'Tráiler'}
      />
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 p-6 text-center text-sm text-slate-300">
          {error}
        </div>
      )}
    </div>
  )
}
