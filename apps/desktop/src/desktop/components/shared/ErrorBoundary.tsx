import React from 'react'

type Props = {
  children: React.ReactNode
  label?: string
}

type State = {
  error: Error | null
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[renderer] render error', {
      label: this.props.label,
      error,
      componentStack: info.componentStack,
    })
  }

  private reload = () => {
    window.location.reload()
  }

  private reset = () => {
    this.setState({ error: null })
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="flex h-full min-h-0 flex-col items-center justify-center gap-3 bg-bg-primary p-6 text-center">
        <div className="max-w-sm rounded-lg border border-border bg-bg-secondary p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-text-primary">
            Something went wrong
          </h2>
          <p className="mt-2 text-xs text-text-secondary">
            {this.props.label ? `${this.props.label} could not render.` : 'This view could not render.'}
          </p>
          <pre className="mt-3 max-h-28 overflow-auto rounded-md bg-bg-tertiary p-2 text-left text-[11px] text-text-muted">
            {this.state.error.message}
          </pre>
          <div className="mt-4 flex justify-center gap-2">
            <button
              type="button"
              onClick={this.reset}
              className="rounded-md border border-border px-3 py-1.5 text-xs text-text-secondary hover:bg-bg-hover"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={this.reload}
              className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg hover:bg-accent-hover"
            >
              Reload
            </button>
          </div>
        </div>
      </div>
    )
  }
}
