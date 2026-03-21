import React, { useState, useEffect } from 'react';
import { Zap, Plus } from 'lucide-react';
import { useUserStore } from '../stores';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Spinner } from './ui/Spinner';
import { Badge } from './ui/Badge';
import { ErrorMessage } from './ui/ErrorMessage';

interface LoginPageProps {
  onLogin: () => void;
  isLoading?: boolean;
}

export const LoginPage: React.FC<LoginPageProps> = () => {
  const { availableUsers, fetchUsers, selectUser, createUser, isLoading } = useUserStore();
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [handle, setHandle] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleSelectUser = async (userId: number) => {
    try {
      await selectUser(userId);
    } catch (err) {
      setError('Failed to select user');
    }
  };

  const handleCreateUser = async () => {
    if (!name.trim() || !handle.trim()) {
      setError('Name and handle are required');
      return;
    }
    try {
      setError('');
      await createUser(name.trim(), handle.trim());
    } catch (err) {
      setError((err as Error).message || 'Failed to create user');
    }
  };

  return (
    <div className="min-h-screen bg-black flex flex-col relative overflow-hidden">
      {/* Background — subtle gradient, no animated blobs */}
      <div className="absolute inset-0 bg-gradient-to-br from-orange-900/10 via-black to-amber-900/5" />

      {/* Content */}
      <div className="relative z-10 flex-1 flex flex-col px-6 pt-12 pb-8">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-orange-500 to-amber-600 rounded-2xl mb-4">
            <Zap className="w-8 h-8 text-white fill-white" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-white mb-1 font-display">
            BITLINK
          </h1>
          <p className="text-stone-500 text-xs font-medium">
            Dev Mode - Select a user
          </p>
        </div>

        {showCreate ? (
          /* Create User Form */
          <div className="space-y-4">
            <Input
              placeholder="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Input
              placeholder="Handle (e.g. satoshi)"
              value={handle}
              onChange={(e) => setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
            />
            {error && <ErrorMessage message={error} />}
            <Button
              fullWidth
              size="lg"
              loading={isLoading}
              onClick={handleCreateUser}
            >
              <Plus size={18} />
              <span>Create User</span>
            </Button>
            <button
              onClick={() => setShowCreate(false)}
              className="w-full text-stone-500 hover:text-stone-300 text-sm py-2 transition-colors"
            >
              Back to user list
            </button>
          </div>
        ) : (
          /* User List */
          <div className="flex-1 overflow-y-auto">
            <div className="space-y-3 mb-6">
              {availableUsers.length === 0 && !isLoading && (
                <p className="text-stone-500 text-center py-8">
                  No users yet. Create one to get started!
                </p>
              )}
              {isLoading && availableUsers.length === 0 && (
                <div className="flex justify-center py-8">
                  <Spinner size="lg" />
                </div>
              )}
              {availableUsers.map((user) => {
                const avatarUrl = user.avatar || `https://i.pravatar.cc/150?u=${encodeURIComponent(user.name)}`;
                return (
                  <button
                    key={user.id}
                    data-testid={`login-user-${user.handle}`}
                    onClick={() => handleSelectUser(user.id)}
                    disabled={isLoading}
                    className="w-full bg-stone-900/80 border border-stone-800 rounded-2xl p-4 flex items-center gap-4 active:scale-[0.98] transition-all disabled:opacity-50 hover:border-orange-500/50"
                  >
                    <div className="w-12 h-12 rounded-full overflow-hidden bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center">
                      <img
                        src={avatarUrl}
                        alt={user.name}
                        className="w-full h-full rounded-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = `https://i.pravatar.cc/150?u=${encodeURIComponent(user.name)}`;
                        }}
                      />
                    </div>
                    <div className="flex-1 text-left">
                      <span className="font-bold text-white block">{user.name}</span>
                      <span className="text-stone-500 text-sm">@{user.handle}</span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Create New User Button */}
            <button
              onClick={() => setShowCreate(true)}
              className="w-full bg-stone-900 border border-dashed border-stone-700 rounded-2xl p-4 flex items-center justify-center gap-3 text-stone-400 hover:border-orange-500/50 hover:text-orange-500 transition-all"
            >
              <Plus size={20} />
              <span className="font-medium">Create New User</span>
            </button>
          </div>
        )}

        {/* Dev Mode Badge */}
        <div className="mt-6 flex justify-center">
          <Badge variant="yellow">DEV MODE</Badge>
        </div>
      </div>
    </div>
  );
};
