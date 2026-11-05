"""Provision Docs users from the Twake Workplace user events on RabbitMQ."""

import json
import logging

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from kombu import Connection, Exchange, Queue
from kombu.mixins import ConsumerMixin

from core.models import User

logger = logging.getLogger(__name__)

# The bare locale cozy-stack publishes ("fr") mapped onto a Docs language ("fr-fr").
LANGUAGES = {code.split("-")[0]: code for code, _ in settings.LANGUAGES}


def on_user_created(msg):
    """auth / user.created: the user exists, with the sub the identity provider will send."""
    # In the Workplace the OIDC sub of an app is lc(uid), and twakeId is the uid.
    sub = msg["twakeId"].lower()
    user = User.objects.filter(sub=sub).first()
    if user is None:
        user = User(sub=sub)
        user.set_unusable_password()
    user.email = msg.get("internalEmail") or user.email
    if settings.DRIVE_API_URL_TEMPLATE and msg.get("workplaceFqdn"):
        user.drive_api_url = settings.DRIVE_API_URL_TEMPLATE.format(
            fqdn=msg["workplaceFqdn"]
        )
    user.is_active = True
    user.save()
    logger.info("user.created %s", sub)


def on_settings_updated(msg):
    """settings / user.settings.updated: name, email and language, keyed by nickname (the uid)."""
    payload = msg.get("payload", {})
    full_name = payload.get("display_name") or " ".join(
        filter(None, [payload.get("first_name"), payload.get("last_name")])
    )
    fields = {
        "full_name": full_name,
        "short_name": payload.get("first_name"),
        "email": payload.get("email"),
        "language": LANGUAGES.get((payload.get("language") or "").split("-")[0]),
    }
    count = User.objects.filter(sub=msg["nickname"].lower()).update(
        **{key: value for key, value in fields.items() if value}
    )
    logger.info("user.settings.updated %s: %d user(s)", msg["nickname"], count)


def on_user_deleted(msg):
    """b2b / domain.user.deleted: deactivate, documents stay. The FQDN's first label is the uid."""
    sub = msg["workplaceFqdn"].split(".")[0].lower()
    count = User.objects.filter(sub=sub).update(is_active=False)
    logger.info("domain.user.deleted %s: %d user(s)", sub, count)


HANDLERS = {
    "user.created": on_user_created,
    "user.settings.updated": on_settings_updated,
    "domain.user.deleted": on_user_deleted,
}


class Worker(ConsumerMixin):
    """Consume the three queues Docs declares on the Workplace exchanges."""

    def __init__(self, connection):
        self.connection = connection

    def get_consumers(self, Consumer, channel):  # pylint: disable=invalid-name
        queues = [
            Queue(
                "docs.user.created",
                Exchange("auth", "topic", durable=True),
                "user.created",
            ),
            Queue(
                "docs.user.settings.updated",
                Exchange("settings", "topic", durable=True),
                "user.settings.updated",
            ),
            Queue(
                "docs.domain.user.deleted",
                Exchange("b2b", "topic", durable=True),
                "domain.user.deleted",
            ),
        ]
        return [Consumer(queues=queues, callbacks=[self.on_message], accept=["json"])]

    def on_message(self, body, message):
        """Apply one event; a broken message is logged and dropped."""
        routing_key = message.delivery_info["routing_key"]
        try:
            HANDLERS[routing_key](body if isinstance(body, dict) else json.loads(body))
        except Exception:  # pylint: disable=broad-exception-caught
            logger.exception("Could not apply %s", routing_key)
        message.ack()


class Command(BaseCommand):
    """Run the user events consumer."""

    help = __doc__

    def handle(self, *args, **options):
        if not settings.USER_EVENTS_AMQP_URL:
            raise CommandError("USER_EVENTS_AMQP_URL is not set.")
        with Connection(settings.USER_EVENTS_AMQP_URL) as connection:
            Worker(connection).run()
