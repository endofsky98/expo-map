import { NextPageContext } from 'next';

function ErrorPage({ statusCode }: { statusCode?: number }) {
  return null;
}

ErrorPage.getInitialProps = ({ res, err }: NextPageContext) => {
  const statusCode = res ? res.statusCode : err ? (err as any).statusCode : 404;
  return { statusCode };
};

export default ErrorPage;
