/** The version this server reports (the release build sets TURBOKEEP_VERSION; a checkout reports what the installer or updater wrote). */
export const VERSION = process.env.TURBOKEEP_VERSION ?? 'dev';
