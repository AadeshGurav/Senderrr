"""Advertisement models — manual campaign sends with optional media."""

from __future__ import annotations

from django.db import models


class Advertisement(models.Model):
    """A manually composed broadcast campaign with optional media attachments."""

    class TargetType(models.TextChoices):
        ALL_GROUPS = "all_groups", "All Groups"
        ALL_COMMUNITIES = "all_communities", "All Communities"
        SPECIFIC = "specific", "Specific"

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        QUEUED = "queued", "Queued"
        SENDING = "sending", "Sending"
        COMPLETED = "completed", "Completed"
        FAILED = "failed", "Failed"

    title = models.CharField(
        max_length=200,
        help_text="Internal label for this campaign.",
    )
    body = models.TextField(
        help_text="Message body. Supports WhatsApp formatting (*bold*, _italic_, ~strikethrough~).",
    )
    target_type = models.CharField(
        max_length=20,
        choices=TargetType.choices,
        default=TargetType.ALL_GROUPS,
        db_index=True,
    )
    target_groups = models.ManyToManyField(
        "campaigns.WhatsAppGroup",
        blank=True,
        related_name="advertisements",
        help_text="Used when target_type is SPECIFIC.",
    )
    target_communities = models.ManyToManyField(
        "campaigns.WhatsAppCommunity",
        blank=True,
        related_name="advertisements",
        help_text="Used when target_type is SPECIFIC.",
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.DRAFT,
        db_index=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    sent_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        app_label = "campaigns"
        ordering = ["-created_at"]
        verbose_name = "Advertisement"
        verbose_name_plural = "Advertisements"

    def __str__(self) -> str:
        return f"{self.title} [{self.status}]"

    @property
    def first_media(self) -> MediaAttachment | None:
        """Return the first media attachment, or None."""
        return self.media_attachments.first()

    @property
    def has_media(self) -> bool:
        """True if this advertisement has at least one media file."""
        return self.media_attachments.exists()


class MediaAttachment(models.Model):
    """A single file attached to an Advertisement."""

    class MediaType(models.TextChoices):
        IMAGE = "image", "Image"
        VIDEO = "video", "Video"
        DOCUMENT = "document", "Document"

    advertisement = models.ForeignKey(
        Advertisement,
        on_delete=models.CASCADE,
        related_name="media_attachments",
    )
    file = models.FileField(upload_to="advertisements/")
    media_type = models.CharField(
        max_length=10,
        choices=MediaType.choices,
        default=MediaType.IMAGE,
    )
    original_filename = models.CharField(max_length=255)
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        app_label = "campaigns"
        ordering = ["uploaded_at"]
        verbose_name = "Media Attachment"
        verbose_name_plural = "Media Attachments"

    def __str__(self) -> str:
        return f"{self.media_type}: {self.original_filename}"
