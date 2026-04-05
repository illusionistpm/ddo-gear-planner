from __future__ import annotations

from typing import Any


class ParseContextError(RuntimeError):
    """Exception that carries additional context about a parse failure.

    Attributes
    ----------
    page:
        Identifier for the page or file being parsed (e.g. cache path or URL).
    row_html:
        HTML snippet for the row or element that triggered the error.
    context:
        Arbitrary extra context such as category, partial item data, or indices.
    original:
        The original exception that triggered this error, if any.
    """

    def __init__(
        self,
        message: str,
        *,
        page: str | None = None,
        row_html: str | None = None,
        context: dict[str, Any] | None = None,
        original: BaseException | None = None,
    ) -> None:
        super().__init__(message)
        self.page = page
        self.row_html = row_html
        self.context = context or {}
        self.original = original
