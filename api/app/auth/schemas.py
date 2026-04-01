from pydantic import BaseModel


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = 'bearer'


class GoogleLoginRequest(BaseModel):
    id_token: str


class Web3NonceRequest(BaseModel):
    address: str
    chain: str  # ethereum, solana, bnb


class Web3NonceResponse(BaseModel):
    nonce: str
    message: str


class Web3VerifyRequest(BaseModel):
    address: str
    chain: str
    signature: str
    nonce: str


class RefreshRequest(BaseModel):
    refresh_token: str


class AuthResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = 'bearer'
    needs_onboarding: bool = False


class LinkWeb3Request(BaseModel):
    address: str
    chain: str
    signature: str
    nonce: str
