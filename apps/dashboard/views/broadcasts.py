"""Dashboard broadcast views — listing, detail, and retry actions."""

from __future__ import annotations

from django.conf import settings
from django.contrib.auth.decorators import login_required
from django.db.models import F
from django.http import HttpRequest, HttpResponse
from django.shortcuts import get_object_or_404, render
from django.views.decorators.http import require_POST

from apps.campaigns.models import BroadcastEvent, MessageTask, WhatsAppGroup


def _max_attempts() -> int:
    return getattr(settings, "MESSAGE_MAX_RETRY_ATTEMPTS", 3)


@login_required
def broadcast_list(request: HttpRequest) -> HttpResponse:
    """Return the recent broadcasts partial for htmx polling."""
    broadcasts = BroadcastEvent.objects.select_related("article")[:10]

    max_att = _max_attempts()
    for b in broadcasts:
        b.retryable_count = MessageTask.objects.filter(
            broadcast=b,
            status=MessageTask.Status.FAILED,
            attempt_count__lt=max_att,
            group__is_active=True,
            group__is_healthy=True,
        ).count()

        # Stuck = in_progress but no tasks are queued/sending anymore
        b.stuck_count = MessageTask.objects.filter(
            broadcast=b,
            status__in=[MessageTask.Status.QUEUED, MessageTask.Status.SENDING],
        ).count()
        pending_done = b.stuck_count == 0
        b.can_resend = (
            b.status == BroadcastEvent.Status.IN_PROGRESS and pending_done
        )
        b.is_retrying = b.stuck_count > 0 and b.failed_count > 0

    return render(
        request,
        "dashboard/partials/broadcast_list.html",
        {"broadcasts": broadcasts},
    )


@login_required
def broadcast_messages(request: HttpRequest, pk: int) -> HttpResponse:
    """Return the message tasks for a single broadcast (htmx expandable)."""
    broadcast = get_object_or_404(BroadcastEvent, pk=pk)
    messages = (
        MessageTask.objects.filter(broadcast=broadcast)
        .select_related("group")
        .order_by("-status", "queued_at")
    )

    max_att = _max_attempts()
    for msg in messages:
        # Manual retry only requires the group to exist (is_active).
        # Health is intentionally ignored — the user is explicitly overriding.
        msg.can_retry = (
            msg.status == MessageTask.Status.FAILED
            and msg.attempt_count < max_att
            and msg.group.is_active
        )

    return render(
        request,
        "dashboard/partials/message_list.html",
        {"messages": messages, "broadcast": broadcast, "max_attempts": max_att},
    )


@login_required
@require_POST
def retry_message(request: HttpRequest, pk: int) -> HttpResponse:
    """Re-queue a single failed message task."""
    from apps.campaigns.tasks import _dispatch_to_worker

    msg = get_object_or_404(MessageTask, pk=pk)
    max_att = _max_attempts()

    if msg.status != MessageTask.Status.FAILED:
        return _message_row_response(request, msg, max_att, error="Not in failed state")

    if msg.attempt_count >= max_att:
        return _message_row_response(
            request, msg, max_att, error=f"Max retries ({max_att}) reached"
        )

    msg.status = MessageTask.Status.QUEUED
    msg.save(update_fields=["status"])
    _dispatch_to_worker(msg.pk)

    return _message_row_response(request, msg, max_att)


@login_required
@require_POST
def retry_broadcast(request: HttpRequest, pk: int) -> HttpResponse:
    """Trigger retry of failed messages for a specific broadcast."""
    from apps.campaigns.tasks import retry_failed_messages

    retry_failed_messages.delay(pk)
    return broadcast_list(request)


@login_required
@require_POST
def resend_broadcast(request: HttpRequest, pk: int) -> HttpResponse:
    """Re-create message tasks for a stuck broadcast using current healthy groups."""
    from apps.campaigns.tasks import _dispatch_to_worker

    broadcast = get_object_or_404(BroadcastEvent, pk=pk)

    # Find groups already targeted by existing tasks
    existing_group_pks = set(
        broadcast.message_tasks.values_list("group_id", flat=True)
    )
    new_groups = WhatsAppGroup.objects.filter(
        is_active=True, is_healthy=True,
    ).exclude(pk__in=existing_group_pks)

    new_tasks = [
        MessageTask(broadcast=broadcast, group=group)
        for group in new_groups.iterator()
    ]
    MessageTask.objects.bulk_create(new_tasks)

    new_count = len(new_tasks)
    if new_count:
        BroadcastEvent.objects.filter(pk=broadcast.pk).update(
            total_groups=F("total_groups") + new_count,
            status=BroadcastEvent.Status.IN_PROGRESS,
        )
        for i, task_pk in enumerate(
            MessageTask.objects.filter(
                broadcast=broadcast, status=MessageTask.Status.QUEUED,
                group__in=new_groups,
            ).values_list("pk", flat=True)
        ):
            _dispatch_to_worker(task_pk, index=i)

    return broadcast_list(request)


@login_required
@require_POST
def retry_all_failed(request: HttpRequest) -> HttpResponse:
    """Trigger retry of all eligible failed messages."""
    from apps.campaigns.tasks import retry_failed_messages

    retry_failed_messages.delay(None)
    return broadcast_list(request)


def _message_row_response(
    request: HttpRequest,
    msg: MessageTask,
    max_att: int,
    error: str = "",
) -> HttpResponse:
    """Render a single message row for htmx swap after retry."""
    msg.refresh_from_db()
    msg.can_retry = (
        msg.status == MessageTask.Status.FAILED
        and msg.attempt_count < max_att
        and msg.group.is_active
    )
    return render(
        request,
        "dashboard/partials/message_row.html",
        {"msg": msg, "max_attempts": max_att, "error": error},
    )

