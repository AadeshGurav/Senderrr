from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("automation", "0002_add_admin_to_worker_session"),
    ]

    operations = [
        migrations.CreateModel(
            name="SelectorRecord",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("name", models.CharField(db_index=True, max_length=100, unique=True)),
                ("css_selector", models.TextField()),
                ("last_verified_at", models.DateTimeField(blank=True, null=True)),
                ("failed_count", models.PositiveIntegerField(default=0)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={
                "verbose_name": "Selector Record",
                "verbose_name_plural": "Selector Records",
                "ordering": ["name"],
            },
        ),
    ]
