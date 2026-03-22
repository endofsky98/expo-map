import "@/styles/globals.css";
import type { AppProps } from "next/app";
import Head from "next/head";
import { I18nProvider } from "@/lib/i18n";
import React from "react";

class GlobalErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[GlobalErrorBoundary]', error, info.componentStack);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ position: 'fixed', inset: 0, background: '#111', color: '#ff4444', padding: 16, fontSize: 11, fontFamily: 'monospace', overflow: 'auto', zIndex: 99999, whiteSpace: 'pre-wrap' }}>
          <strong>Error:</strong>{'\n'}
          {this.state.error.message}{'\n\n'}
          <strong>Stack:</strong>{'\n'}
          {this.state.error.stack}{'\n\n'}
          <button onClick={() => this.setState({ error: null })} style={{ marginTop: 16, padding: '8px 16px', background: '#333', color: '#fff', border: '1px solid #666', borderRadius: 4 }}>
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App({ Component, pageProps }: AppProps) {
  return (
    <GlobalErrorBoundary>
      <I18nProvider>
        <Head>
          <title>Expo Map</title>
          <meta name="viewport" content="width=device-width, initial-scale=1" />
        </Head>
        <Component {...pageProps} />
      </I18nProvider>
    </GlobalErrorBoundary>
  );
}
