"""Campaigns app — models for broadcast orchestration."""

from __future__ import annotations

from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models

from apps.campaigns.ad_models import Advertisement, MediaAttachment
from apps.campaigns.message_template_models import MessageTemplate
from apps.scraper.models import ScrapedArticle

__all__ = [
    "Advertisement",
    "MediaAttachment",
    "AdminAccount",
    "ErrorCategory",
    "WhatsAppCommunity",
    "WhatsAppGroup",
    "BroadcastEvent",
    "MessageTask",
    "MessageAttempt",
]


class ErrorCategory(models.TextChoices):
    """Categorisation of message delivery failures."""

    RATE_LIMITED = "rate_limited", "Rate Limited"
    SESSION_EXPIRED = "session_expired", "Session Expired"
    GROUP_NOT_FOUND = "group_not_found", "Group Not Found"
    TIMEOUT = "timeout", "Timeout"
    SEND_FAILED = "send_failed", "Send Failed"
    BOT_DETECTED = "bot_detected", "Bot Detected"
    UNKNOWN = "unknown", "Unknown"


class AdminAccount(models.Model):
    """A WhatsApp phone number used for sending — owns N browser sessions."""

    label = models.CharField(
        max_length=50,
        help_text='Display label, e.g. "Admin 1".',
    )
    phone_number = models.CharField(
        max_length=20,
        unique=True,
        db_index=True,
        help_text="Phone number for identification (e.g. +91XXXXXXXXXX).",
    )
    is_active = models.BooleanField(
        default=True,
        db_index=True,
        help_text="Inactive admin is excluded from broadcast assignment.",
    )
    sessions_per_admin = models.PositiveSmallIntegerField(
        default=2,
        validators=[MinValueValidator(1), MaxValueValidator(4)],
        help_text="Browser sessions (linked devices) for this admin (1–4).",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    warm_up_started_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When this number started its warm-up phase.",
    )
    skip_warmup = models.BooleanField(
        default=False,
        help_text="Number already warmed up — skip the 7-day ramp period.",
    )
    total_sent = models.PositiveIntegerField(default=0)
    total_failed = models.PositiveIntegerField(default=0)
    last_sent_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["label"]
        verbose_name = "Admin Account"
        verbose_name_plural = "Admin Accounts"

    def __str__(self) -> str:
        status = "active" if self.is_active else "inactive"
        return f"{self.label} ({self.phone_number}) [{status}]"


