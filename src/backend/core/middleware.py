"""Force session creation for all requests."""


class ForceSessionMiddleware:
    """
    Force session creation for unauthenticated users.
    Must be used after Authentication middleware.
    """

    def __init__(self, get_response):
        """Initialize the middleware."""
        self.get_response = get_response

    def __call__(self, request):
        """Force session creation for unauthenticated users."""

        if not request.user.is_authenticated and request.session.session_key is None:
            request.session.create()

        response = self.get_response(request)
        return response


class SaveRawBodyMiddleware:
    """
    Save the raw request body to use it later.
    """

    def __init__(self, get_response):
        """Initialize the middleware."""
        self.get_response = get_response

    def __call__(self, request):
        """Save the raw request body in the request to use it later."""
        if request.path.endswith(("/ai-proxy/", "/ai-proxy")):
            request.raw_body = request.body

        response = self.get_response(request)
        return response


class DriveSharecodeMiddleware:
    """
    Expose to the Drive client the Drive sharecodes the visitor holds, one cookie
    `docs_sharecode_<document id>` per document opened from a share link.
    """

    def __init__(self, get_response):
        """Initialize the middleware."""
        self.get_response = get_response

    def __call__(self, request):
        """Scope the visitor's sharecodes to the current request."""
        # Import here to avoid a circular import through core.models
        from core.services import (
            drive_client,  # pylint: disable=import-outside-toplevel
        )

        prefix = drive_client.SHARECODE_COOKIE_PREFIX
        token = drive_client.SHARECODES.set(
            {
                k[len(prefix) :]: v
                for k, v in request.COOKIES.items()
                if k.startswith(prefix)
            }
        )
        try:
            return self.get_response(request)
        finally:
            drive_client.SHARECODES.reset(token)
