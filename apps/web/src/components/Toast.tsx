import type { ReactNode } from 'react'
import { createContext, useCallback, useContext, useMemo, useState } from 'react'

type Toast = { id: number; message: string; tone: 'ok' | 'error' }

const ToastContext = createContext<{
  show: (message: string, tone?: Toast['tone']) => void
}>({ show: () => {} })

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const show = useCallback((message: string, tone: Toast['tone'] = 'ok') => {
    const id = Date.now() + Math.random()
    setToasts((current) => [...current, { id, message, tone }])
    setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 3200)
  }, [])

  const value = useMemo(() => ({ show }), [show])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4"
        style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
        aria-live="polite"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-none rounded-full px-4 py-2 text-sm font-medium shadow-lg ${
              toast.tone === 'error' ? 'bg-red-600 text-accent-ink' : 'bg-accent text-accent-ink'
            }`}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export const useToast = () => useContext(ToastContext)
