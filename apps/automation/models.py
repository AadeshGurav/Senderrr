"""Automation models — worker session tracking and event logging."""

from __future__ import annotations

from django.db import models


class WorkerSession(models.Model):
    """Tracks a Celery worker process and its browser state."""

    class Status(models.TextChoices):
        STARTING = "starting", "Starting"
        ACTIVE = "active", "Active"
        IDLE = "idle", "Idle"
        ERROR = "error", "Error"
        OFFLINE = "offline", "Offline"

    class BrowserStatus(models.TextChoices):
        LAUNCHING = "launching", "Launching"
        LOGGED_IN = "logged_in", "Logged In"
        QR_REQUIRED = "qr_required", "QR Required"
        BANNED = "banned", "Banned"
        UNKNOWN = "unknown", "Unknown"

    worker_id = models.CharField(max_length=255, unique=True, db_index=True)
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.STARTING,
    )
    browser_status = models.CharField(
        max_length=20,
        choices=BrowserStatus.choices,
        default=BrowserStatus.UNKNOWN,
    )
    started_at = models.DateTimeField(auto_now_add=True)
    last_heartbeat_at = models.DateTimeField(null=True, blank=True)
    total_sent = models.PositiveIntegerField(default=0)
    total_failed = models.PositiveIntegerField(default=0)
    current_task_id = models.CharField(max_length=255, blank=True, default="")
    current_group = models.CharField(max_length=255, blank=True, default="")
    last_error = models.TextField(blank=True, default="")
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["worker_id"]
        verbose_name = "Worker Session"
        verbose_name_plural = "Worker Sessions"

    def __str__(self) -> str:
        return f"Worker {self.worker_id} [{self.status}]"


class WorkerSessionLog(models.Model):
    """Immutable event log for worker session state transitions."""

    class Event(models.TextChoices):
        STARTED = "started", "Started"
        LOGGED_IN = "logged_in", "Logged In"
        QR_DETECTED = "qr_detected", "QR Detected"
        ERROR = "error", "Error"
        BAN_DETECTED = "ban_detected", "Ban Detected"
        HEARTBEAT = "heartbeat", "Heartbeat"
        TASK_STARTED = "task_started", "Task Started"
        TASK_COMPLETED = "task_completed", "Task Completed"
        TASK_FAILED = "task_failed", "Task Failed"
        SHUTDOWN = "shutdown", "Shutdown"

    worker_session = models.ForeignKey(
        WorkerSession,
        on_delete=models.CASCADE,
        related_name="logs",
    )
    event = models.CharField(max_length=20, choices=Event.choices, db_index=True)
    detail = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "Worker Session Log"
        verbose_name_plural = "Worker Session Logs"

    def __str__(self) -> str:
        return f"{self.worker_session.worker_id}: {self.event} @ {self.created_at}"
