import { Info } from 'lucide-react';
import { Card, CardBody } from './Card';

const code = (s: string) => (
  <code className="px-1.5 py-0.5 rounded bg-[var(--color-bg)] text-[var(--color-primary)] text-xs font-mono border border-[var(--color-border)]">
    {s}
  </code>
);

const items = [
  { section: 'WhatsApp Markdown Formatting', rows: [
    { code: '*text*', desc: 'Bold text' },
    { code: '_text_', desc: 'Italic text' },
    { code: '~text~', desc: 'Strikethrough text' },
    { code: '`code`', desc: 'Monospace code' },
  ]},
  { section: 'Dynamic Variables (auto-substituted)', rows: [
    { code: '{{current_date}}', desc: 'Current date (e.g. 21/06/2026)' },
    { code: '{{current_time}}', desc: 'Current time (e.g. 12:30:45)' },
    { code: '{{current_datetime}}', desc: 'ISO datetime' },
    { code: '{{current_timestamp}}', desc: 'Unix timestamp' },
  ]},
  { section: 'News Placeholders (from articles)', rows: [
    { code: '{{news.title}}', desc: 'Article headline' },
    { code: '{{news.description}}', desc: 'Article summary' },
    { code: '{{news.url}}', desc: 'Full article URL' },
    { code: '{{news.source}}', desc: 'Source publication' },
    { code: '{{news.published_at}}', desc: 'Article publish date' },
    { code: '{{news.time}}', desc: 'Current send time' },
  ]},
];

export default function MarkdownGuide() {
  return (
    <Card>
      <CardBody>
        <div className="flex items-start gap-3">
          <Info size={18} className="text-blue-500 mt-0.5 flex-shrink-0" />
          <div className="space-y-4 flex-1">
            <h3 className="text-sm font-semibold">Markdown & Variables Guide</h3>
            {items.map(section => (
              <div key={section.section}>
                <p className="text-xs font-medium text-[var(--color-text-secondary)] mb-2">{section.section}</p>
                <div className="space-y-1">
                  {section.rows.map(row => (
                    <div key={row.code} className="flex items-center gap-3 text-xs">
                      <span className="w-32 flex-shrink-0">{code(row.code)}</span>
                      <span className="text-[var(--color-text-muted)]">{row.desc}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
