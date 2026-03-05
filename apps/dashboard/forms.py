"""Dashboard forms — group management and settings."""

from __future__ import annotations

from django import forms

from apps.campaigns.models import AdminAccount, WhatsAppCommunity, WhatsAppGroup


class AdminForm(forms.ModelForm):
    """Form for adding or editing an admin account."""

    class Meta:
        model = AdminAccount
        fields = ("label", "phone_number", "sessions_per_admin", "skip_warmup")
        widgets = {
            "label": forms.TextInput(attrs={"placeholder": "Admin 1"}),
            "phone_number": forms.TextInput(attrs={"placeholder": "+91XXXXXXXXXX"}),
            "sessions_per_admin": forms.NumberInput(
                attrs={"min": 1, "max": 4, "value": 2}
            ),
            "skip_warmup": forms.CheckboxInput(),
        }


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


class CommunityForm(forms.ModelForm):
    """Form for adding a new WhatsApp Community."""

    class Meta:
        model = WhatsAppCommunity
        fields = ("name", "community_jid")
        widgets = {
            "name": forms.TextInput(attrs={"placeholder": "Community display name"}),
            "community_jid": forms.TextInput(
                attrs={"placeholder": "Community search name in WhatsApp Web"}
            ),
        }


class SettingsForm(forms.Form):
    """Form for editing runtime configuration."""

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
