# GitHub Organization Login

The GitHub login method is restricted to users who satisfy **both** conditions:

1. The configured GitHub App is installed on the `BYV-Dev-Unorganization` organization.
2. The GitHub account completing the login has an `active` membership in that organization.

An App installation alone does not grant CLI access. An active organization membership alone is also not enough.

## GitHub App setup

Configure the GitHub App before enabling this login method:

1. Set a Callback URL that exactly matches the value returned by `getOauthConfig().MANUAL_REDIRECT_URL` in this CLI build. The URL must match the callback URL used during token exchange.
2. Grant the App the organization **Members: read-only** permission so the CLI can query the current user's organization membership.
3. Make the App available to the `BYV-Dev-Unorganization` organization and install it there. If GitHub requires approval, an organization owner must approve it before login can succeed.
4. Enable **Device Flow** in the GitHub App settings. The CLI then uses GitHub's device authorization grant, which is designed for CLI applications and does not need a Client Secret. Each user authorizes their own GitHub account.

## Runtime configuration

The CLI uses GitHub's Device Flow for organization login. This flow is designed for CLI/headless applications and does **not** require a Client Secret, so the repository does not embed one.

The source includes defaults for the public App identifiers: slug `byv-dev-unorganization` and Client ID. These can be overridden with environment variables:

- `GITHUB_APP_SLUG` (or `CLAUDE_CODE_GITHUB_APP_SLUG`): GitHub App slug used in the installation URL.
- `GITHUB_OAUTH_CLIENT_ID` (or `CLAUDE_CODE_GITHUB_CLIENT_ID`): Client ID from the GitHub App settings.

**One-time GitHub App setup:** enable **Device Flow** in the GitHub App settings for `byv-dev-unorganization`. Without this setting, GitHub returns `device_flow_disabled`. No Client Secret needs to be added to source or environment for this flow. The older authorization-code helper still requires `GITHUB_OAUTH_CLIENT_SECRET` if called directly, but the CLI's organization-login path does not use it.

## User flow

1. The CLI requests a device code from GitHub and opens `https://github.com/login/device`.
2. The CLI displays a short user code. Enter it on the GitHub device page and authorize the App.
3. The CLI polls GitHub using the provided polling interval until authorization succeeds or expires. This exchange does not use a Client Secret.
4. The CLI verifies that this App is installed on `BYV-Dev-Unorganization`. If it is not installed, the CLI shows an installation link; an organization owner must install or approve it, then login can be retried.
5. The CLI independently verifies that the authenticated user's organization membership is `active`. Only after both installation and membership checks pass does it request the internal access token and complete login.

The CLI checks installations accessible to the authenticated GitHub user token via GitHub's `GET /user/installations` endpoint, then independently checks membership via `GET /user/memberships/orgs/{org}`. Device Flow user codes expire; restart `/login` to get a fresh code if needed.

## Server-side authorization requirement

The checks in this CLI prevent normal users from completing a login when installation or membership is missing, but a client-side check is not a security boundary: a modified CLI can skip it. Before this flow is used in production, the server behind `/api/oauth/github/exchange` must independently verify the GitHub identity, required App installation, and active organization membership before issuing an internal access token. That backend endpoint is not implemented in this repository, so its enforcement must be confirmed separately.

## Troubleshooting

- **GitHub Organization login is not configured**: verify the App slug and Client ID defaults or their environment-variable overrides.
- **The App must be installed**: use the installation link printed by the CLI and have an organization owner install or approve it on `BYV-Dev-Unorganization`, not on a personal account or another organization. Then restart login.
- **Must have active membership**: confirm the GitHub account used for authorization is an active member of the organization. Pending invitations do not pass.
- **Authorization code/state rejected**: restart login to create a fresh state and submit the code and state from that same attempt.
