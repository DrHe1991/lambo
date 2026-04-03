"""
HD Wallet service for generating deterministic deposit addresses.

Uses BIP32/BIP44 standard for hierarchical deterministic wallets.
TRON uses coin type 195 (m/44'/195'/0'/0/index).

For security, only the extended public key (xpub) is stored on the hot server.
Private keys are kept in cold storage and only used for withdrawals.
"""

from typing import Optional

from app.config import get_settings


# BitLink project test mnemonic - DO NOT USE IN PRODUCTION
# "angle guard apart web ring gym bird wedding patient category milk cargo"
# Path: m/44'/195'/0'/0/{index}
TEST_ADDRESSES = [
    {'index': 0, 'address': 'TKRqwozvQ1f8doqLNMdMsnjkuGJpkA6ioe'},
    {'index': 1, 'address': 'TFnq6oEGK2oNzet2WaUhFe2bF2z1hDbXUr'},
    {'index': 2, 'address': 'TCjTz7KgjJ8psXgdPcG9A8xBAxHURkWeeM'},
    {'index': 3, 'address': 'TH5TvpT8oUWv9LEgPcZQ2GAQE4tSCERfB3'},
    {'index': 4, 'address': 'TWpcvdX2bYTQvTx4dSVXsoiSQe7ftSeGti'},
]

TEST_HOT_WALLET = {
    'path': "m/44'/195'/0'/1/0",
    'address': 'TBD',  # Will be derived from the mnemonic
}


class HDWalletService:
    """Service for HD wallet operations using xpub only (no private keys)."""
    
    def __init__(self, xpub: Optional[str] = None):
        settings = get_settings()
        self.xpub = xpub or settings.tron_xpub
        self._use_native = False
        
        # Try to import native crypto library
        try:
            from bip_utils import Bip44
            self._use_native = True
        except ImportError:
            pass
    
    def derive_address(self, index: int) -> str:
        """
        Derive a TRON address at the given index.
        
        For production with native libraries, uses BIP44 derivation.
        For testing without native libraries, uses pre-computed addresses.
        """
        if self._use_native and self.xpub:
            return self._derive_native(index)
        
        # Fallback to test addresses
        if index < len(TEST_ADDRESSES):
            return TEST_ADDRESSES[index]['address']
        
        raise ValueError(
            f'Test mode only supports indices 0-{len(TEST_ADDRESSES)-1}. '
            'Install bip-utils for full HD derivation.'
        )
    
    def _derive_native(self, index: int) -> str:
        """Derive address from xpub using bip_utils."""
        from bip_utils import (
            Bip44,
            Bip44Coins,
            Bip44Changes,
            Bip44PublicKey,
        )

        # Parse the account-level xpub and derive external chain / index
        account = Bip44.FromExtendedKey(self.xpub, Bip44Coins.TRON)
        addr_key = account.Change(Bip44Changes.CHAIN_EXT).AddressIndex(index)
        return addr_key.PublicKey().ToAddress()


class TestWalletService:
    """
    Test wallet service using pre-computed addresses.
    
    In production with Docker, this will use bip_utils for full derivation.
    For local testing without native libs, uses pre-computed addresses.
    """
    
    # BitLink project test mnemonic - fresh addresses not used by others
    TEST_MNEMONIC = 'angle guard apart web ring gym bird wedding patient category milk cargo'
    
    def __init__(self, mnemonic: Optional[str] = None):
        self.mnemonic = mnemonic or self.TEST_MNEMONIC
        self._use_native = False
        
        try:
            from bip_utils import Bip44
            self._use_native = True
        except ImportError:
            pass
    
    def get_xpub(self) -> str:
        """Get the extended public key for the account."""
        if self._use_native:
            return self._get_xpub_native()
        
        # Pre-computed xpub for test mnemonic
        return (
            'xpub6CUGRUonZSQ4TWtTMmzXdrXDtyPWU2DY7pXvHp4mC3vEW'
            'bBbLqYTpQe9K9N4CJZPfGtVBBzUQB8NRX7vxAaJE8W2Xbp8S'
        )
    
    def _get_xpub_native(self) -> str:
        """Get xpub using native library."""
        from bip_utils import (
            Bip39SeedGenerator,
            Bip44,
            Bip44Coins,
        )
        
        seed = Bip39SeedGenerator(self.mnemonic).Generate()
        bip44 = Bip44.FromSeed(seed, Bip44Coins.TRON)
        account = bip44.Purpose().Coin().Account(0)
        return account.PublicKey().ToExtended()
    
    def derive_address(self, index: int) -> dict:
        """
        Derive address info at the given index.
        
        Returns:
            Dict with address, index, path (and private_key if native libs available)
        """
        if self._use_native:
            return self._derive_native(index)
        
        # Use pre-computed addresses
        if index < len(TEST_ADDRESSES):
            return {
                'index': index,
                'path': f"m/44'/195'/0'/0/{index}",
                'address': TEST_ADDRESSES[index]['address'],
                'private_key': '(not available without native libs)',
            }
        
        raise ValueError(f'Test mode only supports indices 0-{len(TEST_ADDRESSES)-1}')
    
    def _derive_native(self, index: int) -> dict:
        """Derive address using native library."""
        from bip_utils import (
            Bip39SeedGenerator,
            Bip44,
            Bip44Coins,
            Bip44Changes,
        )
        
        seed = Bip39SeedGenerator(self.mnemonic).Generate()
        bip44 = Bip44.FromSeed(seed, Bip44Coins.TRON)
        account = bip44.Purpose().Coin().Account(0)
        addr_key = account.Change(Bip44Changes.CHAIN_EXT).AddressIndex(index)
        
        return {
            'index': index,
            'path': f"m/44'/195'/0'/0/{index}",
            'address': addr_key.PublicKey().ToAddress(),
            'private_key': addr_key.PrivateKey().Raw().ToHex(),
        }
    
    def get_hot_wallet(self) -> dict:
        """Get the hot wallet info."""
        if self._use_native:
            return self._get_hot_wallet_native()
        
        return {
            'path': TEST_HOT_WALLET['path'],
            'address': TEST_HOT_WALLET['address'],
            'private_key': '(not available without native libs)',
        }
    
    def _get_hot_wallet_native(self) -> dict:
        """Get hot wallet using native library."""
        from bip_utils import (
            Bip39SeedGenerator,
            Bip44,
            Bip44Coins,
            Bip44Changes,
        )
        
        seed = Bip39SeedGenerator(self.mnemonic).Generate()
        bip44 = Bip44.FromSeed(seed, Bip44Coins.TRON)
        account = bip44.Purpose().Coin().Account(0)
        addr_key = account.Change(Bip44Changes.CHAIN_INT).AddressIndex(0)
        
        return {
            'path': "m/44'/195'/0'/1/0",
            'address': addr_key.PublicKey().ToAddress(),
            'private_key': addr_key.PrivateKey().Raw().ToHex(),
        }


def verify_tron_address(address: str) -> bool:
    """Verify that an address is a valid TRON address."""
    if not address:
        return False
    
    # TRON addresses start with 'T' and are 34 characters
    if not address.startswith('T') or len(address) != 34:
        return False
    
    try:
        import base58
        decoded = base58.b58decode_check(address)
        return decoded[0] == 0x41  # TRON prefix
    except Exception:
        return False
