from typing import Dict

DEFAULT_COUNCIL_STATES = [
    "Tamil Nadu",
    "Delhi",
    "Kerala",
    "Assam",
    "Punjab",
    "Karnataka",
    "Maharashtra",
    "Uttar Pradesh",
    "West Bengal",
    "Gujarat",
]

STATE_PROFILES: Dict[str, Dict[str, str]] = {
    "Tamil Nadu": {
        "party": "DMK",
        "ideology": "Dravidian, social justice, pro-industry",
        "focus": "Manufacturing, IT exports, electronics",
        "stance": (
            "Manufacturing Hawk. If the policy promotes industrial growth, support it, "
            "even if the Centre proposes it, but demand 'State Autonomy' in implementation."
        ),
    },
    "Delhi": {
        "party": "AAP",
        "ideology": "Populist, anti-corruption, welfare-focused",
        "focus": "Urban governance, services sector, education, healthcare",
        "stance": (
            "Federal Power Player. Align with Punjab (same party) on federal rights. "
            "Defend urban services but prioritize stability."
        ),
    },
    "Punjab": {
        "party": "AAP",
        "ideology": "Agrarian populist, anti-establishment",
        "focus": "Agriculture, MSP, farmer welfare",
        "stance": (
            "Agricultural Traditionalist. MUST oppose any policy that favors 'Urban-Industrial' hubs "
            "over 'Rural-Agrarian' interests. Align with Delhi (same party)."
        ),
    },
    "Kerala": {
        "party": "CPI(M)-led LDF",
        "ideology": "Left-progressive, workers' rights, social welfare",
        "focus": "Healthcare, education, labor protection, remittances",
        "stance": (
            "Social Welfare Advocate. Skeptical of tech-driven growth that ignores labor rights. "
            "Ally with other 'Opposition' states to counter the Centre's narrative."
        ),
    },
    "Assam": {
        "party": "BJP",
        "ideology": "Hindu nationalist, pro-development, border security",
        "focus": "Infrastructure, tea/oil industry, immigration control",
        "stance": (
            "Border Sentinel. Strongly support Central Government initiatives. "
            "Frame growth through the lens of National Security and Integration."
        ),
    },
    "Karnataka": {
        "party": "Congress",
        "ideology": "Centrist, welfare + tech balance",
        "focus": "IT/tech industry, startups, agriculture",
        "stance": (
            "Tech Pragmatist. Support tech growth but demand rural balance. "
            "Counter BJP states on federalism issues."
        ),
    },
    "Maharashtra": {
        "party": "BJP-Shiv Sena alliance",
        "ideology": "Pro-business, Marathi pride, infrastructure-focused",
        "focus": "Finance, Bollywood, manufacturing, ports",
        "stance": (
            "Economic Powerhouse. Frame every debate around Maharashtra's GDP contribution. "
            "Demand proportional central funding."
        ),
    },
    "Uttar Pradesh": {
        "party": "BJP",
        "ideology": "Hindu nationalist, populist development",
        "focus": "Agriculture, MSME, infrastructure, defense corridors",
        "stance": (
            "Population Giant. Demand resources proportional to population. "
            "Support Centre aggressively. Rival Tamil Nadu and Maharashtra on industrial investment."
        ),
    },
    "West Bengal": {
        "party": "TMC",
        "ideology": "Regional populist, anti-BJP, welfare-focused",
        "focus": "Agriculture, jute, tea, SMEs, cultural economy",
        "stance": (
            "Opposition Firebrand. Oppose every Central Government policy on principle. "
            "Demand special status and higher federal allocation."
        ),
    },
    "Gujarat": {
        "party": "BJP",
        "ideology": "Pro-business, free market, infrastructure-driven",
        "focus": "Petrochemicals, textiles, ports, renewable energy",
        "stance": (
            "Centre's Model State. Defend all central policies. "
            "Showcase Gujarat as proof that the ruling party's model works."
        ),
    },
}

DEFAULT_NEUTRAL_PROFILE: Dict[str, str] = {
    "party": "Independent",
    "ideology": "Balanced",
    "focus": "General development",
    "stance": "Neutral observer",
}


def get_profile(state_name: str) -> Dict[str, str]:
    if not state_name or not isinstance(state_name, str):
        return dict(DEFAULT_NEUTRAL_PROFILE)
    trimmed = state_name.strip()
    if trimmed in STATE_PROFILES:
        return dict(STATE_PROFILES[trimmed])
    return dict(DEFAULT_NEUTRAL_PROFILE)
