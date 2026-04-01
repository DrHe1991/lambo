from dataclasses import dataclass

from google.oauth2 import id_token
from google.auth.transport import requests

from app.config import settings


@dataclass
class GoogleUserInfo:
    sub: str
    email: str
    name: str
    picture: str
    email_verified: bool


def verify_google_id_token(token: str) -> GoogleUserInfo:
    """Verify a Google ID token and extract user info.

    The token comes from Google Sign-In on Android (Credential Manager)
    or from the web Google Identity Services library.
    """
    idinfo = id_token.verify_oauth2_token(
        token,
        requests.Request(),
        settings.google_client_id,
    )

    return GoogleUserInfo(
        sub=idinfo['sub'],
        email=idinfo.get('email', ''),
        name=idinfo.get('name', ''),
        picture=idinfo.get('picture', ''),
        email_verified=idinfo.get('email_verified', False),
    )
