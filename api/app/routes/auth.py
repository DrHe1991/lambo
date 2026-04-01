import secrets
import re

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.jwt import (
    create_access_token,
    create_refresh_token,
    store_refresh_token,
    rotate_refresh_token,
    revoke_refresh_token,
)
from app.auth.google import verify_google_id_token
from app.auth.web3 import create_nonce, verify_and_consume_nonce, recover_eth_signer, verify_solana_signature, SIGN_MESSAGE_TEMPLATE
from app.auth.dependencies import get_current_user
from app.auth.schemas import (
    AuthResponse,
    GoogleLoginRequest,
    Web3NonceRequest,
    Web3NonceResponse,
    Web3VerifyRequest,
    RefreshRequest,
    LinkWeb3Request,
)
from app.db.database import get_db
from app.models.user import User
from app.models.auth import UserAuthProvider

router = APIRouter()


def _slugify_handle(name: str) -> str:
    """Generate a handle from a name, with random suffix for uniqueness."""
    slug = re.sub(r'[^a-zA-Z0-9_]', '', name.lower().replace(' ', '_'))[:20]
    if not slug:
        slug = 'user'
    return f'{slug}_{secrets.token_hex(2)}'


def _address_handle(address: str) -> str:
    """Generate a handle from a wallet address."""
    short = address[-8:].lower()
    return f'wallet_{short}'


async def _find_or_create_user_for_provider(
    provider: str,
    provider_id: str,
    db: AsyncSession,
    email: str | None = None,
    name: str | None = None,
    avatar: str | None = None,
    email_verified: bool = False,
) -> tuple[User, bool]:
    """Find user by auth provider, or create a new one. Returns (user, needs_onboarding)."""
    # Check if provider already linked
    result = await db.execute(
        select(UserAuthProvider).where(
            UserAuthProvider.provider == provider,
            UserAuthProvider.provider_id == provider_id,
        )
    )
    existing_provider = result.scalar_one_or_none()

    if existing_provider:
        user = await db.get(User, existing_provider.user_id)
        # Update avatar/name if changed (Google)
        if name and user.name != name:
            user.name = name
        if avatar and user.avatar != avatar:
            user.avatar = avatar
        return user, False

    # Check if email matches an existing user (adopt existing dev account)
    if email:
        result = await db.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()
        if user:
            # Link this provider to the existing user
            auth_provider = UserAuthProvider(
                user_id=user.id,
                provider=provider,
                provider_id=provider_id,
                metadata_={'email': email, 'name': name, 'avatar': avatar},
            )
            db.add(auth_provider)
            if email_verified:
                user.email_verified = True
            return user, False

    # Create new user
    needs_onboarding = not name
    handle = _slugify_handle(name) if name else _address_handle(provider_id)

    # Ensure handle uniqueness
    for _ in range(5):
        result = await db.execute(select(User).where(User.handle == handle))
        if not result.scalar_one_or_none():
            break
        handle = _slugify_handle(name or 'user')

    user = User(
        name=name or handle,
        handle=handle,
        avatar=avatar,
        email=email,
        email_verified=email_verified,
    )
    db.add(user)
    await db.flush()

    auth_provider = UserAuthProvider(
        user_id=user.id,
        provider=provider,
        provider_id=provider_id,
        metadata_={'email': email, 'name': name},
    )
    db.add(auth_provider)

    return user, needs_onboarding


@router.post('/google', response_model=AuthResponse)
async def google_login(body: GoogleLoginRequest, db: AsyncSession = Depends(get_db)):
    """Exchange a Google ID token for a JWT pair."""
    try:
        info = verify_google_id_token(body.id_token)
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Invalid Google token')

    user, needs_onboarding = await _find_or_create_user_for_provider(
        provider='google',
        provider_id=info.sub,
        db=db,
        email=info.email,
        name=info.name,
        avatar=info.picture,
        email_verified=info.email_verified,
    )

    access_token = create_access_token(user.id)
    refresh_token = create_refresh_token()
    await store_refresh_token(user.id, refresh_token, db)

    return AuthResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        needs_onboarding=needs_onboarding,
    )


@router.post('/web3/nonce', response_model=Web3NonceResponse)
async def request_nonce(body: Web3NonceRequest):
    """Request a signing challenge for Web3 wallet login."""
    if body.chain not in ('ethereum', 'solana', 'bnb'):
        raise HTTPException(status_code=400, detail='Unsupported chain')

    nonce, message = await create_nonce(body.address)
    return Web3NonceResponse(nonce=nonce, message=message)


