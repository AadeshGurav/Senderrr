"""Dashboard forms — group management and settings."""

from __future__ import annotations

from django import forms

from apps.campaigns.message_template_models import MessageTemplate
from apps.campaigns.models import (
    AdminAccount,
    Advertisement,
    WhatsAppCommunity,
    WhatsAppGroup,
)


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


class AdvertisementForm(forms.ModelForm):
    """Form for composing a broadcast advertisement with optional media."""

    media_file = forms.FileField(
        required=False,
        label="Attachment",
        help_text="Optional image, video, or document (jpg, png, mp4, pdf…).",
    )

    class Meta:
        model = Advertisement
        fields = (
            "title",
            "body",
            "target_type",
            "target_groups",
            "target_communities",
            "package_days",
            "preferred_time",
        )
        widgets = {
            "title": forms.TextInput(attrs={"placeholder": "Campaign title…"}),
            "body": forms.Textarea(
                attrs={
                    "rows": 4,
                    "placeholder": "Message body (WhatsApp formatting ok)…",
                }
            ),
            "target_type": forms.Select(),
            "target_groups": forms.CheckboxSelectMultiple(),
            "target_communities": forms.CheckboxSelectMultiple(),
            "package_days": forms.NumberInput(attrs={"min": 1, "max": 30, "value": 1}),
            "preferred_time": forms.TimeInput(attrs={"type": "time"}, format="%H:%M"),
        }


class AdvertisementEditForm(forms.ModelForm):
    """Form for editing an existing advertisement's content mid-campaign.

    Excludes target selection and package_days — those are fixed at creation.
    """

    media_file = forms.FileField(
        required=False,
        label="Replace Attachment",
        help_text="Upload to replace current media, or leave empty to keep existing.",
    )

    class Meta:
        model = Advertisement
        fields = ("title", "body", "preferred_time")
        widgets = {
            "title": forms.TextInput(attrs={"placeholder": "Campaign title…"}),
            "body": forms.Textarea(
                attrs={
                    "rows": 4,
                    "placeholder": "Message body (WhatsApp formatting ok)…",
                }
            ),
            "preferred_time": forms.TimeInput(attrs={"type": "time"}, format="%H:%M"),
        }


class MessageTemplateForm(forms.ModelForm):
    """Form for editing the active message template."""

    class Meta:
        model = MessageTemplate
        fields = ("name", "template_text")
        widgets = {
            "name": forms.TextInput(attrs={"placeholder": "e.g. Default News Template"}),
            "template_text": forms.Textarea(attrs={"rows": 14}),
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
    SCRAPER_MAX_ARTICLE_AGE_HOURS = forms.IntegerField(
        label="Max article age (hours)",
        min_value=1,
        max_value=720,
        help_text=(
            "Articles older than this when first detected are skipped silently. "
            "Default: 12 h. Increase before long weekends (e.g. 96 for 4-day break)."
        ),
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
