"""Docs users provisioned from the Twake Workplace user events."""

import pytest

from core import factories, models
from core.management.commands import consume_user_events as events

pytestmark = pytest.mark.django_db


def test_user_created_sets_the_sub_and_the_drive(settings):
    """user.created: the sub is the uid, the Drive API is the user's instance."""
    settings.DRIVE_API_URL_TEMPLATE = "https://{fqdn}/drive/api/v1.0"

    events.on_user_created(
        {
            "twakeId": "Alice",
            "workplaceFqdn": "alice.example.org",
            "internalEmail": "a@example.org",
        }
    )

    user = models.User.objects.get(sub="alice")
    assert user.email == "a@example.org"
    assert user.drive_api_url == "https://alice.example.org/drive/api/v1.0"
    assert not user.has_usable_password()


def test_settings_updated_then_user_deleted():
    """user.settings.updated fills the names; domain.user.deleted deactivates."""
    factories.UserFactory(sub="bob", full_name="bob")

    events.on_settings_updated(
        {
            "nickname": "bob",
            "payload": {
                "display_name": "Bob Durand",
                "first_name": "Bob",
                "language": "fr",
            },
        }
    )
    events.on_user_deleted({"workplaceFqdn": "bob.example.org"})

    user = models.User.objects.get(sub="bob")
    assert (user.full_name, user.short_name, user.language) == (
        "Bob Durand",
        "Bob",
        "fr-fr",
    )
    assert not user.is_active
