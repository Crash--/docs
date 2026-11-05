"""Drive client with one Drive API per user and Drive sharecodes."""

from django.contrib.auth.models import AnonymousUser

import pytest
import responses

from core import factories
from core.services import drive_client

pytestmark = pytest.mark.django_db

ALICE_API = "http://drive.test/alice/api/v1.0"
BOB_API = "http://drive.test/bob/api/v1.0"


@pytest.fixture(autouse=True)
def drive_settings(settings):
    """No shared Drive: every user has their own."""
    settings.DRIVE_API_BASE_URL = None
    settings.DRIVE_SERVER_TO_SERVER_TOKEN = "s2s"


def _item(doc_id, role):
    return {"id": str(doc_id), "user_role": role, "abilities": {"retrieve": True}}


@responses.activate
def test_get_item_asks_the_users_own_drive():
    """A member reaches the document through their own Drive, with their identity."""
    document = factories.DocumentFactory(drive_api_url=ALICE_API)
    bob = factories.UserFactory(sub="bob", drive_api_url=BOB_API)
    responses.get(f"{BOB_API}/items/{document.id}/", json=_item(document.id, "reader"))

    assert drive_client.get_item(str(document.id), bob)["user_role"] == "reader"
    assert responses.calls[0].request.headers["X-User-Sub"] == "bob"
    assert "X-Drive-Sharecode" not in responses.calls[0].request.headers


@responses.activate
def test_get_item_falls_back_to_the_documents_drive_with_a_sharecode():
    """Refused by their own Drive, a user holding a sharecode gets the link access."""
    document = factories.DocumentFactory(drive_api_url=ALICE_API)
    bob = factories.UserFactory(sub="bob", drive_api_url=BOB_API)
    responses.get(f"{BOB_API}/items/{document.id}/", status=404)
    responses.get(f"{ALICE_API}/items/{document.id}/", json=_item(document.id, None))

    token = drive_client.SHARECODES.set({str(document.id): "code"})
    try:
        drive_client.get_item(str(document.id), bob)
    finally:
        drive_client.SHARECODES.reset(token)

    assert responses.calls[1].request.headers["X-Drive-Sharecode"] == "code"


def test_anonymous_without_sharecode_asks_no_drive():
    """No user and no sharecode: no Drive is asked, the document stays closed."""
    document = factories.DocumentFactory(drive_api_url=ALICE_API)

    with pytest.raises(drive_client.DriveClientError) as error:
        drive_client.get_item(str(document.id), AnonymousUser())
    assert error.value.status_code == 404


@responses.activate
def test_single_drive_keeps_working(settings):
    """Without per-user Drives, every call goes to DRIVE_API_BASE_URL as upstream."""
    settings.DRIVE_API_BASE_URL = "http://drive.test/api/v1.0"
    document = factories.DocumentFactory()
    responses.get(
        f"http://drive.test/api/v1.0/items/{document.id}/",
        json=_item(document.id, None),
    )

    drive_client.get_item(str(document.id), AnonymousUser())
    assert "X-User-Sub" not in responses.calls[0].request.headers
