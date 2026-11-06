"""
Tests for Documents API endpoint in impress's core app: s2s-accesses
"""

from datetime import timedelta
from unittest import mock

from django.test import override_settings

import pytest
from rest_framework.test import APIClient

from core import factories
from core.models import DocumentAccess, Invitation

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def mock_reset_connections():
    """Saving or deleting an access resets the collaboration connections: never for real."""
    with mock.patch("core.signals.reset_service_connections_on_commit") as reset:
        yield reset


def post(document, data, token="DummyToken"):
    """Call the endpoint as a server."""
    return APIClient().post(
        f"/api/v1.0/documents/{document.id!s}/s2s-accesses/",
        data,
        format="json",
        HTTP_AUTHORIZATION=f"Bearer {token}",
    )


def roles(document):
    """The user accesses and invitations of a document, by email."""
    accesses = {
        a.user.email: a.role for a in document.accesses.filter(user__isnull=False)
    }
    invitations = {i.email: i.role for i in document.invitations.all()}
    return accesses, invitations


def test_api_documents_s2s_accesses_missing_token():
    """Requests with no token should not be allowed to set accesses."""
    document = factories.DocumentFactory()

    response = APIClient().post(
        f"/api/v1.0/documents/{document.id!s}/s2s-accesses/",
        {"accesses": []},
        format="json",
    )

    assert response.status_code == 401


@override_settings(SERVER_TO_SERVER_API_TOKENS=["DummyToken"])
def test_api_documents_s2s_accesses_invalid_token():
    """Requests with an invalid token should not be allowed to set accesses."""
    document = factories.DocumentFactory()

    assert post(document, {"accesses": []}, token="InvalidToken").status_code == 401


@override_settings(SERVER_TO_SERVER_API_TOKENS=["DummyToken"])
def test_api_documents_s2s_accesses_authenticated_user():
    """A logged-in user is not a server, even an owner of the document."""
    user = factories.UserFactory()
    document = factories.DocumentFactory(users=[(user, "owner")])
    client = APIClient()
    client.force_login(user)

    response = client.post(
        f"/api/v1.0/documents/{document.id!s}/s2s-accesses/",
        {"accesses": []},
        format="json",
    )

    assert response.status_code == 401


@override_settings(SERVER_TO_SERVER_API_TOKENS=["DummyToken"])
def test_api_documents_s2s_accesses_unknown_document():
    """A document Docs does not know is a 404."""
    response = APIClient().post(
        "/api/v1.0/documents/6b7a3b54-3f6e-4c7a-9c4b-0d3c2c1b0a99/s2s-accesses/",
        {"accesses": []},
        format="json",
        HTTP_AUTHORIZATION="Bearer DummyToken",
    )

    assert response.status_code == 404


@override_settings(SERVER_TO_SERVER_API_TOKENS=["DummyToken"])
def test_api_documents_s2s_accesses_set_change_remove():
    """A role sets or changes an access, None removes it."""
    alice = factories.UserFactory(sub="alice", email="alice@example.com")
    document = factories.DocumentFactory()

    response = post(
        document,
        {
            "accesses": [
                {"sub": "alice", "email": "alice@example.com", "role": "editor"}
            ]
        },
    )
    assert response.status_code == 200
    assert response.json() == {"created": 1, "updated": 0, "deleted": 0, "invited": 0}

    post(
        document,
        {"accesses": [{"sub": "alice", "email": alice.email, "role": "reader"}]},
    )
    assert roles(document) == ({"alice@example.com": "reader"}, {})

    response = post(
        document, {"accesses": [{"sub": "alice", "email": alice.email, "role": None}]}
    )
    assert response.json()["deleted"] == 1
    assert not DocumentAccess.objects.filter(document=document).exists()


