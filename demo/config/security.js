/**
 * Security
 *
 * The demo is a JSON API: writes carry an API token in the Authorization
 * header, not a session cookie, so the session-bound CSRF check is off.
 * An app that serves forms to browsers keeps it on (the default).
 */

export default {
  csrf: false
}
