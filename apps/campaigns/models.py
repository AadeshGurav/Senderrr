"""Campaigns app — models for broadcast orchestration."""

from django.db import models

from apps.scraper.models import ScrapedArticle


class WhatsAppGroup(models.Model):
    """A WhatsApp group to receive broadcast messages."""

    name = models.CharField(max_length=255, help_text="Human-readable group name.")
    group_jid = models.CharField(
        max_length=255,
        unique=True,
        db_index=True,
        help_text="URL-safe group identifier (e.g. group invite link suffix).",
    )
    is_active = models.BooleanField(
        default=True,
        db_index=True,
        help_text="Inactive groups are excluded from broadcasts.",
    )
    created_at = models.DateTimeField(auto_now_add=True)

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
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.QUEUED,
        db_index=True,
    )
    error_message = models.TextField(blank=True, default="")
    queued_at = models.DateTimeField(auto_now_add=True)
    sent_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["queued_at"]
        verbose_name = "Message Task"
        verbose_name_plural = "Message Tasks"

    def __str__(self) -> str:
        return f"Msg #{self.pk} → {self.group.name} [{self.status}]"
