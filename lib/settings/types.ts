/** The global settings as the settings page shows them (blueprint §3). */
export type GlobalSettings = {
  /** Exact origins as browsers send them, e.g. `https://www.drk-rostock.de`. */
  allowedOrigins: string[];
  /** Loads per minute and IP that `/load-form` serves. */
  loadRateLimit: number;
  /** Submissions per hour and IP that `/submit-form` takes. */
  submitRateLimit: number;
};
