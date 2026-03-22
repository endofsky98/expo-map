import { NextPageContext } from 'next';

function ErrorPage({ statusCode, err }: { statusCode?: number; err?: Error }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#111', color: '#ff4444', padding: 16, fontSize: 11, fontFamily: 'monospace', overflow: 'auto', zIndex: 99999, whiteSpace: 'pre-wrap' }}>
      <strong>Error Page (status: {statusCode || 'unknown'})</strong>{'\n\n'}
      {err ? (
        <>
          <strong>Message:</strong> {err.message}{'\n'}
          <strong>Stack:</strong>{'\n'}{err.stack}
        </>
      ) : (
        'No error details available. Check browser console.'
      )}
      {'\n\n'}
      <button onClick={() => window.location.reload()} style={{ padding: '8px 16px', background: '#333', color: '#fff', border: '1px solid #666', borderRadius: 4 }}>
        Reload
      </button>
    </div>
  );
}

ErrorPage.getInitialProps = ({ res, err }: NextPageContext) => {
  const statusCode = res ? res.statusCode : err ? (err as any).statusCode : 404;
  return { statusCode, err };
};

export default ErrorPage;
