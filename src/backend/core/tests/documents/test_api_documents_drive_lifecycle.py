"""Right changes pushed by Drive: cached items dropped, sessions reset."""

import uuid
from unittest import mock

from django.test import override_settings

import pytest
import responses
from rest_framework.test import APIClient

from core import factories, models
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


@override_settings(SERVER_TO_SERVER_API_TOKENS=["DummyToken"])
def test_s2s_duplicate_copies_the_content_once():
    """A duplicate made in Drive gets its own document, content copied, idempotent."""
    source = factories.DocumentFactory(content="c2VjcmV0", attachments=["a/b.png"])
    new_id = uuid.uuid4()
    payload = {"source": str(source.id), "id": str(new_id), "drive_api_url": BOB_API}

    for _ in range(2):
        response = APIClient().post(
            "/api/v1.0/documents/s2s-duplicate/",
            payload,
            format="json",
            HTTP_AUTHORIZATION="Bearer DummyToken",
        )
        assert response.status_code == 200

    copy = models.Document.objects.get(id=new_id)
    assert (copy.content, copy.attachments, copy.drive_api_url) == (
        "c2VjcmV0",
        ["a/b.png"],
        BOB_API,
    )
    assert copy.file_key != source.file_key


@override_settings(SERVER_TO_SERVER_API_TOKENS=["DummyToken"])
def test_s2s_moved_follows_the_owning_drive():
    """A move to another Drive changes the document's Drive API."""
    document = factories.DocumentFactory(drive_api_url=ALICE_API)

    response = APIClient().post(
        "/api/v1.0/documents/s2s-moved/",
        {"ids": [str(document.id)], "drive_api_url": BOB_API},
        format="json",
        HTTP_AUTHORIZATION="Bearer DummyToken",
    )

    assert response.json() == {"moved": 1}
    document.refresh_from_db()
    assert document.drive_api_url == BOB_API


@override_settings(SERVER_TO_SERVER_API_TOKENS=["DummyToken"])
def test_s2s_export_returns_markdown_of_updated_documents():
    """Drive keeps a readable export: Markdown of the documents updated since a date."""
    document = factories.DocumentFactory(content="c2VjcmV0")

    with mock.patch(
        "core.api.viewsets.Converter.convert", return_value="# Hello"
    ) as convert:
        response = APIClient().post(
            "/api/v1.0/documents/s2s-export/",
            {"since": None},
            format="json",
            HTTP_AUTHORIZATION="Bearer DummyToken",
        )

    exported = {r["id"]: r["markdown"] for r in response.json()["results"]}
    assert exported[str(document.id)] == "# Hello"
    convert.assert_called()