class WhatsAppCommunity(models.Model):
    """A WhatsApp Community — a container for an Announcement Channel and Sub-groups."""

    name = models.CharField(max_length=255, help_text="Human-readable community name.")
    community_jid = models.CharField(
        max_length=255,
        unique=True,
        db_index=True,
        help_text="Community search name used in WhatsApp Web chat list.",
    )
    is_active = models.BooleanField(
        default=True,
        db_index=True,
        help_text="Inactive community excludes all its sub-groups from broadcasts.",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    total_sent = models.PositiveIntegerField(default=0)
    total_failed = models.PositiveIntegerField(default=0)
    last_sent_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["name"]
        verbose_name = "WhatsApp Community"
        verbose_name_plural = "WhatsApp Communities"

    def __str__(self) -> str:
        status = "✓" if self.is_active else "✗"
        return f"[{status}] {self.name}"


class WhatsAppGroup(models.Model):
    """A WhatsApp group to receive broadcast messages."""

    name = models.CharField(max_length=255, help_text="Human-readable group name.")
    group_jid = models.CharField(
        max_length=255,
        unique=True,
        db_index=True,
        help_text="URL-safe group identifier (e.g. group invite link suffix).",
    )
    community = models.ForeignKey(
        WhatsAppCommunity,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="subgroups",
        help_text="Parent community if this group is a community sub-group.",
    )
    is_announcement_channel = models.BooleanField(
        default=False,
        help_text="True for the community Announcement Channel (admin-only posting).",
    )
    is_active = models.BooleanField(
        default=True,
        db_index=True,
        help_text="Inactive groups are excluded from broadcasts.",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    # --- Delivery tracking (updated atomically by attempt_tracker) ---
    total_sent = models.PositiveIntegerField(default=0)
    total_failed = models.PositiveIntegerField(default=0)
    last_sent_at = models.DateTimeField(null=True, blank=True)
    last_failed_at = models.DateTimeField(null=True, blank=True)
    consecutive_failures = models.PositiveIntegerField(default=0)
    is_healthy = models.BooleanField(
        default=True,
        db_index=True,
        help_text="Auto-set False after N consecutive failures.",
    )

    class Meta:
        ordering = ["name"]
        verbose_name = "WhatsApp Group"
        verbose_name_plural = "WhatsApp Groups"

    def __str__(self) -> str:
        status = "✓" if self.is_active else "✗"
        return f"[{status}] {self.name}"


class BroadcastEvent(models.Model):
    """A single broadcast triggered by a content change."""

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        IN_PROGRESS = "in_progress", "In Progress"
        COMPLETED = "completed", "Completed"
        FAILED = "failed", "Failed"

    article = models.ForeignKey(
        ScrapedArticle,
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="broadcasts",
    )
    advertisement = models.ForeignKey(
        "Advertisement",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="broadcasts",
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING,
        db_index=True,
    )
    total_groups = models.PositiveIntegerField(default=0)
    sent_count = models.PositiveIntegerField(default=0)
    failed_count = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "Broadcast Event"
        verbose_name_plural = "Broadcast Events"

    def __str__(self) -> str:
        return (
            f"Broadcast #{self.pk} — {self.status} "
            f"({self.sent_count}/{self.total_groups})"
        )


class MessageTask(models.Model):
    """A single send job: one message to one group."""

    class Status(models.TextChoices):
        QUEUED = "queued", "Queued"
        SENDING = "sending", "Sending"
        SENT = "sent", "Sent"
        FAILED = "failed", "Failed"

    broadcast = models.ForeignKey(
        BroadcastEvent,
        on_delete=models.CASCADE,
        related_name="message_tasks",
    )
    group = models.ForeignKey(
        WhatsAppGroup,
        on_delete=models.CASCADE,
        related_name="message_tasks",
    )
    admin = models.ForeignKey(
        AdminAccount,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="message_tasks",
        help_text="Admin account that sent (or will send) this message.",
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.QUEUED,
        db_index=True,
    )
    worker_id = models.SmallIntegerField(
        null=True,
        blank=True,
        db_index=True,
        help_text="Celery worker that handled this send.",
    )
    error_message = models.TextField(blank=True, default="")
    error_category = models.CharField(
        max_length=30,
        choices=ErrorCategory.choices,
        null=True,
        blank=True,
        db_index=True,
    )
    attempt_count = models.PositiveIntegerField(default=0)
    last_attempted_at = models.DateTimeField(null=True, blank=True)
    next_retry_at = models.DateTimeField(null=True, blank=True)
    queued_at = models.DateTimeField(auto_now_add=True)
    sent_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["queued_at"]
        verbose_name = "Message Task"
        verbose_name_plural = "Message Tasks"

    def __str__(self) -> str:
        return f"Msg #{self.pk} → {self.group.name} [{self.status}]"


class MessageAttempt(models.Model):
    """Immutable audit record for a single send attempt."""

    class Status(models.TextChoices):
        STARTED = "started", "Started"
        SUCCEEDED = "succeeded", "Succeeded"
        FAILED = "failed", "Failed"

    message_task = models.ForeignKey(
        MessageTask,
        on_delete=models.CASCADE,
        related_name="attempts",
    )
    attempt_number = models.PositiveSmallIntegerField()
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.STARTED,
    )
    error_category = models.CharField(
        max_length=30,
        choices=ErrorCategory.choices,
        null=True,
        blank=True,
    )
    error_message = models.TextField(blank=True, default="")
    screenshot_path = models.CharField(max_length=512, blank=True, default="")
    started_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["started_at"]
        verbose_name = "Message Attempt"
        verbose_name_plural = "Message Attempts"

    def __str__(self) -> str:
        return (
            f"Attempt #{self.attempt_number} for Msg #{self.message_task_id} "
            f"[{self.status}]"
        )
