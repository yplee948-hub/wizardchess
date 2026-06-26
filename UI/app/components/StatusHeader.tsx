import { Cinzel } from 'next/font/google'
import { ConnectionStatus } from '@/app/lib/chess'

const cinzel = Cinzel({ subsets: ['latin'], weight: ['700'] })

const statusConfig: Record<ConnectionStatus, { dot: string; label: string }> = {
  connected: { dot: 'bg-green-500', label: 'Connected' },
  disconnected: { dot: 'bg-red-500', label: 'Disconnected' },
  syncing: { dot: 'bg-yellow-400 animate-pulse', label: 'Syncing…' },
}

export default function StatusHeader({ status }: { status: ConnectionStatus }) {
  const { dot, label } = statusConfig[status]
  return (
    <header className="flex items-center justify-between px-6 py-3 bg-[#edeff3]">
      <div className="flex items-center gap-0">
        <img
          src="/pieces/header-knight.svg"
          alt=""
          aria-hidden="true"
          className="shrink-0 h-[34px] w-auto"
        />
        <span className={`${cinzel.className} font-bold text-[#1c1917] text-[16px] whitespace-nowrap`}>
          Wizard Chess
        </span>
      </div>
      <div className="flex items-center gap-2 text-sm text-stone-500">
        <span className={`inline-block w-2 h-2 rounded-full ${dot}`} />
        <span>{label}</span>
      </div>
    </header>
  )
}
