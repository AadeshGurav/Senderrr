"""Management command to add WhatsApp groups for broadcast targeting."""

from __future__ import annotations

from django.core.management.base import BaseCommand, CommandError

from apps.campaigns.models import WhatsAppGroup


class Command(BaseCommand):
    """Add, list, or manage WhatsApp groups for broadcasting.

    Usage::

        python manage.py add_group "Family Chat"
        python manage.py add_group "Work Updates" --jid "work-updates-group"
        python manage.py add_group --list
        python manage.py add_group --deactivate "Old Group"
        python manage.py add_group --activate "Old Group"
    """

    help = "Add, list, or manage WhatsApp groups for broadcasting."

    def add_arguments(self, parser) -> None:  # noqa: ANN001
        """Define CLI arguments."""
        parser.add_argument(
            "name",
            nargs="?",
            type=str,
            help="Exact group name as it appears in WhatsApp.",
        )
        parser.add_argument(
            "--jid",
            type=str,
            default="",
            help=(
                "Group identifier used for searching. "
                "Defaults to the group name if not provided."
            ),
        )
        parser.add_argument(
            "--list",
            action="store_true",
            dest="list_groups",
            help="List all configured groups and exit.",
        )
        parser.add_argument(
            "--deactivate",
            type=str,
            metavar="NAME",
            help="Deactivate a group by name (excludes from future broadcasts).",
        )
        parser.add_argument(
            "--activate",
            type=str,
            metavar="NAME",
            help="Re-activate a previously deactivated group.",
        )

    def handle(self, *args: object, **options: object) -> str:
        """Execute the command."""
        if options["list_groups"]:
            return self._list_groups()

        if options["deactivate"]:
            return self._set_active(str(options["deactivate"]), active=False)

        if options["activate"]:
            return self._set_active(str(options["activate"]), active=True)

        name = options.get("name")
        if not name:
            raise CommandError(
                "Provide a group name, or use --list to see existing groups."
            )

        return self._add_group(str(name), str(options["jid"]))

    def _add_group(self, name: str, jid: str) -> str:
        """Create a new WhatsApp group entry."""
        group_jid = jid or name

        group, created = WhatsAppGroup.objects.get_or_create(
            group_jid=group_jid,
            defaults={"name": name, "is_active": True},
        )

        if created:
            self.stdout.write(
                self.style.SUCCESS(f'Added group: "{name}" (jid="{group_jid}")')
            )
            return f"Created: {name}"

        self.stdout.write(
            self.style.WARNING(f'Group "{name}" already exists (pk={group.pk}).')
        )
        return f"Already exists: {name}"

    def _list_groups(self) -> str:
        """Print all groups with their status."""
        groups = WhatsAppGroup.objects.all()

        if not groups.exists():
            self.stdout.write(self.style.WARNING("No groups configured yet."))
            self.stdout.write(
                'Add one with: python manage.py add_group "Group Name"'
            )
            return "No groups"

        self.stdout.write(self.style.MIGRATE_HEADING("\nWhatsApp Groups:"))
        self.stdout.write("-" * 60)

        for group in groups:
            status = (
                self.style.SUCCESS("ACTIVE")
                if group.is_active
                else self.style.ERROR("INACTIVE")
            )
            self.stdout.write(
                f"  {group.name:<30} {status}  (jid={group.group_jid})"
            )

        self.stdout.write("-" * 60)
        active = groups.filter(is_active=True).count()
        total = groups.count()
        self.stdout.write(f"  {active}/{total} active\n")
        return f"{active}/{total} active"

    def _set_active(self, name: str, *, active: bool) -> str:
        """Activate or deactivate a group by name."""
        try:
            group = WhatsAppGroup.objects.get(name=name)
        except WhatsAppGroup.DoesNotExist:
            raise CommandError(
                f'Group "{name}" not found. Use --list to see all groups.'
            )

        group.is_active = active
        group.save(update_fields=["is_active"])

        action = "Activated" if active else "Deactivated"
        self.stdout.write(self.style.SUCCESS(f'{action}: "{name}"'))
        return f"{action}: {name}"
