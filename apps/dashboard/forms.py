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
