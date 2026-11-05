"""
Client for the Drive API.

The document tree and sharing are owned by Drive: documents are represented
there as items of type "file" carrying `metadata.external_app == "docs"`.
Every call impersonates the acting user through the server-to-server token and
the X-User-Sub / X-User-Email headers.
"""

import contextvars
import hashlib
import logging

from django.conf import settings
from django.core.cache import cache

import requests
from rest_framework import exceptions as drf_exceptions

logger = logging.getLogger(__name__)

ITEM_CACHE_TIMEOUT = 10  # seconds

# Drive sharecodes held by the visitor of the current request, by document id. Set by
# DriveSharecodeMiddleware from the `docs_sharecode_<document id>` cookies.
SHARECODE_COOKIE_PREFIX = "docs_sharecode_"
SHARECODES = contextvars.ContextVar("drive_sharecodes", default=None)


def _sharecode(item_id):
    return (SHARECODES.get() or {}).get(str(item_id))


class DriveClientError(Exception):
    """Raised when a call to the Drive API fails."""

    def __init__(self, message, status_code=None):
        super().__init__(message)
        self.status_code = status_code


def _headers(user, sharecode=None):
    headers = {"Authorization": f"Bearer {settings.DRIVE_SERVER_TO_SERVER_TOKEN}"}
    sub = str(getattr(user, "sub", "") or "")
    email = str(getattr(user, "email", "") or "")
    # No identity headers means Drive computes abilities for an anonymous
    # visitor (public link reach only).
    if sub:
        headers["X-User-Sub"] = sub
    if email:
        headers["X-User-Email"] = email
    if sharecode:
        headers["X-Drive-Sharecode"] = sharecode
    return headers


def user_api_url(user):
    """The Drive API of a user: their own when Drives are per user, else the shared one."""
    return getattr(user, "drive_api_url", "") or settings.DRIVE_API_BASE_URL


def _request(method, path, user, base=None, sharecode=None, **kwargs):
    """Perform a request to a Drive API on behalf of a user."""
    base = base or user_api_url(user)
    if not base or not settings.DRIVE_SERVER_TO_SERVER_TOKEN:
        raise DriveClientError("Drive integration is not configured.")

    url = f"{base}{path}"
    try:
        response = requests.request(
            method, url, headers=_headers(user, sharecode), timeout=10, **kwargs
        )
    except requests.RequestException as exc:
        raise DriveClientError(f"Could not reach Drive: {exc}") from exc

    if response.status_code >= 400:
        raise DriveClientError(
            f"Drive API call failed ({response.status_code}) on {path}: "
            f"{response.text[:500]}",
            status_code=response.status_code,
        )

    if response.status_code == 204:
        return None

    return response.json()


def raise_as_drf(exc):
    """Convert a DriveClientError to the closest DRF exception."""
    if exc.status_code in (401, 403):
        raise drf_exceptions.PermissionDenied(str(exc)) from exc
    if exc.status_code == 404:
        raise drf_exceptions.NotFound(str(exc)) from exc
    raise drf_exceptions.APIException(str(exc)) from exc


def _document_api_url(item_id):
    # Import here to avoid a circular import through core.models
    from core.models import Document  # pylint: disable=import-outside-toplevel

    return (
        Document.objects.filter(pk=item_id)
        .values_list("drive_api_url", flat=True)
        .first()
    )


def _targets(item_id, user):
    """
    Where to ask for an item: the user's own Drive first, then the Drive owning the
    document with the visitor's sharecode, if any.
    """
    targets = []
    if user.is_authenticated and user_api_url(user):
        targets.append((user_api_url(user), None))
    sharecode = _sharecode(item_id)
    origin = _document_api_url(item_id)
    if sharecode and origin:
        targets.append((origin, sharecode))
    if not targets and settings.DRIVE_API_BASE_URL:
        targets.append((settings.DRIVE_API_BASE_URL, None))
    return targets


def _request_item(method, path, item_id, user, **kwargs):
    """Request an item from the first Drive that grants the user or the visitor access."""
    last = DriveClientError("No Drive grants access to this item.", status_code=404)
    for base, sharecode in _targets(item_id, user):
        try:
            return _request(
                method, path, user, base=base, sharecode=sharecode, **kwargs
            )
        except DriveClientError as exc:
            if exc.status_code not in (403, 404):
                raise
            last = exc
    raise last


def create_doc_item(user, title, parent_id=None):
    """Create the Drive item representing a document, root or child."""
    payload = {
        "type": "file",
        "title": title or "Untitled document",
        "metadata": {"external_app": "docs"},
    }
    if parent_id:
        return _request_item(
            "post", f"/items/{parent_id}/children/", parent_id, user, json=payload
        )
    return _request("post", "/items/", user, json=payload)


def get_item(item_id, user):
    """Fetch a Drive item (including abilities) with a short per-user cache."""
    sharecode = _sharecode(item_id) or ""
    code_key = hashlib.sha256(sharecode.encode()).hexdigest()[:16] if sharecode else ""
    version = cache.get(_item_version_key(item_id), 0)
    cache_key = (
        f"drive_item:{item_id}:{version}:{getattr(user, 'sub', 'anonymous')}:{code_key}"
    )
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    item = _request_item("get", f"/items/{item_id}/", item_id, user)
    cache.set(cache_key, item, ITEM_CACHE_TIMEOUT)
    return item


