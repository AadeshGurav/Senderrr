"""Make Advertisement.title optional (blank=True, default='')."""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        (
            "campaigns",
            "0007_advertisement_mediaattachment_broadcastevent_advertisement",
        ),
    ]

    operations = [
        migrations.AlterField(
            model_name="advertisement",
            name="title",
            field=models.CharField(
                blank=True,
                default="",
                help_text="Internal label for this campaign (optional).",
                max_length=200,
            ),
        ),
    ]
