import json

ENCHANT_MULTIPLIERS = {
    "protection":            {"item": 1, "book": 1},
    "fire_protection":       {"item": 2, "book": 1},
    "feather_falling":       {"item": 2, "book": 1},
    "blast_protection":      {"item": 4, "book": 2},
    "projectile_protection": {"item": 2, "book": 1},
    "thorns":                {"item": 8, "book": 4},
    "respiration":           {"item": 4, "book": 2},
    "depth_strider":         {"item": 4, "book": 2},
    "aqua_affinity":         {"item": 4, "book": 2},
    "sharpness":             {"item": 1, "book": 1},
    "smite":                 {"item": 2, "book": 1},
    "bane_of_arthropods":    {"item": 2, "book": 1},
    "knockback":             {"item": 2, "book": 1},
    "fire_aspect":           {"item": 4, "book": 2},
    "looting":               {"item": 4, "book": 2},
    "efficiency":            {"item": 1, "book": 1},
    "silk_touch":            {"item": 8, "book": 4},
    "unbreaking":            {"item": 2, "book": 1},
    "fortune":               {"item": 4, "book": 2},
    "power":                 {"item": 1, "book": 1},
    "punch":                 {"item": 2, "book": 1},
    "flame":                 {"item": 4, "book": 2},
    "infinity":              {"item": 8, "book": 4},
    "luck_of_the_sea":       {"item": 4, "book": 2},
    "lure":                  {"item": 4, "book": 2},
    "frost_walker":          {"item": 4, "book": 2},
    "mending":               {"item": 4, "book": 2},
    "binding_curse":         {"item": 8, "book": 4},
    "vanishing_curse":       {"item": 8, "book": 4},
    "impaling":              {"item": 2, "book": 1},
    "riptide":               {"item": 4, "book": 2},
    "loyalty":               {"item": 1, "book": 1},
    "channeling":            {"item": 8, "book": 4},
    "multishot":             {"item": 4, "book": 2},
    "piercing":              {"item": 1, "book": 1},
    "quick_charge":          {"item": 2, "book": 1},
    "soul_speed":            {"item": 8, "book": 4},
    "swift_sneak":           {"item": 8, "book": 4},
    "sweeping_edge":         {"item": 4, "book": 2}
}

with open("enchantments.json", "r", encoding="utf-8") as f:
    data = json.load(f)

for ench in data:
    mid = ench["id"]
    if mid in ENCHANT_MULTIPLIERS:
        ench["item_multiplier"] = ENCHANT_MULTIPLIERS[mid]["item"]
        ench["book_multiplier"] = ENCHANT_MULTIPLIERS[mid]["book"]

with open("data/enchantments.json", "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print("enchantments.json이 공식 위키 값으로 업데이트되었습니다.")
