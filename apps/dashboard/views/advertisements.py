"""Advertisement views — compose, list, send, edit, and delete ad campaigns."""

from __future__ import annotations

from django.http import HttpRequest, HttpResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.views.decorators.http import require_POST

from apps.campaigns.models import Advertisement, MediaAttachment
from apps.dashboard.forms import AdvertisementEditForm, AdvertisementForm

_MEDIA_EXTENSIONS: dict[frozenset[str], str] = {
    frozenset({"jpg", "jpeg", "png", "gif", "webp"}): MediaAttachment.MediaType.IMAGE,
    frozenset({"mp4", "mov", "avi", "mkv"}): MediaAttachment.MediaType.VIDEO,
}


def _detect_media_type(filename: str) -> str:
    """Infer MediaAttachment.MediaType from the uploaded file's extension."""
    suffix = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    for extensions, media_type in _MEDIA_EXTENSIONS.items():
        if suffix in extensions:
            return media_type
    return MediaAttachment.MediaType.DOCUMENT


def _ads_context(form: AdvertisementForm | None = None) -> dict:
    """Build the shared context dict for the advertisements page."""
    ads = Advertisement.objects.prefetch_related(
        "media_attachments", "broadcasts"
    ).all()

    for ad in ads:
        latest = ad.broadcasts.order_by("-created_at").first()
        ad.latest_broadcast = latest

    return {
        "ads": ads,
        "form": form or AdvertisementForm(),
        "total_ads": ads.count(),
        "draft_count": ads.filter(status=Advertisement.Status.DRAFT).count(),
        "active_count": ads.filter(status=Advertisement.Status.ACTIVE).count(),
        "sent_count": ads.filter(status=Advertisement.Status.COMPLETED).count(),
    }


def advertisements_page(request: HttpRequest) -> HttpResponse:
    """Render the advertisements list and compose form."""
    return render(request, "dashboard/pages/advertisements.html", _ads_context())


def create_advertisement(request: HttpRequest) -> HttpResponse:
    """Handle POST to create and optionally attach media to a new advertisement."""
    if request.method != "POST":
        return redirect("dashboard:advertisements")

    form = AdvertisementForm(request.POST, request.FILES)
    if not form.is_valid():
        return render(
            request,
            "dashboard/pages/advertisements.html",
            _ads_context(form=form),
        )

    ad = form.save()
    file = request.FILES.get("media_file")
    if file:
        MediaAttachment.objects.create(
            advertisement=ad,
            file=file,
            media_type=_detect_media_type(file.name),
            original_filename=file.name,
        )

    return redirect("dashboard:advertisements")


@require_POST
def send_advertisement(request: HttpRequest, pk: int) -> HttpResponse:
    """Queue a sendable advertisement for fan-out broadcast."""
    ad = get_object_or_404(Advertisement, pk=pk)
    if not ad.is_sendable:
        return redirect("dashboard:advertisements")

    from apps.campaigns.advertisement_tasks import fan_out_advertisement

    ad.status = Advertisement.Status.QUEUED
    ad.save(update_fields=["status"])
    fan_out_advertisement.delay(ad.pk)

    return redirect("dashboard:advertisements")


def edit_advertisement(request: HttpRequest, pk: int) -> HttpResponse:
    """Edit an existing advertisement's content, media, or preferred time."""
    ad = get_object_or_404(Advertisement, pk=pk)
    editable_statuses = {Advertisement.Status.DRAFT, Advertisement.Status.ACTIVE}
    if ad.status not in editable_statuses:
        return redirect("dashboard:advertisements")

    if request.method != "POST":
        form = AdvertisementEditForm(instance=ad)
        return render(
            request,
            "dashboard/pages/advertisement_edit.html",
            {"form": form, "ad": ad},
        )

    form = AdvertisementEditForm(request.POST, request.FILES, instance=ad)
    if not form.is_valid():
        return render(
            request,
            "dashboard/pages/advertisement_edit.html",
            {"form": form, "ad": ad},
        )

    form.save()
    new_file = request.FILES.get("media_file")
    if new_file:
        ad.media_attachments.all().delete()
        MediaAttachment.objects.create(
            advertisement=ad,
            file=new_file,
            media_type=_detect_media_type(new_file.name),
            original_filename=new_file.name,
        )

    return redirect("dashboard:advertisements")


@require_POST
def delete_advertisement(request: HttpRequest, pk: int) -> HttpResponse:
    """Delete an advertisement and all its attached media."""
    ad = get_object_or_404(Advertisement, pk=pk)
    ad.delete()
    return redirect("dashboard:advertisements")
