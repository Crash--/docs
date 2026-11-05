"""Documents created by Drive, adopted by Docs on first open."""

import uuid

import pytest
import responses
from rest_framework.test import APIClient

from core import factories, models

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
def test_retrieve_adopts_a_drive_item_created_by_drive():
    """Drive created the pointer: the first open creates the document."""
    bob = factories.UserFactory(sub="bob", drive_api_url=BOB_API)
    doc_id = uuid.uuid4()
    responses.get(f"{BOB_API}/items/{doc_id}/", json=_item(doc_id))
    client = APIClient()
    client.force_login(bob)

    response = client.get(f"/api/v1.0/documents/{doc_id}/")

    assert response.status_code == 200
    document = models.Document.objects.get(id=doc_id)
    assert (document.title, document.creator, document.drive_api_url) == (
        "From Drive",
        bob,
        ALICE_API,
    )


@responses.activate
def test_retrieve_does_not_adopt_another_apps_item():
    """An item of another external app stays unknown to Docs."""
    bob = factories.UserFactory(sub="bob", drive_api_url=BOB_API)
    doc_id = uuid.uuid4()
    responses.get(f"{BOB_API}/items/{doc_id}/", json=_item(doc_id, "grist"))
    client = APIClient()
    client.force_login(bob)

    assert client.get(f"/api/v1.0/documents/{doc_id}/").status_code == 404
    assert not models.Document.objects.filter(id=doc_id).exists()