def _item_version_key(item_id):
    return f"drive_item_version:{item_id}"


def forget_item(item_id):
    """Drop every cached copy of an item (all users, all sharecodes)."""
    # Bumping a version in the keys works with any cache backend, unlike a key scan.
    key = _item_version_key(item_id)
    try:
        cache.incr(key)
    except ValueError:
        cache.set(key, 1, None)


def get_tree(item_id, user):
    """Fetch the nested descendants tree of a document from Drive."""
    return _request_item("get", f"/items/{item_id}/tree-descendants/", item_id, user)


def list_root_docs(user, page=1):
    """List the user's root items pointing to Docs documents."""
    params = {"external_app": "docs", "type": "file"}
    if page and str(page) != "1":
        params["page"] = page
    return _request("get", "/items/", user, params=params)


def list_children(item_id, user):
    """List the direct children of a document item."""
    return _request_item(
        "get",
        f"/items/{item_id}/children/",
        item_id,
        user,
        params={"external_app": "docs"},
    )


def patch_title(item_id, user, title):
    """Push a document rename to Drive."""
    return _request_item(
        "patch", f"/items/{item_id}/", item_id, user, json={"title": title}
    )


def delete_item(item_id, user):
    """Move the Drive item mirroring a document to Drive's trash."""
    return _request_item("delete", f"/items/{item_id}/", item_id, user)


def map_drive_abilities(drive_abilities):
    """
    Map a Drive item's abilities onto the Docs document abilities dict.

    The dict shape must stay identical to Document.get_abilities as the frontend
    and the collaboration server both consume it. All sharing-related abilities
    are disabled: sharing is managed in Drive.
    """
    a = drive_abilities or {}
    r = a.get("retrieve", False)
    u = a.get("update", False)

    return {
        "accesses_manage": False,
        "accesses_view": False,
        "ai_proxy": u,
        "ai_transform": u,
        "ai_translate": u,
        "attachment_upload": u,
        "media_check": r,
        "can_edit": u,
        "children_list": a.get("children_list", r),
        "children_create": a.get("children_create", False),
        "collaboration_auth": r,
        "comment": u,
        "formatted_content": r,
        "content_patch": u,
        "content_retrieve": r,
        "cors_proxy": r,
        "descendants": r,
        "destroy": a.get("destroy", False),
        "duplicate": False,
        "favorite": False,
        "link_configuration": False,
        "invite_owner": False,
        "leave": False,
        "move": False,
        "partial_update": u,
        "restore": False,
        "retrieve": r,
        "media_auth": r,
        "link_select_options": {},
        "tree": r,
        "update": u,
        "versions_destroy": u,
        "versions_list": r,
        "versions_retrieve": r,
        "search": r,
    }


def no_abilities():
    """All-False abilities dict used when Drive cannot be reached."""
    mapped = map_drive_abilities({})
    mapped["link_select_options"] = {}
    return mapped


def get_doc_context(document_id, user):
    """
    Return (mapped_abilities, drive_user_role) for a document, sourced from
    Drive. Falls back to no abilities when the user has no access or Drive
    cannot be reached.
    """
    try:
        item = get_item(str(document_id), user)
    except DriveClientError:
        return no_abilities(), None

    return map_drive_abilities(item.get("abilities")), item.get("user_role")


def drive_item_to_doc_dict(item):
    """
    Map a Drive item payload to the shape of Docs' ListDocumentSerializer, so
    the frontend can consume Drive-served lists/trees transparently.
    """
    path = str(item.get("path") or "")
    depth = len(path.split(".")) if path else 1

    return {
        "id": item["id"],
        "abilities": map_drive_abilities(item.get("abilities")),
        # Link reach/role are managed in Drive and exposed read-only.
        "ancestors_link_reach": item.get("ancestors_link_reach") or "restricted",
        "ancestors_link_role": item.get("ancestors_link_role"),
        "computed_link_reach": item.get("computed_link_reach") or "restricted",
        "computed_link_role": item.get("computed_link_role"),
        "created_at": item.get("created_at"),
        "creator": (item.get("creator") or {}).get("id"),
        "deleted_at": item.get("deleted_at"),
        "depth": depth,
        "excerpt": None,
        "is_favorite": False,
        "link_reach": item.get("link_reach") or "restricted",
        "link_role": item.get("link_role"),
        "nb_accesses_ancestors": item.get("nb_accesses", 1),
        "nb_accesses_direct": item.get("nb_accesses", 1),
        "numchild": item.get("numchild", 0),
        "path": path,
        "title": item.get("title"),
        "updated_at": item.get("updated_at"),
        "user_role": item.get("user_role"),
    }


def drive_tree_to_doc_tree(node):
    """Recursively map a Drive nested tree node to the Docs tree node shape."""
    mapped = drive_item_to_doc_dict(node)
    mapped["children"] = [
        drive_tree_to_doc_tree(child) for child in node.get("children", [])
    ]
    return mapped
