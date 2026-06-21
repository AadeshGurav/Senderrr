import { useState, useEffect } from 'react';
import { Save, Settings } from 'lucide-react';
import { Card, CardBody } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { PageSkeleton } from '../../components/Skeleton';
import { useToast } from '../../components/Toast';
import { useWaSettingsQuery, useUpdateSettingsMutation } from '../../hooks/wa-queries';

const SETTING_LABELS: Record<string, string> = {
  SCRAPER_TARGET_URLS: 'Scraper Target URLs',
  SCRAPER_ACTIVE_HOUR_START: 'Scraper Active Hour Start',
  SCRAPER_ACTIVE_HOUR_END: 'Scraper Active Hour End',
  SCRAPER_ACTIVE_WEEKDAYS: 'Scraper Active Weekdays',
  AUTOMATION_HOURLY_LIMIT: 'Hourly Rate Limit',
  AUTOMATION_DAILY_LIMIT: 'Daily Rate Limit',
  AUTOMATION_BATCH_SIZE: 'Batch Size',
  AUTOMATION_BATCH_COOLDOWN: 'Batch Cooldown (s)',
  AUTOMATION_JITTER_MIN: 'Min Jitter (s)',
  AUTOMATION_JITTER_MAX: 'Max Jitter (s)',
  AUTOMATION_JITTER_MULTIPLIER: 'Jitter Multiplier',
  AUTOMATION_QUIET_HOUR_START: 'Quiet Hour Start',
  AUTOMATION_QUIET_HOUR_END: 'Quiet Hour End',
  MESSAGE_MAX_RETRY_ATTEMPTS: 'Max Retry Attempts',
  GROUP_MAX_CONSECUTIVE_FAILURES: 'Max Consecutive Failures',
  GROUP_UNHEALTHY_RECOVERY_HOURS: 'Recovery Hours',
};

const SETTING_SECTIONS = [
  {
    title: 'Scraper',
    keys: ['SCRAPER_TARGET_URLS', 'SCRAPER_ACTIVE_HOUR_START', 'SCRAPER_ACTIVE_HOUR_END', 'SCRAPER_ACTIVE_WEEKDAYS'],
  },
  {
    title: 'Automation',
    keys: ['AUTOMATION_HOURLY_LIMIT', 'AUTOMATION_DAILY_LIMIT', 'AUTOMATION_BATCH_SIZE', 'AUTOMATION_BATCH_COOLDOWN', 'AUTOMATION_JITTER_MIN', 'AUTOMATION_JITTER_MAX', 'AUTOMATION_JITTER_MULTIPLIER', 'AUTOMATION_QUIET_HOUR_START', 'AUTOMATION_QUIET_HOUR_END'],
  },
  {
    title: 'Messages',
    keys: ['MESSAGE_MAX_RETRY_ATTEMPTS', 'GROUP_MAX_CONSECUTIVE_FAILURES', 'GROUP_UNHEALTHY_RECOVERY_HOURS'],
  },
];

export default function WaSettings() {
  const { data: settingsData, isLoading } = useWaSettingsQuery();
  const updateMutate = useUpdateSettingsMutation();
  const { success, error: showError } = useToast();
  const [settings, setSettings] = useState<Record<string, string>>({});

  useEffect(() => {
    if (settingsData) {
      const merged: Record<string, string> = {};
      for (const key of Object.keys(SETTING_LABELS)) {
        const existing = settingsData.find((s: any) => s.key === key);
        merged[key] = existing?.value ?? '';
      }
      setSettings(merged);
    }
  }, [settingsData]);

  const handleSave = async () => {
    try {
      const entries = Object.entries(settings)
        .filter(([, v]) => v !== '')
        .map(([key, value]) => ({ key, value }));
      await updateMutate.mutateAsync(entries);
      success('Settings saved', 'Configuration updated successfully');
    } catch (e: any) {
      showError('Failed to save settings', e.message);
    }
  };

  if (isLoading) return <PageSkeleton />;

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text)]">Settings</h1>
        <p className="text-sm text-[var(--color-text-secondary)] mt-1">Configure scraper, automation, and message parameters</p>
      </div>

      {SETTING_SECTIONS.map(section => {
        const sectionKeys = section.keys.filter(k => settings[k] !== undefined);
        if (sectionKeys.length === 0) return null;
        return (
          <Card key={section.title}>
            <CardBody className="space-y-4">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-secondary)] flex items-center gap-2">
                <Settings size={14} />
                {section.title}
              </h2>
              {sectionKeys.map(key => (
                <Input
                  key={key}
                  label={SETTING_LABELS[key] || key}
                  value={settings[key] ?? ''}
                  onChange={e => setSettings(prev => ({ ...prev, [key]: e.target.value }))}
                />
              ))}
            </CardBody>
          </Card>
        );
      })}

      <div className="flex justify-end">
        <Button icon={Save} onClick={handleSave} loading={updateMutate.isPending} size="lg">
          Save Settings
        </Button>
      </div>
    </div>
  );
}
