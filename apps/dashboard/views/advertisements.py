"""Advertisement views — compose, list, send, and delete ad campaigns."""

from __future__ import annotations

from django.contrib.auth.decorators import login_required
from django.http import HttpRequest, HttpResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.views.decorators.http import require_POST

from apps.campaigns.models import Advertisement, MediaAttachment
from apps.dashboard.forms import AdvertisementForm

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

    # Annotate each ad with latest broadcast delivery stats
    for ad in ads:
        latest = ad.broadcasts.order_by("-created_at").first()
        ad.latest_broadcast = latest

    return {
        "ads": ads,
        "form": form or AdvertisementForm(),
        "total_ads": ads.count(),
        "draft_count": ads.filter(status=Advertisement.Status.DRAFT).count(),
        "sent_count": ads.filter(status=Advertisement.Status.COMPLETED).count(),
    }


@login_required
def advertisements_page(request: HttpRequest) -> HttpResponse:
    """Render the advertisements list and compose form."""
    return render(request, "dashboard/pages/advertisements.html", _ads_context())


@login_required
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
@login_required
def send_advertisement(request: HttpRequest, pk: int) -> HttpResponse:
    """Queue a draft advertisement for fan-out broadcast."""
    ad = get_object_or_404(Advertisement, pk=pk, status=Advertisement.Status.DRAFT)

    from apps.campaigns.advertisement_tasks import fan_out_advertisement

    ad.status = Advertisement.Status.QUEUED
    ad.save(update_fields=["status"])
    fan_out_advertisement.delay(ad.pk)

    return redirect("dashboard:advertisements")


@require_POST
@login_required
def delete_advertisement(request: HttpRequest, pk: int) -> HttpResponse:
    """Delete an advertisement and all its attached media."""
    ad = get_object_or_404(Advertisement, pk=pk)
    ad.delete()
    return redirect("dashboard:advertisements")
