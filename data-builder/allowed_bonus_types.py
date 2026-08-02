ALLOWED_BONUS_TYPES = {
    "Alchemical",
    "Artifact",
    "Armor",
    "Bool",
    "Competence",
    "Deflection",
    "Enhancement",
    "Equipment",
    "Exceptional",
    "Festive",
    "Implement",
    "Insight",
    "Insight Natural",
    "Legendary",
    "Luck",
    "Natural",
    "Orb",
    "Penalty",
    "Profane",
    "Primal Natural",
    "Psionic",
    "Quality",
    "Quality Natural",
    "Resistance",
    "Sacred",
    "Shield",
    "Untyped",
    "Untyped Shield",
    "Vitality",
}

PARSER_BONUS_TYPE_PATTERNS = [
    "Alchemical(?! Air)(?! Earth)(?! Fire)(?! Water)",
    "Artifact",
    "Competence",
    "Deflection",
    "[Ee]nhancement",
    "Equipment",
    "Exceptional",
    "Festive",
    "Implement",
    "[Ii]nsight(?:ful)?",
    "Legendary(?! Ash)(?! Affirmation)(?! Dust)(?! Ice)(?! Ooze)(?! Salt)(?! Steam)(?! Vacuum)",
    "Luck",
    "Natural",
    "Profane",
    "Psionic",
    "Quality",
    "Resistance(?! Rating)",
    "Sacred",
    "Vitality",
]


def get_allowed_bonus_types() -> set[str]:
    return set(ALLOWED_BONUS_TYPES)


def get_parser_bonus_type_regex() -> str:
    return "(" + "|".join(PARSER_BONUS_TYPE_PATTERNS) + ")"


def normalize_bonus_type(bonus_type: object) -> object:
    if not isinstance(bonus_type, str) or not bonus_type:
        return bonus_type

    normalized = bonus_type[0].upper() + bonus_type[1:]
    if normalized == "Insightful":
        return "Insight"
    return normalized
