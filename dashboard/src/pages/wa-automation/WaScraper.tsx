import { useState } from 'react';
import { Search, RefreshCw, AlertTriangle, ExternalLink, FileText, Zap } from 'lucide-react';
import { Card, CardBody } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { PageSkeleton } from '../../components/Skeleton';
import { useToast } from '../../components/Toast';
import { useWaArticlesQuery, useRunScraperMutation, useRunAllScraperMutation, useUnseedScraperMutation } from '../../hooks/wa-queries';

export default function WaScraper() {
  const { data: articles = [], isLoading, isRefetching, refetch } = useWaArticlesQuery();
  const runMutate = useRunScraperMutation();
  const runAllMutate = useRunAllScraperMutation();
  const unseedMutate = useUnseedScraperMutation();
  const { success, error: showError } = useToast();
  const [runUrl, setRunUrl] = useState('');
  const [message, setMessage] = useState('');

  const handleRun = async () => {
    if (!runUrl.trim()) return;
    setMessage('');
    try {
      const result = await runMutate.mutateAsync(runUrl);
      setMessage(result.detected ? `Scraped: ${result.article?.title}` : 'No new content found at that URL');
      setRunUrl('');
    } catch (e: any) {
      setMessage(`Error: ${e.message}`);
      showError('Scraper error', e.message);
    }
  };

  const handleRunAll = async () => {
    setMessage('');
    try {
      const result = await runAllMutate.mutateAsync();
      setMessage(`Scraped ${result.scraped} new article(s) from configured URLs`);
      success('Scraper run complete', `${result.scraped} new article(s)`);
    } catch (e: any) {
      setMessage(`Error: ${e.message}`);
      showError('Scraper error', e.message);
    }
  };

  const handleUnseed = async () => {
    setMessage('');
    try {
      const result = await unseedMutate.mutateAsync();
      setMessage(`Unseeded and re-scraped — found ${result.scraped} article(s)`);
      success('Unseed complete', `${result.scraped} article(s) scraped`);
    } catch (e: any) {
      setMessage(`Error: ${e.message}`);
      showError('Failed to unseed', e.message);
    }
  };

  if (isLoading) return <PageSkeleton />;

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text)]">Scraper</h1>
        <p className="text-sm text-[var(--color-text-secondary)] mt-1">Scrape articles and manage content sources</p>
      </div>

      {/* Action bar */}
      <Card>
        <CardBody className="space-y-4">
          {/* Quick actions */}
          <div className="flex flex-col sm:flex-row gap-3">
            <Button icon={Zap} onClick={handleRunAll} loading={runAllMutate.isPending}>
              Run All
            </Button>
            <Button variant="danger" icon={AlertTriangle} onClick={handleUnseed} loading={unseedMutate.isPending}>
              Unseed & Re-scrape
            </Button>
            <Button variant="secondary" icon={RefreshCw} onClick={() => refetch()} loading={isRefetching}>
              Refresh
            </Button>
          </div>

          {/* Manual URL scrape */}
          <hr className="border-[var(--color-border)]" />
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <Input
                value={runUrl}
                onChange={e => setRunUrl(e.target.value)}
                placeholder="Or enter a specific URL to scrape..."
                onKeyDown={e => e.key === 'Enter' && handleRun()}
              />
            </div>
            <Button icon={Search} onClick={handleRun} loading={runMutate.isPending}>
              Scrape URL
            </Button>
          </div>

          {message && (
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-400 px-4 py-2.5 rounded-lg text-sm">
              {message}
            </div>
          )}
        </CardBody>
      </Card>

      {/* Articles */}
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)] mb-4 flex items-center gap-2">
          <FileText size={14} />
          Recent Articles ({articles.length})
        </h2>

        {articles.length === 0 ? (
          <Card>
            <CardBody>
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Search size={40} className="text-[var(--color-text-muted)] mb-3" />
                <p className="text-sm font-medium text-[var(--color-text-secondary)]">No articles yet</p>
                <p className="text-xs text-[var(--color-text-muted)] mt-1">Click "Run All" to scrape configured URLs or "Unseed & Re-scrape" to force a fresh scrape</p>
              </div>
            </CardBody>
          </Card>
        ) : (
          <div className="space-y-2">
            {articles.map((a: any) => (
              <Card key={a.id} hover>
                <div className="px-5 py-3.5 flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-[var(--color-text)] truncate">
                      {a.title || 'Untitled'}
                    </p>
                    <p className="text-xs text-[var(--color-text-secondary)] mt-1">
                      {a.sourceName} · {new Date(a.createdAt).toLocaleString()}
                    </p>
                  </div>
                  {a.url && (
                    <a
                      href={a.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[var(--color-text-muted)] hover:text-[var(--color-primary)] transition-colors flex-shrink-0 mt-0.5"
                    >
                      <ExternalLink size={14} />
                    </a>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