@override_settings(SERVER_TO_SERVER_API_TOKENS=["DummyToken"])
def test_api_documents_s2s_accesses_replay_changes_nothing():
    """The same request twice is one change."""
    factories.UserFactory(sub="alice", email="alice@example.com")
    document = factories.DocumentFactory()
    data = {
        "accesses": [{"sub": "alice", "email": "alice@example.com", "role": "editor"}]
    }

    post(document, data)
    response = post(document, data)

    assert response.json() == {"created": 0, "updated": 0, "deleted": 0, "invited": 0}
    assert DocumentAccess.objects.filter(document=document).count() == 1


@override_settings(SERVER_TO_SERVER_API_TOKENS=["DummyToken"])
def test_api_documents_s2s_accesses_unknown_user_is_invited():
    """A user who never logged in gets an invitation, turned into an access at login."""
    document = factories.DocumentFactory()

    response = post(
        document,
        {"accesses": [{"sub": "bob", "email": "bob@example.com", "role": "reader"}]},
    )

    assert response.json()["invited"] == 1
    assert roles(document) == ({}, {"bob@example.com": "reader"})

    bob = factories.UserFactory(sub="bob", email="bob@example.com")
    assert DocumentAccess.objects.get(document=document, user=bob).role == "reader"
    assert not Invitation.objects.filter(document=document).exists()


@override_settings(SERVER_TO_SERVER_API_TOKENS=["DummyToken"])
def test_api_documents_s2s_accesses_renews_an_expired_invitation():
    """An expired invitation would never become an access: listing the user renews it."""
    document = factories.DocumentFactory()
    expired = factories.InvitationFactory(
        document=document, email="bob@example.com", role="reader"
    )
    Invitation.objects.filter(pk=expired.pk).update(
        created_at=expired.created_at - timedelta(days=30)
    )

    response = post(
        document,
        {"accesses": [{"sub": "bob", "email": "bob@example.com", "role": "reader"}]},
    )

    assert response.json()["invited"] == 1
    assert not Invitation.objects.get(document=document).is_expired


@override_settings(SERVER_TO_SERVER_API_TOKENS=["DummyToken"])
def test_api_documents_s2s_accesses_replace_removes_the_others():
    """With replace, users and invitations left out of the list lose their access."""
    alice = factories.UserFactory(sub="alice", email="alice@example.com")
    carol = factories.UserFactory(sub="carol", email="carol@example.com")
    document = factories.DocumentFactory(users=[(alice, "owner"), (carol, "editor")])
    factories.InvitationFactory(
        document=document, email="dave@example.com", role="reader"
    )
    team_access = factories.TeamDocumentAccessFactory(document=document, team="drive")

    response = post(
        document,
        {
            "replace": True,
            "accesses": [{"sub": "alice", "email": alice.email, "role": "owner"}],
        },
    )

    assert response.json() == {"created": 0, "updated": 0, "deleted": 2, "invited": 0}
    assert roles(document) == ({"alice@example.com": "owner"}, {})
    assert DocumentAccess.objects.filter(pk=team_access.pk).exists()


@override_settings(SERVER_TO_SERVER_API_TOKENS=["DummyToken"])
def test_api_documents_s2s_accesses_notify_the_collaboration_server(
    mock_reset_connections,
):
    """Each access saved or deleted resets the connections of its user."""
    alice = factories.UserFactory(sub="alice", email="alice@example.com")
    document = factories.DocumentFactory(users=[(alice, "editor")])
    mock_reset_connections.reset_mock()

    post(
        document,
        {"accesses": [{"sub": "alice", "email": alice.email, "role": "reader"}]},
    )
    post(document, {"replace": True, "accesses": []})

    assert mock_reset_connections.call_count == 2


@override_settings(SERVER_TO_SERVER_API_TOKENS=["DummyToken"])
def test_api_documents_s2s_accesses_invalid_role():
    """An unknown role is refused, nothing changes."""
    factories.UserFactory(sub="alice", email="alice@example.com")
    document = factories.DocumentFactory()

    response = post(
        document,
        {"accesses": [{"sub": "alice", "email": "alice@example.com", "role": "boss"}]},
    )

    assert response.status_code == 400
    assert not DocumentAccess.objects.filter(document=document).exists()
