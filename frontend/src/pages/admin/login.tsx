import { useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { Map, Lock } from 'lucide-react';
import { login as apiLogin } from '@/lib/api';
import { setToken } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';

export default function AdminLoginPage() {
  const { t } = useI18n();
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const result = await apiLogin(username, password);
      setToken(result.access_token);
      router.push('/admin');
    } catch {
      setError(t('login.error'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Head>
        <title>{t('login.title')} - {t('app.title')}</title>
      </Head>
      <div className="min-h-screen flex">
        {/* Left gradient panel */}
        <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-indigo-600 to-indigo-800 items-center justify-center p-12">
          <div className="text-center text-white">
            <Map className="h-16 w-16 mx-auto mb-6 opacity-90" />
            <h1 className="text-3xl font-bold mb-3">{t('app.title')}</h1>
            <p className="text-indigo-200 text-lg">{t('admin.panel')}</p>
          </div>
        </div>

        {/* Right form panel */}
        <div className="flex-1 flex items-center justify-center p-8 bg-gray-50 dark:bg-[#141414]">
          <div className="w-full max-w-sm">
            <div className="lg:hidden flex items-center gap-2 text-indigo-600 dark:text-indigo-400 mb-8 justify-center">
              <Map className="h-8 w-8" />
              <span className="font-bold text-xl">{t('app.title')}</span>
            </div>

            <div className="bg-white dark:bg-[#1e1e1e] rounded-xl shadow-sm border border-gray-200 dark:border-gray-500/40 p-8">
              <div className="flex items-center gap-2 mb-6">
                <Lock className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  {t('login.title')}
                </h2>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {t('login.username')}
                  </label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                    className="w-full px-4 py-3 rounded-lg border border-gray-200 bg-transparent outline-none transition
                      focus:ring-2 focus:ring-indigo-600/20 focus:border-indigo-600
                      placeholder:text-gray-400
                      dark:border-gray-500/40 dark:bg-[#2a2a2a] dark:text-gray-100
                      dark:focus:ring-indigo-400/30 dark:focus:border-indigo-400"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {t('login.password')}
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="w-full px-4 py-3 rounded-lg border border-gray-200 bg-transparent outline-none transition
                      focus:ring-2 focus:ring-indigo-600/20 focus:border-indigo-600
                      placeholder:text-gray-400
                      dark:border-gray-500/40 dark:bg-[#2a2a2a] dark:text-gray-100
                      dark:focus:ring-indigo-400/30 dark:focus:border-indigo-400"
                  />
                </div>
                {error && <p className="text-sm text-red-500">{error}</p>}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400 transition-colors disabled:opacity-50"
                >
                  {loading ? t('admin.loading') : t('login.submit')}
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
