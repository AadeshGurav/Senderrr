"""Dashboard forms — group management and settings."""

from __future__ import annotations

from django import forms

from apps.campaigns.models import WhatsAppGroup


class GroupForm(forms.ModelForm):
    """Form for adding a new WhatsApp group."""

    class Meta:
        model = WhatsAppGroup
        fields = ("name", "group_jid")
        widgets = {
            "name": forms.TextInput(attrs={"placeholder": "Group display name"}),
            "group_jid": forms.TextInput(
                attrs={"placeholder": "Group JID or search name"}
            ),
        }


class SettingsForm(forms.Form):
    """Form for editing runtime configuration."""

    SCRAPER_TARGET_URL = forms.URLField(
        label="Target URL",
        help_text="Website to monitor for new articles.",
    )
    SCRAPER_REQUEST_TIMEOUT = forms.IntegerField(
        label="Request timeout (seconds)",
        min_value=5,
        max_value=120,
    )
    SCRAPER_MAX_RETRIES = forms.IntegerField(
        label="Max retries",
        min_value=1,
        max_value=10,
    )
    AUTOMATION_JITTER_MIN = forms.FloatField(
        label="Jitter min (seconds)",
        min_value=5,
        help_text="Minimum anti-ban delay between sends.",
    )
    AUTOMATION_JITTER_MAX = forms.FloatField(
        label="Jitter max (seconds)",
        min_value=10,
        help_text="Maximum anti-ban delay between sends.",
    )
    AUTOMATION_HOURLY_LIMIT = forms.IntegerField(
        label="Hourly limit",
        min_value=1,
        max_value=100,
        help_text="Max messages per hour (across all workers).",
    )
    AUTOMATION_DAILY_LIMIT = forms.IntegerField(
        label="Daily limit",
        min_value=1,
        max_value=1000,
        help_text="Max messages per day (across all workers).",
    )
    AUTOMATION_QUIET_HOUR_START = forms.IntegerField(
        label="Quiet hours start",
        min_value=0,
        max_value=23,
        help_text="No sends after this hour (local timezone).",
    )
    AUTOMATION_QUIET_HOUR_END = forms.IntegerField(
        label="Quiet hours end",
        min_value=0,
        max_value=23,
        help_text="No sends before this hour (local timezone).",
    )
    AUTOMATION_WORKER_COUNT = forms.IntegerField(
        label="Parallel workers",
        min_value=1,
        max_value=4,
        help_text="Number of browser windows (max 4). Restart required.",
    )
    AUTOMATION_WORKER_STAGGER = forms.IntegerField(
        label="Worker stagger (seconds)",
        min_value=15,
        max_value=300,
        help_text="Delay between each worker's first send.",
    )
    AUTOMATION_MAX_CONCURRENT_SENDS = forms.IntegerField(
        label="Max concurrent sends",
        min_value=1,
        max_value=4,
        help_text="Max workers sending at the exact same instant.",
    )
