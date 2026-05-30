import { Component, ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

interface Props {
  children: ReactNode
  fallbackTitle?: string
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error('[ErrorBoundary] Caught render error:', error, info.componentStack)
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="max-w-md w-full text-center space-y-4">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto"
              style={{ background: 'var(--danger-subtle, #fff1f0)' }}
            >
              <AlertTriangle size={28} style={{ color: 'var(--danger, #e5484d)' }} />
            </div>
            <div>
              <h2
                className="text-[18px] font-semibold mb-1"
                style={{ color: 'var(--text-primary)' }}
              >
                {this.props.fallbackTitle ?? 'Something went wrong'}
              </h2>
              <p
                className="text-[14px]"
                style={{ color: 'var(--text-secondary)' }}
              >
                This page ran into an error. You can try reloading it or navigate to another section.
              </p>
              {this.state.error && (
                <p
                  className="mt-3 text-[12px] font-mono px-3 py-2 rounded-lg text-left break-all"
                  style={{
                    background: 'var(--bg-subtle, #f8f8f8)',
                    color: 'var(--text-tertiary)',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  {this.state.error.message}
                </p>
              )}
            </div>
            <button
              onClick={this.handleReset}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-[14px] font-medium transition-colors"
              style={{
                background: 'var(--accent)',
                color: '#fff',
              }}
            >
              <RefreshCw size={14} />
              Try again
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
