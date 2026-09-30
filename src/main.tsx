import { StrictMode, Component, type ReactNode, type ErrorInfo } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Intercept unhandled worker/script errors and plain object rejections
if (typeof window !== 'undefined') {
  window.addEventListener('error', (event) => {
    // Intercept Worker errors or errors that don't have standard Error instances
    if (!event.error || typeof event.error !== 'object' || !(event.error instanceof Error)) {
      console.warn('Global error intercepted safely:', event.message || event);
      if (typeof event.preventDefault === 'function') {
        event.preventDefault();
      }
    }
  });

  window.addEventListener('unhandledrejection', (event) => {
    console.warn('Global unhandled rejection intercepted safely:', event.reason);
    if (typeof event.preventDefault === 'function') {
      event.preventDefault();
    }
  });
}

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class AppErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    const err = error instanceof Error ? error : new Error(String(error || 'Une erreur inattendue est survenue'));
    return { hasError: true, error: err };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('AppErrorBoundary caught error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center shadow-2xl">
            <div className="w-12 h-12 rounded-xl bg-amber-500/20 text-amber-400 mx-auto flex items-center justify-center font-bold text-xl mb-4">
              ♟
            </div>
            <h2 className="text-lg font-bold text-white mb-2">Une interruption est survenue</h2>
            <p className="text-xs text-slate-400 mb-6">
              L'échiquier a rencontré un imprévu temporaire. Vos données et votre progression restent préservées.
            </p>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-semibold transition-colors cursor-pointer"
            >
              Recharger l'analyse
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>
);
