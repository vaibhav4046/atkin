/**
 * Empty on purpose.
 *
 * PostCSS walks up the directory tree looking for a config, and on this machine it
 * found a Tailwind one several levels above the repository, which meant the build
 * output depended on where the project happened to be checked out. Atkin's styles
 * are hand written and need no plugins, so this file stops the search here.
 */
export default { plugins: {} };
