import bleach
from bleach.css_sanitizer import CSSSanitizer

# Matches exactly what the frontend's small contentEditable rich-text
# editor (Bold/Underline/Font Size/Text Color) can produce — nothing
# else. This is a real security boundary, not a formatting nicety:
# OrganiserProfileSection.content_html is rendered via
# dangerouslySetInnerHTML on both the organiser's own Manage Profile
# page and the admin panel, so anything that reaches the DB
# unsanitized becomes a stored-XSS vector against whoever views it.
ALLOWED_TAGS = ["b", "strong", "u", "i", "em", "span", "p", "br", "div", "ul", "ol", "li"]
ALLOWED_ATTRIBUTES = {"span": ["style"], "p": ["style"], "div": ["style"]}
# Only color/font-size — deliberately not e.g. position/display, which
# could otherwise be abused to break page layout or hide/spoof content.
ALLOWED_STYLES = ["color", "font-size", "background-color"]


def sanitize_rich_text(html: str) -> str:
    cleaner = bleach.Cleaner(
        tags=ALLOWED_TAGS,
        attributes=ALLOWED_ATTRIBUTES,
        css_sanitizer=CSSSanitizer(allowed_css_properties=ALLOWED_STYLES),
        strip=True,
    )
    return cleaner.clean(html or "")
