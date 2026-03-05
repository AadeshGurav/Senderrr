"""Add skip_warmup flag to AdminAccount."""

from __future__ import annotations

from django.db import migrations, models


class Migration(migrations.Migration):
    """Add skip_warmup boolean to AdminAccount."""

    dependencies = [
        ("campaigns", "0005_add_admin_account"),
    ]

    operations = [
        migrations.AddField(
            model_name="adminaccount",
            name="skip_warmup",
            field=models.BooleanField(
                default=False,
                help_text="Number already warmed up — skip the 7-day ramp period.",
            ),
        ),
    ]
