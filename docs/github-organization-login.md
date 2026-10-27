# GitHub Organization Login

The GitHub login method is restricted to users who satisfy **both** conditions:

1. The configured GitHub App is installed on the `BYV-Dev-Unorganization` organization.
2. The GitHub account completing the login has an `active` membership in that organization.

An App installation alone does not grant CLI access. An active organization membership alone is also not enough.

## GitHub App setup

Configure the GitHub App before using this login method:

1. Enable **Device Flow** in the GitHub App settings. This is required for CLI authentication and avoids embedding a Client Secret.
2. Grant the App the organization **Members: read-only** permission so the CLI can query the current user's organization membership.
3. Make the App available to the `BYV-Dev-Unorganization` organization and install it there. If GitHub requires approval, an organization owner must approve it before login can succeed.

## Runtime configuration

The CLI uses GitHub's Device Flow for organization login. This flow is designed for CLI/headless applications and does **not** require a Client Secret, so the repository does not embed one.

The source includes defaults for the public App identifiers: slug `byv-dev-unorganization` and Client ID. These can be overridden with environment variables:

- `GITHUB_APP_SLUG` (or `CLAUDE_CODE_GITHUB_APP_SLUG`): GitHub App slug used in the installation URL.
- `GITHUB_OAUTH_CLIENT_ID` (or `CLAUDE_CODE_GITHUB_CLIENT_ID`): Client ID from the GitHub App settings.

**One-time GitHub App setup:** enable **Device Flow** in the GitHub App settings for `byv-dev-unorganization`. Without this setting, GitHub returns `device_flow_disabled`. No Client Secret needs to be added to source or environment for this flow. The older authorization-code helper still requires `GITHUB_OAUTH_CLIENT_SECRET` if called directly, but the CLI's organization-login path does not use it.

## User flow

1. The CLI requests a device code from GitHub and opens `https://github.com/login/device`.
2. The CLI displays a short user code. Enter it on the GitHub device page and authorize the App.
3. The CLI polls GitHub until authorization succeeds, then verifies the App installation and active organization membership and fetches the GitHub profile.
4. The CLI stores the GitHub session locally in the Claude Code config and reports GitHub login as successful. No Anthropic token-exchange endpoint is called.

**Scope:** this completes GitHub identity login for local development. A GitHub token is not an Anthropic model-access token, so inference/provider wiring and plan entitlements must be implemented separately. Do not send the stored GitHub token to Anthropic API endpoints.

## Server-side authorization requirement

The current local GitHub session only proves the user authenticated with GitHub and passed the client-side organization checks. The GitHub access token is stored locally in the user's Claude Code config for future plan features; it is not used as an Anthropic OAuth token. Client-side checks can be bypassed by a modified CLI, so this flow must not be treated as a server-enforced entitlement boundary.

## Troubleshooting

- **GitHub Organization login is not configured**: verify the App slug and Client ID defaults or their environment-variable overrides.
- **The App must be installed**: use the installation link printed by the CLI and have an organization owner install or approve it on `BYV-Dev-Unorganization`, not on a personal account or another organization. Then restart login.
- **Must have active membership**: confirm the GitHub account used for authorization is an active member of the organization. Pending invitations do not pass.
- **Device Flow is disabled**: enable Device Flow in the GitHub App settings, then restart `/login`.
