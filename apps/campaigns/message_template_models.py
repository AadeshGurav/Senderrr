"""Message template model — user-defined WhatsApp message format."""

from __future__ import annotations

from django.db import models

DEFAULT_TEMPLATE_TEXT = """\
🔴 *{news.title}*

*दैनिक रत्नागिरी खबरदार*
*ISO 9001:2015 CERTIFIED*
*(RNI NO. MAHMAR/2013/57411)*
*शासनमान्य रजिस्टर न्यूजपेपर*
{news.time}

📰➖♾️➖♾️➖♾️➖📰

*संपूर्ण बातमी वाचण्यासाठी खालील लिंक क्लिक करा*

{news.url}

📢▪️ *रत्नागिरी खबरदारच्या माध्यमातून जाहिरात करण्यासाठी आजच संपर्क साधा 9421187576 या क्रमांकावर*

👉 *रत्नागिरी खबरदार न्यूज़ : अँड्रॉइड अँप*
https://play.google.com/store/apps/details?id=com.appdroid.ratnagirikhabardar

📰 *रत्नागिरी जिल्ह्यातील सर्व लेटेस्ट बातम्या आणि अपडेट्स एका क्लिक वर..*\
"""

PLACEHOLDER_DOCS = [
    ("{news.title}", "Article headline"),
    ("{news.description}", "Short article summary"),
    ("{news.url}", "Full article URL"),
    ("{news.image_url}", "Featured image URL"),
    ("{news.source}", "Source publication name"),
    ("{news.published_at}", "Article publish date/time"),
    ("{news.time}", "Current local time (when message is sent)"),
]


class MessageTemplate(models.Model):
    """A named, user-editable WhatsApp message template.

    Only one template can be active at a time. The active template is used
    by ``compose_message()`` to render every outgoing news broadcast.
    Placeholders like ``{news.title}`` are substituted at send time.
    """

    name = models.CharField(max_length=200)
    template_text = models.TextField(
        help_text=(
            "WhatsApp-formatted message. "
            "Available placeholders: {news.title}, {news.description}, "
            "{news.url}, {news.source}, {news.published_at}, {news.time}."
        )
    )
    is_active = models.BooleanField(default=False, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = "campaigns"
        verbose_name = "Message Template"
        verbose_name_plural = "Message Templates"
        ordering = ["-updated_at"]

    def __str__(self) -> str:
        active = " (active)" if self.is_active else ""
        return f"{self.name}{active}"
