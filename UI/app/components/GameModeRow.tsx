'use client'

export default function GameModeRow({
  localMode,
  onLocalModeChange,
  onResetBoard,
  isDisabled,
}: {
  localMode: boolean
  onLocalModeChange: (v: boolean) => void
  onResetBoard: () => void
  isDisabled: boolean
}) {
  return (
    <>
      <div className="flex items-center gap-2">
        <span className="text-xs text-stone-500">Game Mode</span>
        <button
          role="switch"
          aria-checked={localMode}
          onClick={() => onLocalModeChange(!localMode)}
          className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200 focus-visible:outline-none ${
            localMode ? 'bg-[#1d4ed8]' : 'bg-stone-300'
          }`}
        >
          <span className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${
            localMode ? 'translate-x-[18px]' : 'translate-x-0.5'
          }`} />
        </button>
      </div>
      <button
        onClick={onResetBoard}
        disabled={!localMode && isDisabled}
        className="text-xs px-3 py-2 rounded-md border border-stone-200 bg-white text-stone-600 hover:bg-stone-50 hover:text-stone-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Reset Board
      </button>
    </>
  )
}
