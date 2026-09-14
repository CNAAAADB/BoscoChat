"""
Generate a Microsoft Graph refresh token for the SharePoint MCP server.

Uses the interactive (public client) flow: a browser window opens for the
Siemens login + consent, and the refresh token is printed at the end. Paste it
into your mcp.json (header "Token" with "TokenType": "refresh", or the
REFRESH_TOKEN env var for stdio mode).

The app registration must have "Allow public client flows" enabled and a
"Mobile and desktop applications" redirect URI of http://localhost.

Usage:
    python scripts/create_refresh_token.py
    python scripts/create_refresh_token.py --tenant-id <id> --client-id <id>
"""

from __future__ import annotations

import argparse
import os

import msal

DEFAULT_TENANT_ID = os.getenv("TENANT_ID", "38ae3bcd-9579-4fd4-adda-b42e1495d55a")
DEFAULT_CLIENT_ID = os.getenv("CLIENT_ID", "1c072c20-e398-4dd1-818d-f9fd58329213")

# Delegated scopes for SharePoint file operations. MSAL adds offline_access
# automatically so a refresh token is issued.
SCOPES = [
    "Sites.Selected",
    "Files.Read",
    "Files.ReadWrite",
]


def get_refresh_token(tenant_id: str, client_id: str) -> None:
    authority = f"https://login.microsoftonline.com/{tenant_id}"
    app = msal.PublicClientApplication(client_id, authority=authority)

    print(f"Requesting scopes: {', '.join(SCOPES)}")
    print("A browser window will open for authentication...\n")

    result = app.acquire_token_interactive(scopes=SCOPES, prompt="select_account")

    if "access_token" not in result:
        error = result.get("error_description", result.get("error", "Unknown error"))
        print(f"\n[ERROR] {error}")
        raise SystemExit(1)

    refresh_token = result.get("refresh_token")
    if not refresh_token:
        print("\n[ERROR] No refresh token returned (offline_access not granted for the app).")
        raise SystemExit(1)

    user = result.get("id_token_claims", {}).get("preferred_username", "unknown")
    print(f"\n[OK] Success! Signed in as: {user}")
    print("\n--- Refresh Token (paste into mcp.json) ---\n")
    print(refresh_token)
    print("\n-------------------------------------------")


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate a SharePoint MCP refresh token.")
    parser.add_argument("--tenant-id", default=DEFAULT_TENANT_ID)
    parser.add_argument("--client-id", default=DEFAULT_CLIENT_ID)
    args = parser.parse_args()
    get_refresh_token(args.tenant_id, args.client_id)


if __name__ == "__main__":
    main()