// Central export for all subject themes
// These themes are extracted from UPSC PYQ analysis (2013-2025)

import { POLITY_THEMES, POLITY_STRATEGIC_TRAPS } from "./polity.js";
import { ECONOMY_THEMES, ECONOMY_STRATEGIC_TRAPS } from "./economy.js";
import { ENVIRONMENT_THEMES, ENVIRONMENT_STRATEGIC_TRAPS } from "./environment.js";
import { GEOGRAPHY_THEMES, GEOGRAPHY_STRATEGIC_TRAPS } from "./geography.js";
import { HISTORY_THEMES, HISTORY_STRATEGIC_TRAPS } from "./history.js";
import { SCIENCE_THEMES, SCIENCE_STRATEGIC_TRAPS } from "./science.js";
import { ART_CULTURE_THEMES, ART_CULTURE_STRATEGIC_TRAPS } from "./art.js";

// Re-export all themes
export {
    POLITY_THEMES,
    POLITY_STRATEGIC_TRAPS,
    ECONOMY_THEMES,
    ECONOMY_STRATEGIC_TRAPS,
    ENVIRONMENT_THEMES,
    ENVIRONMENT_STRATEGIC_TRAPS,
    GEOGRAPHY_THEMES,
    GEOGRAPHY_STRATEGIC_TRAPS,
    HISTORY_THEMES,
    HISTORY_STRATEGIC_TRAPS,
    SCIENCE_THEMES,
    SCIENCE_STRATEGIC_TRAPS,
    ART_CULTURE_THEMES,
    ART_CULTURE_STRATEGIC_TRAPS,
};

// Subject to theme mapping
const SUBJECT_THEMES_MAP: Record<string, { themes: string; traps: string }> = {
    polity: { themes: POLITY_THEMES, traps: POLITY_STRATEGIC_TRAPS },
    economy: { themes: ECONOMY_THEMES, traps: ECONOMY_STRATEGIC_TRAPS },
    environment: { themes: ENVIRONMENT_THEMES, traps: ENVIRONMENT_STRATEGIC_TRAPS },
    geography: { themes: GEOGRAPHY_THEMES, traps: GEOGRAPHY_STRATEGIC_TRAPS },
    history: { themes: HISTORY_THEMES, traps: HISTORY_STRATEGIC_TRAPS },
    science: { themes: SCIENCE_THEMES, traps: SCIENCE_STRATEGIC_TRAPS },
    "science and technology": { themes: SCIENCE_THEMES, traps: SCIENCE_STRATEGIC_TRAPS },
    "art and culture": { themes: ART_CULTURE_THEMES, traps: ART_CULTURE_STRATEGIC_TRAPS },
    art: { themes: ART_CULTURE_THEMES, traps: ART_CULTURE_STRATEGIC_TRAPS },
    culture: { themes: ART_CULTURE_THEMES, traps: ART_CULTURE_STRATEGIC_TRAPS },
};

/**
 * Get subject-specific themes content for the prompt
 * @param subject - The subject name (polity, economy, etc.)
 * @returns The themes content string or empty string if not found
 */
export function getSubjectThemes(subject: string): string {
    const normalizedSubject = subject.toLowerCase().trim();
    const themeData = SUBJECT_THEMES_MAP[normalizedSubject];

    if (!themeData) {
        return "";
    }

    return themeData.themes;
}

/**
 * Get subject-specific strategic traps for the prompt
 * @param subject - The subject name (polity, economy, etc.)
 * @returns The traps content string or empty string if not found
 */
export function getSubjectStrategicTraps(subject: string): string {
    const normalizedSubject = subject.toLowerCase().trim();
    const themeData = SUBJECT_THEMES_MAP[normalizedSubject];

    if (!themeData) {
        return "";
    }

    return themeData.traps;
}
