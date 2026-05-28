"""CarryOn™ — Prime Directive (locked, canonical, server-side source of truth).

This module holds the platform's Prime Directive verbatim. It is the
single source of truth the backend serves to the frontend Our Promise
page. The pre-push invariant
``test_prime_directive_backend_constant_matches_prd`` (in
``tests/test_pre_push_invariants.py``) asserts that this constant
matches the text locked at the top of ``/app/memory/PRD.md``
byte-for-byte. A separate invariant
(``test_prime_directive_locked_verbatim_in_prd``) locks the PRD copy.
The two gates together guarantee PRD ↔ runtime endpoint can never
drift.

Locked Feb 17, 2026 by founder directive. Do NOT edit, reword, abridge,
or reorder without an explicit founder instruction in the conversation.
"""

from __future__ import annotations

# ─── Locked verbatim. Do not touch. ──────────────────────────────────

PRIME_DIRECTIVE_OPENING: str = (
    "CarryOn exists to provide the most trustworthy, resilient, and accessible "
    "multi-generational family preparedness and estate planning platform in America."
)

PRIME_DIRECTIVE_LEGACY_MANDATE: str = (
    "All platform development, system behaviors, user experiences, and "
    "artificial intelligence actions must prioritize the preservation, "
    "protection, and perpetuation of a family's intended legacy with "
    "uncompromising integrity, transparency, reliability, security, and simplicity."
)

PRIME_DIRECTIVE_INCLUSIVITY_MANDATE: str = (
    "The platform shall be designed to serve all Americans regardless of "
    "demographic, background, technical proficiency, or financial circumstance, "
    "ensuring that every user can confidently create, preserve, manage, and "
    "transfer their critical information, intentions, and legacy across generations."
)

PRIME_DIRECTIVE_PRIORITIES: tuple[str, ...] = (
    "User trust over engagement.",
    "Long-term reliability over short-term convenience.",
    "Clarity and transparency over complexity.",
    "Preservation of user intent over automation assumptions.",
    "Security and resilience over speed of deployment.",
    "Accessibility and inclusivity over exclusivity.",
    "Human dignity, autonomy, and legacy preservation above all other optimization objectives.",
)

PRIME_DIRECTIVE_PRIORITY_PREAMBLE: str = "When making decisions, the system must always prioritize:"

# Effective date — when the directive was locked. Surfaced in the API
# response so professionals reviewing a user's plan can see exactly
# which contract was in force.
PRIME_DIRECTIVE_LOCKED_AT: str = "2026-02-17"


def prime_directive_payload() -> dict:
    """Structured payload served by the public Our Promise endpoint.
    The shape is deliberately flat and self-describing so the frontend
    page (and any third party scraping the endpoint) can render the
    full directive without inferring structure from prose.
    """
    return {
        "locked_at": PRIME_DIRECTIVE_LOCKED_AT,
        "opening": PRIME_DIRECTIVE_OPENING,
        "legacy_mandate": PRIME_DIRECTIVE_LEGACY_MANDATE,
        "inclusivity_mandate": PRIME_DIRECTIVE_INCLUSIVITY_MANDATE,
        "priority_preamble": PRIME_DIRECTIVE_PRIORITY_PREAMBLE,
        "priorities": [{"n": i + 1, "text": text} for i, text in enumerate(PRIME_DIRECTIVE_PRIORITIES)],
    }


# Convenience: the directive as a single block of plaintext, formatted
# exactly as it appears in PRD.md. Used by the pre-push invariant test
# to assert PRD ↔ runtime parity.
PRIME_DIRECTIVE_FULL_TEXT: str = "\n\n".join(
    [
        PRIME_DIRECTIVE_OPENING,
        PRIME_DIRECTIVE_LEGACY_MANDATE,
        PRIME_DIRECTIVE_INCLUSIVITY_MANDATE,
        PRIME_DIRECTIVE_PRIORITY_PREAMBLE,
        "\n".join(f"{i + 1}. {text}" for i, text in enumerate(PRIME_DIRECTIVE_PRIORITIES)),
    ]
)
