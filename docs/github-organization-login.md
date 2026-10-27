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
4. The CLI uses the normal GitHub App web authorization flow for every user, with a per-session `state` and PKCE challenge. Do not rely on the automatic OAuth redirect after installation to authenticate every member; the person who installed the App and other members are separate GitHub users.

## Runtime configuration

Provide these environment variables to the runtime that starts the CLI:

- `GITHUB_APP_SLUG` (or `CLAUDE_CODE_GITHUB_APP_SLUG`): the GitHub App slug used in the installation URL.
- `GITHUB_OAUTH_CLIENT_ID` (or `CLAUDE_CODE_GITHUB_CLIENT_ID`): the Client ID from that GitHub App.
- `GITHUB_OAUTH_CLIENT_SECRET` (or `CLAUDE_CODE_GITHUB_CLIENT_SECRET`): the Client Secret from that GitHub App.

Do not commit real credentials. A shared Client Secret cannot be kept secret in a CLI distributed to untrusted users; deployments that distribute the CLI publicly should perform the code exchange in a trusted backend rather than shipping a shared secret to each client.

## User flow

1. The user starts GitHub Organization login and opens the authorization link shown by the CLI.
2. The user authorizes the GitHub App. The CLI expects the callback code and `state` in `code#state` format and checks the state against the current login session.
3. The CLI exchanges the code using the PKCE verifier, then checks whether this App is installed on `BYV-Dev-Unorganization`.
4. If the App is not installed, the CLI shows an installation link. An organization owner must install or approve the App; after that, the user restarts login. This install step is organization-wide, not something each member installs separately.
5. The CLI verifies that the authenticated user's membership is `active`. Only after both installation and membership checks pass does the CLI request the internal access token and complete login.

The CLI does not trust an `installation_id` parameter or the installation URL alone. It checks installations accessible to the authenticated GitHub App user token via GitHub's `GET /user/installations` endpoint, then independently checks membership via `GET /user/memberships/orgs/{org}`.

## Server-side authorization requirement

The checks in this CLI prevent normal users from completing a login when installation or membership is missing, but a client-side check is not a security boundary: a modified CLI can skip it. Before this flow is used in production, the server behind `/api/oauth/github/exchange` must independently verify the GitHub identity, required App installation, and active organization membership before issuing an internal access token. That backend endpoint is not implemented in this repository, so its enforcement must be confirmed separately.

## Troubleshooting

- **GitHub Organization login is not configured**: verify the three runtime variables above.
- **The App must be installed**: use the installation link printed by the CLI and have an organization owner install or approve it on `BYV-Dev-Unorganization`, not on a personal account or another organization. Then restart login.
- **Must have active membership**: confirm the GitHub account used for authorization is an active member of the organization. Pending invitations do not pass.
- **Authorization code/state rejected**: restart login to create a fresh state and submit the code and state from that same attempt.
