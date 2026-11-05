"""Right changes pushed by Drive: cached items dropped, sessions reset."""

import uuid
from unittest import mock

from django.test import override_settings

import pytest
import responses
from rest_framework.test import APIClient

from core import factories
from core.services import drive_client

pytestmark = pytest.mark.django_db

BOB_API = "http://drive.test/bob/api/v1.0"
ALICE_API = "http://drive.test/alice/api/v1.0"


@pytest.fixture(autouse=True)
def drive_settings(settings):
    """Per-user Drives only."""
    settings.DRIVE_API_BASE_URL = None
    settings.DRIVE_SERVER_TO_SERVER_TOKEN = "s2s"


def _item(doc_id, external_app="docs"):
    return {
        "id": str(doc_id),
        "title": "From Drive",
        "user_role": "editor",
        "metadata": {"external_app": external_app},
        "origin_api_url": ALICE_API,
        "abilities": {"retrieve": True, "update": True},
    }


@responses.activate
def test_forget_item_drops_the_cached_copies():
    """After forget_item, the next read asks Drive again."""
    document = factories.DocumentFactory(drive_api_url=ALICE_API)
    bob = factories.UserFactory(sub="bob", drive_api_url=BOB_API)
    responses.get(f"{BOB_API}/items/{document.id}/", json=_item(document.id))

    drive_client.get_item(str(document.id), bob)
    drive_client.get_item(str(document.id), bob)
    assert len(responses.calls) == 1

    drive_client.forget_item(str(document.id))
    drive_client.get_item(str(document.id), bob)
    assert len(responses.calls) == 2


@override_settings(SERVER_TO_SERVER_API_TOKENS=["DummyToken"])
def test_s2s_access_changed_resets_the_sessions():
    """Drive tells a right changed: cache dropped, collaboration sessions reset."""
    document = factories.DocumentFactory()

    with (
        mock.patch.object(drive_client, "forget_item") as forget,
        mock.patch("core.api.viewsets.CollaborationService.reset_connections") as reset,
        mock.patch(
            "core.api.viewsets.CollaborationService.__init__", return_value=None
        ),
    ):
        response = APIClient().post(
            "/api/v1.0/documents/s2s-access-changed/",
            {"ids": [str(document.id), str(uuid.uuid4())]},
            format="json",
            HTTP_AUTHORIZATION="Bearer DummyToken",
        )

    assert response.status_code == 200
    assert response.json() == {"reset": 1}
    forget.assert_called_once_with(str(document.id))
    reset.assert_called_once_with(document.id)
