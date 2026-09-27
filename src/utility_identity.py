"""Conservative owner identities for cross-company opportunity screening.

Source labels and project IDs are never rewritten. Displaying the first owner is
only a UI choice; eligibility must consider every explicitly listed owner.
"""

from functools import lru_cache
import re
import unicodedata


_LEGAL_SUFFIX = re.compile(r"(?:\s+|^)(?:incorporated|inc|llc|ltd|limited|corporation|corp|company|co|lp)$")
_COMMA_SUFFIX = re.compile(r"(?:incorporated|inc\.?|l\.?l\.?c\.?|ltd\.?|limited|corp\.?|corporation|co\.?|company|l\.?p\.?)(?=\s*(?:$|[,;/(]))", re.I)
_PARENTHETICAL = re.compile(r"\s*\(([^()]*)\)\s*$")
_GEOGRAPHIC_CODES = set("AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC US USA".split())


def _name_key(value):
    value = unicodedata.normalize("NFKC", value).casefold().replace("&", " and ").replace(".", "")
    value = " ".join(re.sub(r"[^\w\s]", " ", value).split())
    value = re.sub(r"^the\s+", "", value)
    while (shorter := _LEGAL_SUFFIX.sub("", value).strip()) and shorter != value:
        value = shorter
    return value


# These abbreviations are explicitly expanded in the source dataset. Do not
# infer arbitrary initials: e.g. the source's APS is NOT Arizona Public Service.
_ALIASES = {
    "aep": "american electric power",
    "atc": "american transmission",
    "atsi": "american transmission systems",
    # Confirmed by https://www.ameren.com/about-ameren
    "atxi": "ameren transmission company of illinois",
    "bepc": "basin electric power cooperative",
    "bge": "baltimore gas and electric",
    "bpa": "bonneville power administration",
    "comed": "commonwealth edison",
    "metc": "michigan electric transmission",
    "pnm": "public service company of new mexico",
    "nypa": "new york power authority",
    "pg and e": "pacific gas and electric",
    "pepco": "potomac electric power",
    "sdg and e": "san diego gas and electric",
    "srp": "salt river project",
    "wapa": "western area power administration",
    "itctransmission": "international transmission",
    "itc transmission": "international transmission",
    "southern california edsion": "southern california edison",
}

# A named parent in parentheses is an annotation, not a replacement identity.
# Keep unrecognized qualifiers (especially geography / operating subsidiaries).
_ANNOTATIONS = {
    "michigan electric transmission": {"itc", "itc holdings", "metc"},
    "international transmission": {"itc transmission", "itctransmission"},
    "commonwealth edison": {"comed"},
    "virginia electric and power": {"dominion energy"},
    "northern states power": {"xcel energy"},
}

# ITC alone is a parent/portfolio-level source label, not an alias for any one
# subsidiary. Exclude a parent-vs-child recommendation without merging children.
# https://www.itc-holdings.com/itc-michigan/about-itc-michigan/
# https://www.itc-holdings.com/wp-content/uploads/2026/02/ITC-2025.12.31-10K-FINAL.pdf
_PARENT_SCOPES = {
    "itc": {"itc holdings", "itc michigan", "michigan electric transmission", "international transmission", "itc midwest", "itc great plains"},
    "itc holdings": {"itc", "itc michigan", "michigan electric transmission", "international transmission", "itc midwest", "itc great plains"},
    "itc michigan": {"michigan electric transmission", "international transmission"},
}


def _is_annotation(base, note):
    base_key = _name_key(base)
    note_key = _name_key(note)
    if note_key in _ANNOTATIONS.get(base_key, set()) or _ALIASES.get(note_key) == base_key:
        return True
    if re.search(r"\b(owner|owners|operator|developer|developers|ownership|unconfirmed|not confirmed)\b", note, re.I):
        return True
    # Strip only a matching acronym, never an arbitrary uppercase qualifier.
    # This does not create a global acronym alias automatically.
    compact = re.sub(r"[.\s&]", "", note)
    initials = "".join(word[0] for word in base_key.split() if word not in {"and", "of", "the"}).upper()
    return compact == initials and bool(re.fullmatch(r"[A-Z]{2,8}", compact)) and compact not in _GEOGRAPHIC_CODES


def _owner_key(owner):
    while match := _PARENTHETICAL.search(owner):
        base, note = owner[:match.start()].strip(), match.group(1).strip()
        if not base or not _is_annotation(base, note):
            break
        owner = base
    key = _name_key(owner)
    return _ALIASES.get(key, key)


def _owners(value):
    """Split source owner lists without splitting Inc., parentheticals, or '&'."""
    start, depth = 0, 0
    for index, character in enumerate(value):
        if character == "(":
            depth += 1
        elif character == ")":
            depth = max(0, depth - 1)
        if depth:
            continue
        separator = character == ";" or (
            character == "/" and index > 0 and index + 1 < len(value)
            and value[index - 1].isspace() and value[index + 1].isspace()
        ) or (character == "," and not _COMMA_SUFFIX.match(value[index + 1:].strip()))
        if separator:
            yield value[start:index].strip()
            start = index + 1
    yield value[start:].strip()


@lru_cache(maxsize=2048)
def company_identities(value):
    """Return canonical keys with their original individual owner display names."""
    return tuple(dict.fromkeys(
        (_owner_key(owner), owner) for owner in _owners(value or "") if owner
    ))


@lru_cache(maxsize=2048)
def company_keys(value):
    """Return distinct canonical owners, preserving significant name qualifiers."""
    return frozenset(key for key, _name in company_identities(value))


def companies_overlap(first, second):
    """Whether source labels share an owner or explicitly overlap a parent scope."""
    first_keys, second_keys = company_keys(first), company_keys(second)
    if first_keys & second_keys:
        return True
    return any(_PARENT_SCOPES.get(key, set()) & second_keys for key in first_keys) or any(
        _PARENT_SCOPES.get(key, set()) & first_keys for key in second_keys
    )
