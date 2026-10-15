/** The global settings as the settings page shows them (blueprint §3). */
export type GlobalSettings = {
  globalTheme: import("survey-core").ITheme | null;
  /** Exact origins as browsers send them, e.g. `https://www.drk-rostock.de`. */
  allowedOrigins: string[];
  /** Email domains every recipient must be on, e.g. `drk-rostock.de`. */
  allowedRecipientDomains: string[];
  /** Loads per minute and IP that `/load-form` serves. */
  loadRateLimit: number;
  /** Submissions per hour and IP that `/submit-form` takes. */
  submitRateLimit: number;
};
