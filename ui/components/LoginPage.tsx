import React, { useState, useEffect } from 'react';
import { Zap, Plus, User } from 'lucide-react';
import { useUserStore } from '../stores';

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
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-orange-900/20 via-black to-amber-900/10" />
      <div className="absolute top-1/4 -left-32 w-64 h-64 bg-orange-500/20 rounded-full blur-3xl animate-pulse" />
      <div className="absolute bottom-1/4 -right-32 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
      
      {/* Content */}
      <div className="relative z-10 flex-1 flex flex-col px-6 pt-12 pb-8">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-orange-500 to-amber-600 rounded-2xl mb-4 shadow-2xl shadow-orange-500/30">
            <Zap className="w-8 h-8 text-white fill-white" />
          </div>
          <h1 className="text-3xl font-black italic tracking-tighter text-white mb-1">
            BITLINK
          </h1>
          <p className="text-zinc-500 text-xs font-medium">
            Dev Mode - Select a user
          </p>
        </div>

        {showCreate ? (
          /* Create User Form */
          <div className="space-y-4">
            <input
              type="text"
              placeholder="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 text-white py-3 px-4 rounded-xl"
          />
            <input
              type="text"
              placeholder="Handle (e.g. satoshi)"
              value={handle}
              onChange={(e) => setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
              className="w-full bg-zinc-900 border border-zinc-800 text-white py-3 px-4 rounded-xl"
          />
            {error && <p className="text-red-500 text-sm text-center">{error}</p>}
          <button
              onClick={handleCreateUser}
            disabled={isLoading}
              className="w-full bg-orange-500 text-white font-bold py-3 px-6 rounded-xl flex items-center justify-center gap-2 active:scale-[0.98] transition-all disabled:opacity-50"
          >
            {isLoading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                  <Plus size={18} />
                  <span>Create User</span>
              </>
            )}
          </button>
            <button
              onClick={() => setShowCreate(false)}
              className="w-full text-zinc-500 text-sm py-2"
            >
              Back to user list
            </button>
          </div>
        ) : (
          /* User List */
          <div className="flex-1 overflow-y-auto">
            <div className="space-y-3 mb-6">
              {availableUsers.length === 0 && !isLoading && (
                <p className="text-zinc-500 text-center py-8">
                  No users yet. Create one to get started!
                </p>
              )}
              {isLoading && availableUsers.length === 0 && (
                <div className="flex justify-center py-8">
                  <div className="w-8 h-8 border-2 border-orange-500/30 border-t-orange-500 rounded-full animate-spin" />
                </div>
              )}
              {availableUsers.map((user) => (
                <button
                  key={user.id}
                  data-testid={`login-user-${user.handle}`}
                  onClick={() => handleSelectUser(user.id)}
                  disabled={isLoading}
                  className="w-full bg-zinc-900/80 border border-zinc-800 rounded-2xl p-4 flex items-center gap-4 active:scale-[0.98] transition-all disabled:opacity-50 hover:border-orange-500/50"
                >
                  <div className="w-12 h-12 bg-gradient-to-br from-orange-500 to-amber-600 rounded-full flex items-center justify-center">
                    {user.avatar ? (
                      <img src={user.avatar} className="w-full h-full rounded-full object-cover" />
                    ) : (
                      <User className="w-6 h-6 text-white" />
                    )}
                  </div>
                  <div className="flex-1 text-left">
                    <span className="font-bold text-white block">{user.name}</span>
                    <span className="text-zinc-500 text-sm">@{user.handle}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-orange-500 font-bold text-sm">{user.trust_score}</span>
                    <span className="text-zinc-600 text-xs block">Trust</span>
                  </div>
                </button>
              ))}
        </div>

            {/* Create New User Button */}
            <button
              onClick={() => setShowCreate(true)}
              className="w-full bg-zinc-900 border border-dashed border-zinc-700 rounded-2xl p-4 flex items-center justify-center gap-3 text-zinc-400 hover:border-orange-500/50 hover:text-orange-500 transition-all"
            >
              <Plus size={20} />
              <span className="font-medium">Create New User</span>
            </button>
          </div>
        )}

        {/* Dev Mode Badge */}
        <div className="mt-6 flex justify-center">
          <div className="bg-amber-500/10 border border-amber-500/30 text-amber-500 text-xs font-bold px-3 py-1 rounded-full">
            DEV MODE
          </div>
        </div>
      </div>
    </div>
  );
};
