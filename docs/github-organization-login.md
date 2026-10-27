# GitHub Organization Login

The GitHub login method is restricted to users who satisfy **both** conditions:

1. The configured GitHub App is installed on the `BYV-Dev-Unorganization` organization.
2. The GitHub account completing the login has an `active` membership in that organization.

An App installation alone does not grant CLI access. An active organization membership alone is also not enough.

## GitHub App setup

Configure the GitHub App before enabling this login method:

1. Set **Request user authorization (OAuth) during installation** in the App's settings. This lets GitHub redirect the user through the App's OAuth authorization flow after installation.
2. Set the first Callback URL to the value returned by `getOauthConfig().MANUAL_REDIRECT_URL` in this CLI build. The callback URL must match the URL used during token exchange.
3. Grant the App the organization **Members: read-only** permission so the CLI can query the current user's organization membership.
4. Make the App available to the `BYV-Dev-Unorganization` organization and install it there. If GitHub requires an organization owner to approve the installation, the owner must approve it before login can succeed.
5. Do not configure a separate Setup URL while **Request user authorization (OAuth) during installation** is enabled. GitHub does not allow both settings together.

## Runtime configuration

Provide these environment variables to the runtime that starts the CLI:

- `GITHUB_APP_SLUG` (or `CLAUDE_CODE_GITHUB_APP_SLUG`): the GitHub App slug used in the installation URL.
- `GITHUB_OAUTH_CLIENT_ID` (or `CLAUDE_CODE_GITHUB_CLIENT_ID`): the Client ID from that GitHub App.
- `GITHUB_OAUTH_CLIENT_SECRET` (or `CLAUDE_CODE_GITHUB_CLIENT_SECRET`): the Client Secret from that GitHub App.

Do not commit real credentials. A shared Client Secret cannot be kept secret in a CLI distributed to untrusted users; deployments that distribute the CLI publicly should perform the code exchange in a trusted backend rather than shipping a shared secret to each client.

## User flow

1. The user starts GitHub Organization login and opens the installation link shown by the CLI.
2. The user installs the App on the required organization and authorizes the App when GitHub prompts them.
3. The user pastes the authorization code and returned state into the CLI in `code#state` format.
4. The CLI checks that the state matches the current login attempt, exchanges the code, verifies that the current user can access an installation of the configured App on the required organization, and checks that the user's organization membership is `active`.
5. Only after both installation and membership checks pass does the CLI request the internal access token and complete login.

A spoofed `installation_id` or an installation URL by itself is not proof of a valid installation. The CLI checks the installations available to the authenticated GitHub App user token via GitHub's `GET /user/installations` endpoint, then independently checks membership via `GET /user/memberships/orgs/{org}`.

## Server-side authorization requirement

The checks in this CLI prevent normal users from completing a login when installation or membership is missing, but a client-side check is not a security boundary: a modified CLI can skip it. Before this flow is used in production, the server behind `/api/oauth/github/exchange` must independently verify the GitHub identity, required App installation, and active organization membership before issuing an internal access token. That backend endpoint is not implemented in this repository, so its enforcement must be confirmed separately.

## Troubleshooting

- **GitHub Organization login is not configured**: verify the three runtime variables above.
- **The App must be installed**: confirm the App is installed on `BYV-Dev-Unorganization`, not only on a personal account or another organization.
- **Must have active membership**: confirm the GitHub account used for authorization is an active member of the organization. Pending invitations do not pass.
- **Authorization code/state rejected**: restart login to create a fresh state and submit the code and state from that same attempt.
