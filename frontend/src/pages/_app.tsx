import "@/styles/globals.css";
import type { AppProps } from "next/app";
import Head from "next/head";
import { I18nProvider } from "@/lib/i18n";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <I18nProvider>
      <Head>
        <title>Expo Map</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <Component {...pageProps} />
    </I18nProvider>
  );
}
