import { useState, useEffect } from 'react';
import { Save, Settings, Globe } from 'lucide-react';
import { Card, CardBody } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { PageSkeleton } from '../../components/Skeleton';
import { useToast } from '../../components/Toast';
import { useWaSettingsQuery, useUpdateSettingsMutation } from '../../hooks/wa-queries';

const COMMON_TIMEZONES = [
  { value: 'UTC', label: 'UTC (Coordinated Universal Time)' },
  { value: 'America/New_York', label: 'Eastern Time (US/Canada)' },
  { value: 'America/Chicago', label: 'Central Time (US/Canada)' },
  { value: 'America/Denver', label: 'Mountain Time (US/Canada)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (US/Canada)' },
  { value: 'America/Anchorage', label: 'Alaska' },
  { value: 'Pacific/Honolulu', label: 'Hawaii' },
  { value: 'Europe/London', label: 'London / GMT' },
  { value: 'Europe/Paris', label: 'Paris / CET' },
  { value: 'Europe/Berlin', label: 'Berlin' },
  { value: 'Europe/Moscow', label: 'Moscow' },
  { value: 'Europe/Istanbul', label: 'Istanbul' },
  { value: 'Asia/Dubai', label: 'Dubai / Gulf' },
  { value: 'Asia/Karachi', label: 'Pakistan' },
  { value: 'Asia/Kolkata', label: 'India' },
  { value: 'Asia/Dhaka', label: 'Bangladesh' },
  { value: 'Asia/Bangkok', label: 'Bangkok / Indochina' },
  { value: 'Asia/Singapore', label: 'Singapore' },
  { value: 'Asia/Shanghai', label: 'China' },
  { value: 'Asia/Tokyo', label: 'Tokyo / Japan' },
  { value: 'Asia/Seoul', label: 'Seoul / Korea' },
  { value: 'Australia/Sydney', label: 'Sydney / AEST' },
  { value: 'Australia/Perth', label: 'Perth / AWST' },
  { value: 'Pacific/Auckland', label: 'New Zealand' },
  { value: 'Pacific/Fiji', label: 'Fiji' },
];

const SETTING_LABELS: Record<string, string> = {
  TIMEZONE: 'Timezone',
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
    title: 'General',
    keys: ['TIMEZONE'],
  },
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

  // Determine if the user has a custom TZ not in the list
  const tzValue = settings.TIMEZONE ?? '';
  const isCustomTz = tzValue && !COMMON_TIMEZONES.find(t => t.value === tzValue);

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
              {sectionKeys.map(key => {
                if (key === 'TIMEZONE') {
                  const v = settings.TIMEZONE ?? '';
                  return (
                    <div key={key} className="space-y-1.5">
                      <label className="block text-sm font-medium text-[var(--color-text-secondary)] flex items-center gap-1.5">
                        <Globe size={14} />
                        Timezone
                      </label>
                      <select
                        value={isCustomTz ? '__custom__' : v}
                        onChange={e => {
                          if (e.target.value === '__custom__') return; // keep current
                          setSettings(prev => ({ ...prev, TIMEZONE: e.target.value }));
                        }}
                        className="w-full px-3.5 py-2.5 text-sm bg-[var(--color-bg-secondary)]
                          border border-[var(--color-border)] rounded-xl text-[var(--color-text)]
                          focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20 focus:border-[var(--color-primary)]
                          transition-all duration-200 cursor-pointer"
                      >
                        <option value="" disabled>Select timezone...</option>
                        {COMMON_TIMEZONES.map(tz => (
                          <option key={tz.value} value={tz.value}>{tz.label}</option>
                        ))}
                        {isCustomTz && (
                          <option value="__custom__">{v}</option>
                        )}
                      </select>
                      {isCustomTz && (
                        <p className="text-xs text-[var(--color-text-muted)]">
                          Current: {v} — type below to change
                        </p>
                      )}
                      <input
                        type="text"
                        value={v}
                        onChange={e => setSettings(prev => ({ ...prev, TIMEZONE: e.target.value }))}
                        placeholder="Or type any IANA timezone (e.g., Asia/Kolkata)"
                        className="w-full px-3.5 py-2 text-xs bg-[var(--color-bg)] border border-[var(--color-border)]
                          rounded-lg text-[var(--color-text-muted)] placeholder:text-[var(--color-text-muted)]
                          focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]/20 font-mono mt-1"
                      />
                    </div>
                  );
                }
                return (
                  <Input
                    key={key}
                    label={SETTING_LABELS[key] || key}
                    value={settings[key] ?? ''}
                    onChange={e => setSettings(prev => ({ ...prev, [key]: e.target.value }))}
                  />
                );
              })}
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
