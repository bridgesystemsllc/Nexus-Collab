export function LandingPage() {
  const signIn = () => {
    window.location.href = '/api/login'
  }

  return (
    <div className="min-h-screen flex" style={{ background: 'var(--bg-base)' }}>
      {/* Left — brand / pitch */}
      <div
        className="hidden md:flex flex-col justify-between w-1/2 p-12 relative overflow-hidden"
        style={{
          background:
            'linear-gradient(160deg, var(--accent) 0%, #5b21b6 60%, #1e1b4b 100%)',
        }}
      >
        <div className="text-white">
          <div className="text-[22px] font-bold tracking-tight">NEXUS</div>
          <div className="text-[13px] opacity-80 mt-1">Kareve Beauty Group</div>
        </div>

        <div className="text-white max-w-md">
          <h1 className="text-[40px] font-bold leading-[1.1] tracking-tight">
            One workspace for every department.
          </h1>
          <p className="text-[16px] opacity-85 mt-5 leading-relaxed">
            Real-time visibility across R&D, Operations, Warehouse, Vendors and
            Finance — with AI briefings and shared cowork spaces.
          </p>
        </div>

        <div className="text-white/70 text-[12px]">
          © {new Date().getFullYear()} Kareve Beauty Group
        </div>
      </div>

      {/* Right — sign in */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          <div className="md:hidden mb-8">
            <div className="text-[22px] font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
              NEXUS
            </div>
            <div className="text-[13px] mt-1" style={{ color: 'var(--text-tertiary)' }}>
              Kareve Beauty Group
            </div>
          </div>

          <h2 className="text-[26px] font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
            Welcome back
          </h2>
          <p className="text-[14px] mt-2" style={{ color: 'var(--text-secondary)' }}>
            Sign in to access your department workspace.
          </p>

          <button
            onClick={signIn}
            className="mt-8 w-full flex items-center justify-center gap-2 rounded-lg py-3 text-[15px] font-semibold text-white transition-opacity hover:opacity-90"
            style={{ background: 'var(--accent)' }}
          >
            Sign in with Replit
          </button>

          <p className="text-[12px] mt-6 leading-relaxed" style={{ color: 'var(--text-tertiary)' }}>
            We use Replit to verify your identity so every action in NEXUS is
            attributed to the right person.
          </p>
        </div>
      </div>
    </div>
  )
}
