import { resources } from "@namma-seva/i18n";

/**
 * Version of the Privacy Notice this build shows. It lives with the notice text in
 * `@namma-seva/i18n` (`consent.version`); the API refuses OTP requests that quote another version
 * (its `CONSENT_VERSION` env), so a notice change forces every citizen to accept it again.
 */
export const CONSENT_VERSION = resources.en.translation.consent.version;
