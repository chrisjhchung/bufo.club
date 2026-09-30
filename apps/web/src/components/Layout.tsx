import { NavLink, Outlet } from 'react-router'
import { useTheme } from '../lib/hooks'
import { useManifest } from '../lib/manifest'

const links = [
  { to: '/', label: 'Browse' },
  { to: '/make', label: 'Make' },
  { to: '/mosaic', label: 'Mosaic' },
  { to: '/upload', label: 'Upload' },
  { to: '/about', label: 'About' },
]

export function Layout() {
  const { dark, toggle } = useTheme()
  const { bufos, loading } = useManifest()

  return (
    <div className="min-h-dvh">
      <header
        className="sticky z-30 border-b border-line bg-paper/80 backdrop-blur-xl"
        style={{ top: 'env(safe-area-inset-top, 0px)' }}
      >
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-5 py-4">
          <NavLink to="/" className="group flex items-center gap-2.5">
            <img
              src="/bufo-smile.png"
              alt=""
              width={26}
              height={26}
              className="size-6.5 object-contain transition-transform duration-500 ease-[var(--ease-settle)] group-hover:-rotate-6"
            />
            <span className="display text-2xl">Bufo Club</span>
          </NavLink>

          <nav className="flex items-center gap-5 text-sm">
            {links.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.to === '/'}
                className={({ isActive }) =>
                  `relative py-1 transition-colors duration-200 ease-[var(--ease-gentle)] ${
                    isActive ? 'text-ink' : 'text-ink-soft hover:text-ink'
                  } after:absolute after:inset-x-0 after:-bottom-0.5 after:h-px after:origin-left after:bg-ink after:transition-transform after:duration-300 after:ease-[var(--ease-settle)] ${
                    isActive ? 'after:scale-x-100' : 'after:scale-x-0 hover:after:scale-x-100'
                  }`
                }
              >
                {link.label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-4">
            <span className="eyebrow hidden tabular-nums sm:inline">
              {loading ? '—' : `${bufos.length.toLocaleString()} bufos`}
            </span>
            <button
              type="button"
              onClick={toggle}
              aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
              className="lift grid size-8 place-items-center rounded-full border border-line text-ink-soft hover:bg-raise hover:text-ink"
            >
              <svg
                viewBox="0 0 24 24"
                className="size-3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
              >
                <title>{dark ? 'Light mode' : 'Dark mode'}</title>
                {dark ? (
                  <>
                    <circle cx="12" cy="12" r="4.5" />
                    <path
                      strokeLinecap="round"
                      d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"
                    />
                  </>
                ) : (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M20 13.5A8 8 0 0110.5 4a8.5 8.5 0 109.5 9.5z"
                  />
                )}
              </svg>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-5 py-10">
        <Outlet />
      </main>
    </div>
  )
}
