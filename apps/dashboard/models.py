"""Dashboard models — runtime configuration store."""

from django.db import models


class RuntimeSetting(models.Model):
    """Key-value store for settings editable from the web UI.

    Falls back to django.conf.settings when no DB override exists.
    """

    key = models.CharField(max_length=100, unique=True, db_index=True)
    value = models.TextField()
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["key"]
        verbose_name = "Runtime Setting"
        verbose_name_plural = "Runtime Settings"

    def __str__(self) -> str:
        return f"{self.key} = {self.value[:50]}"
