'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Inter } from 'next/font/google'

const inter = Inter({ subsets: ['latin'], weight: ['100'] })

type ConnectStatus = 'idle' | 'connecting' | 'done'

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  )
}

export default function IntroPage() {
  const router = useRouter()
  const [status, setStatus] = useState<ConnectStatus>('idle')

  const handleConnect = () => {
    if (status !== 'idle') return
    setStatus('connecting')
    setTimeout(() => setStatus('done'), 2200)
    setTimeout(() => router.push('/game'), 3000)
  }

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#071426]">
      {/* Radial dim overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse at center, rgba(12,25,43,0) 0%, rgba(3,18,40,1) 100%)',
        }}
      />

      {/* Knight video */}
      <video
        autoPlay
        loop
        muted
        playsInline
        aria-hidden="true"
        className="
          fixed
          pointer-events-none
          select-none
          z-[1]
          h-auto
          max-w-none
          -translate-x-1/2
          blur-[2px]
          opacity-50
          mix-blend-color-dodge
      
          w-[350vw]
          left-[calc(50%+17vw)]
          top-[6vh]
      
          md:w-[260vw]
          md:left-[calc(50%+10vw)]
          md:top-[1vh]
      
          xl:w-[180vw]
          xl:left-[calc(50%+10vw)]
          xl:top-[0vh]
      
          2xl:w-[150vw]
          2xl:left-[calc(50%+6vw)]
          2xl:top-[0vh]
        "
      >
        <source src="/intro/piece-knight.webm" type="video/webm" />
      </video>

      {/* Content layer */}
      <div className="relative z-10 h-full">
        {/* Title block */}
        <div
          className="
            absolute left-1/2 -translate-x-1/2 flex flex-col items-center
            w-full px-5
            top-[calc(50%-136px)]
            md:w-auto md:px-0 md:top-[30%]
            lg:top-[24%]
          "
        >
          <img
            src="/intro/wizard.svg"
            alt="Wizard"
            className="
              w-full mb-[-6px]
              md:w-[401px] md:mb-[-14px]
              lg:w-[522px] lg:mb-[-14px]
            "
          />

          {/* — Team DA — divider */}
          <div className="flex items-center w-full gap-7 md:gap-7 lg:gap-[40px]">
            <div className="flex-1 h-px bg-white/40" />
            <span
              className={`${inter.className} text-white/80 whitespace-nowrap team-da-spacing`}
              style={{ fontWeight: 100, fontSize: '14px' }}
            >
              Team DA
            </span>
            <div className="flex-1 h-px bg-white/40" />
          </div>

          <img
            src="/intro/chess.svg"
            alt="Chess"
            className="
              w-full mt-[-20px]
              md:w-[343px] md:mt-[-18px]
              lg:w-[437px] lg:mt-[-14px]
            "
          />
        </div>

        {/* Connect button */}
        <div
          className="
            absolute left-1/2 -translate-x-1/2
            bottom-0 pb-6 px-5 w-full flex flex-col items-center
            md:bottom-auto md:top-[69.6%] md:w-auto md:px-0
            lg:top-[73.9%]
          "
        >
          <button
            onClick={handleConnect}
            disabled={status !== 'idle'}
            className={`
              flex items-center justify-center gap-2
              w-full md:w-[240px] rounded-[8px] px-8 py-4
              text-[16px] font-medium transition-all duration-200
              ${
                status === 'idle'
                  ? 'bg-white text-[#00357d] md:hover:bg-[#cde2ff] md:hover:font-bold'
                  : status === 'connecting'
                    ? 'cursor-not-allowed bg-white/80 text-[#00357d]/50'
                    : 'bg-emerald-500 text-white'
              }
            `}
          >
            {status === 'idle' && 'Connect'}
            {status === 'connecting' && (
              <>
                <Spinner />
                Connecting...
              </>
            )}
            {status === 'done' && '✓  Done!'}
          </button>

          <p
            className={`mt-4 text-xs text-white/40 text-center transition-opacity duration-300 ${
              status === 'idle' ? 'opacity-0' : 'opacity-100'
            }`}
          >
            {status === 'connecting' && 'Establishing connection with the board…'}
            {status === 'done' && 'Board connected. Launching game…'}
            {status === 'idle' && ' '}
          </p>
        </div>
      </div>
    </div>
  )
}