@router.post('/web3/verify', response_model=AuthResponse)
async def verify_wallet(body: Web3VerifyRequest, db: AsyncSession = Depends(get_db)):
    """Verify a signed challenge and issue JWT pair."""
    if body.chain not in ('ethereum', 'solana', 'bnb'):
        raise HTTPException(status_code=400, detail='Unsupported chain')

    # Verify nonce
    if not await verify_and_consume_nonce(body.address, body.nonce):
        raise HTTPException(status_code=401, detail='Invalid or expired nonce')

    # Verify signature
    message = SIGN_MESSAGE_TEMPLATE.format(nonce=body.nonce)

    if body.chain in ('ethereum', 'bnb'):
        recovered = recover_eth_signer(message, body.signature)
        if recovered.lower() != body.address.lower():
            raise HTTPException(status_code=401, detail='Signature verification failed')
        canonical_address = recovered  # checksummed
    elif body.chain == 'solana':
        if not verify_solana_signature(body.address, message, body.signature):
            raise HTTPException(status_code=401, detail='Signature verification failed')
        canonical_address = body.address
    else:
        raise HTTPException(status_code=400, detail='Unsupported chain')

    user, needs_onboarding = await _find_or_create_user_for_provider(
        provider=body.chain,
        provider_id=canonical_address,
        db=db,
    )

    access_token = create_access_token(user.id)
    refresh_token = create_refresh_token()
    await store_refresh_token(user.id, refresh_token, db)

    return AuthResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        needs_onboarding=needs_onboarding,
    )


@router.post('/refresh', response_model=AuthResponse)
async def refresh(body: RefreshRequest, db: AsyncSession = Depends(get_db)):
    """Exchange a refresh token for a new token pair."""
    try:
        user_id, new_access, new_refresh = await rotate_refresh_token(body.refresh_token, db)
    except ValueError:
        raise HTTPException(status_code=401, detail='Invalid or expired refresh token')

    return AuthResponse(access_token=new_access, refresh_token=new_refresh)


@router.post('/logout', status_code=204)
async def logout(body: RefreshRequest, db: AsyncSession = Depends(get_db)):
    """Revoke a refresh token (sign out)."""
    await revoke_refresh_token(body.refresh_token, db)


@router.get('/me')
async def get_me(current_user: User = Depends(get_current_user)):
    """Get the current authenticated user."""
    return {
        'id': current_user.id,
        'name': current_user.name,
        'handle': current_user.handle,
        'avatar': current_user.avatar,
        'email': current_user.email,
        'available_balance': current_user.available_balance,
        'stable_balance': current_user.stable_balance,
    }


@router.post('/link/google', status_code=201)
async def link_google(
    body: GoogleLoginRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Link a Google account to the current user."""
    try:
        info = verify_google_id_token(body.id_token)
    except Exception:
        raise HTTPException(status_code=401, detail='Invalid Google token')

    # Check if already linked to another user
    result = await db.execute(
        select(UserAuthProvider).where(
            UserAuthProvider.provider == 'google',
            UserAuthProvider.provider_id == info.sub,
        )
    )
    if result.scalar_one_or_none():
        raise HTTPException(status_code=409, detail='This Google account is already linked')

    auth_provider = UserAuthProvider(
        user_id=current_user.id,
        provider='google',
        provider_id=info.sub,
        metadata_={'email': info.email, 'name': info.name},
    )
    db.add(auth_provider)

    if info.email and not current_user.email:
        current_user.email = info.email
        current_user.email_verified = info.email_verified

    return {'status': 'linked'}


@router.post('/link/web3', status_code=201)
async def link_web3(
    body: LinkWeb3Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Link a Web3 wallet to the current user."""
    if body.chain not in ('ethereum', 'solana', 'bnb'):
        raise HTTPException(status_code=400, detail='Unsupported chain')

    if not await verify_and_consume_nonce(body.address, body.nonce):
        raise HTTPException(status_code=401, detail='Invalid or expired nonce')

    message = SIGN_MESSAGE_TEMPLATE.format(nonce=body.nonce)

    if body.chain in ('ethereum', 'bnb'):
        recovered = recover_eth_signer(message, body.signature)
        if recovered.lower() != body.address.lower():
            raise HTTPException(status_code=401, detail='Signature verification failed')
        canonical_address = recovered
    elif body.chain == 'solana':
        if not verify_solana_signature(body.address, message, body.signature):
            raise HTTPException(status_code=401, detail='Signature verification failed')
        canonical_address = body.address
    else:
        raise HTTPException(status_code=400, detail='Unsupported chain')

    # Check if already linked
    result = await db.execute(
        select(UserAuthProvider).where(
            UserAuthProvider.provider == body.chain,
            UserAuthProvider.provider_id == canonical_address,
        )
    )
    if result.scalar_one_or_none():
        raise HTTPException(status_code=409, detail='This wallet is already linked to an account')

    auth_provider = UserAuthProvider(
        user_id=current_user.id,
        provider=body.chain,
        provider_id=canonical_address,
    )
    db.add(auth_provider)

    return {'status': 'linked'}


@router.delete('/providers/{provider_id}', status_code=204)
async def unlink_provider(
    provider_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Unlink an auth provider. At least one must remain."""
    result = await db.execute(
        select(UserAuthProvider).where(UserAuthProvider.user_id == current_user.id)
    )
    providers = result.scalars().all()

    if len(providers) <= 1:
        raise HTTPException(status_code=400, detail='Cannot remove last auth provider')

    target = next((p for p in providers if p.id == provider_id), None)
    if not target:
        raise HTTPException(status_code=404, detail='Provider not found')

    await db.delete(target)
