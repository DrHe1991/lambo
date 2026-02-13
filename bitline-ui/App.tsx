
import React, { useState, useEffect } from 'react';
import { Tab, Post, User, ChatSession, apiPostToPost, apiUserToUser, apiSessionToSession } from './types';
import { MOCK_POSTS, MOCK_CHATS, MOCK_ME, MOCK_USERS } from './constants';
import { useUserStore, usePostStore, useChatStore } from './stores';
import { api } from './api/client';
import { Search, Bell, Plus, Home, Users, MessageCircle, User as UserIcon, X, SlidersHorizontal, ArrowLeft, Send, Trash2, ShieldCheck, Zap, MoreHorizontal, Heart, Rocket, Gift, Copy, Share2, UserPlus, ScanLine } from 'lucide-react';
import { PostCard } from './components/PostCard';
import { TrustBadge } from './components/TrustBadge';
import { LoginPage } from './components/LoginPage';
import { DailyRewardModal } from './components/DailyRewardModal';
import { ChallengeModal } from './components/ChallengeModal';
import { LikeStakeModal } from './components/LikeStakeModal';
import { getTrustRingClass } from './trustTheme';

// Views
type View = 'MAIN' | 'POST_DETAIL' | 'QA_DETAIL' | 'SEARCH' | 'USER_PROFILE' | 'CHAT_DETAIL' | 'TRANSACTIONS' | 'INVITE' | 'SETTINGS' | 'FOLLOWERS_LIST' | 'FOLLOWING_LIST' | 'ADD_FRIENDS' | 'GROUP_CHAT' | 'SCAN' | 'ADD_FRIENDS' | 'GROUP_CHAT' | 'SCAN' | 'FOLLOWERS_LIST' | 'FOLLOWING_LIST';

const App: React.FC = () => {
  // Stores
  const {
    currentUser,
    isLoggedIn,
    isLoading: isLoggingIn,
    availableBalance,
    lockedBalance,
    loginStreak,
    loadFromStorage,
    logout,
  } = useUserStore();

  const {
    posts: apiPosts,
    feedPosts: apiFeedPosts,
    fetchPosts,
    fetchFeed,
    createPost: createApiPost,
    likePost: likeApiPost,
  } = usePostStore();

  const {
    sessions: apiSessions,
    messages: apiMessages,
    fetchSessions,
    fetchMessages,
    sendMessage: sendApiMessage,
    createSession: createApiSession,
  } = useChatStore();

  // Convert API data to UI format
  const posts: Post[] = apiPosts.length > 0 ? apiPosts.map(apiPostToPost) : MOCK_POSTS;
  const feedPostsConverted: Post[] = apiFeedPosts.length > 0 ? apiFeedPosts.map(apiPostToPost) : MOCK_POSTS.filter(p => p.author.isFollowing);
  const chatSessions: ChatSession[] = apiSessions.length > 0 ? apiSessions.map(apiSessionToSession) : MOCK_CHATS;
  const currentMe: User = currentUser ? apiUserToUser(currentUser) : MOCK_ME;

  // Local UI state
  const [showDailyReward, setShowDailyReward] = useState(false);
  const [dailyRewardAmount, setDailyRewardAmount] = useState(0);

  const [activeTab, setActiveTab] = useState<Tab>('Feed');
  const [currentView, setCurrentView] = useState<View>('MAIN');
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [selectedChat, setSelectedChat] = useState<ChatSession | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishType, setPublishType] = useState<'Note' | 'Question' | null>(null);
  const [challengePost, setChallengePost] = useState<Post | null>(null);
  const [showChallengeModal, setShowChallengeModal] = useState(false);
  const [showLikeModal, setShowLikeModal] = useState(false);
  const [likeTargetPost, setLikeTargetPost] = useState<Post | null>(null);
  const [likedPosts, setLikedPosts] = useState<Set<string>>(new Set());
  const [showChatActions, setShowChatActions] = useState(false);
  const [friendSearch, setFriendSearch] = useState('');
  const [addedFriendIds, setAddedFriendIds] = useState<Set<string>>(new Set());
  const [groupChatName, setGroupChatName] = useState('');
  const [groupMemberIds, setGroupMemberIds] = useState<Set<string>>(new Set());
  const [commentDraft, setCommentDraft] = useState('');
  const [replyTarget, setReplyTarget] = useState<{ id: string; handle: string } | null>(null);

  // Chat detail state
  const [chatMessages, setChatMessages] = useState<Array<{id: string | number; senderId: string | number; content: string}>>([]);
  const [chatMessageInput, setChatMessageInput] = useState('');
  const [isLoadingChatMessages, setIsLoadingChatMessages] = useState(false);

  const LIKE_STAKE = 10; // sat required to like

  // Handle challenge action
  const handleChallenge = (post: Post) => {
    setChallengePost(post);
    setShowChallengeModal(true);
  };

  const handleChallengeComplete = (result: 'violation' | 'no_violation', reward: number) => {
    // In Phase 1, balance updates will come from the API via ledger service
    console.log('Challenge complete:', result, reward);
  };

  // Handle like action
  const handleLikeRequest = (post: Post) => {
    if (likedPosts.has(String(post.id)) || post.isLiked) {
      return;
    }
    setLikeTargetPost(post);
    setShowLikeModal(true);
  };

  const handleLikeConfirm = async () => {
    if (likeTargetPost && currentUser) {
      setLikedPosts(prev => new Set([...prev, String(likeTargetPost.id)]));
      // Call API
      try {
        await likeApiPost(Number(likeTargetPost.id), currentUser.id);
      } catch (error) {
        console.error('Failed to like post:', error);
      }
    }
  };

  // Handle Google Sign-In (placeholder for Phase 2)
  const handleLogin = async () => {
    // In Phase 2, this will trigger actual Google OAuth
    // For now, users must use the "Create Account" button
    console.log('Google login will be implemented in Phase 2');
  };

  // Load user from storage on mount
  useEffect(() => {
    loadFromStorage();
  }, []);

  // Fetch posts and chats when logged in
  useEffect(() => {
    if (isLoggedIn && currentUser) {
      fetchPosts();
      fetchFeed(currentUser.id);
      fetchSessions(currentUser.id);
    }
  }, [isLoggedIn, currentUser?.id]);

  // Load chat messages when selectedChat changes
  useEffect(() => {
    const loadMessages = async () => {
      if (!selectedChat || selectedChat.id === 'new' || !currentUser) {
        setChatMessages([]);
        return;
      }
      setIsLoadingChatMessages(true);
      try {
        const msgs = await api.getMessages(Number(selectedChat.id), currentUser.id);
        setChatMessages(msgs.map(m => ({ id: m.id, senderId: m.sender_id, content: m.content })));
      } catch (error) {
        console.error('Failed to load messages:', error);
        setChatMessages([]);
      } finally {
        setIsLoadingChatMessages(false);
      }
    };
    loadMessages();
  }, [selectedChat?.id, currentUser?.id]);

  // Show login page if not logged in
  if (!isLoggedIn) {
    return <LoginPage onLogin={handleLogin} isLoading={isLoggingIn} />;
  }

  // Layout Helpers
  const renderHeader = () => {
    if (currentView !== 'MAIN') return null;
    return (
      <header className="sticky top-0 z-40 bg-black/80 backdrop-blur-md border-b border-zinc-800 px-4 py-3 flex items-center justify-between">
        <h1 className="text-xl font-black italic tracking-tighter text-orange-500">BITLINE</h1>
        <div className="flex items-center gap-4">
          <Search 
            className="text-zinc-400" 
            size={22} 
            onClick={() => setCurrentView('SEARCH')} 
          />
          <Bell className="text-zinc-400" size={22} />
        </div>
      </header>
    );
  };

  const renderBottomNav = () => {
    if (currentView !== 'MAIN' || isPublishing) return null;
    return (
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-black/90 backdrop-blur-lg border-t border-zinc-800 safe-bottom-nav">
        <div className="max-w-md mx-auto px-4 pt-3 pb-2 grid grid-cols-5 items-end">
          <button onClick={() => setActiveTab('Feed')} className={`flex flex-col items-center justify-center gap-1 py-1 ${activeTab === 'Feed' ? 'text-orange-500' : 'text-zinc-500'}`}>
            <Home size={24} />
            <span className="text-[10px] font-bold">Feed</span>
          </button>
          <button onClick={() => setActiveTab('Following')} className={`flex flex-col items-center justify-center gap-1 py-1 ${activeTab === 'Following' ? 'text-orange-500' : 'text-zinc-500'}`}>
            <Users size={24} />
            <span className="text-[10px] font-bold">Following</span>
          </button>
          
          <div className="flex justify-center -mt-4">
            <button 
              onClick={() => setIsPublishing(true)}
              className="w-14 h-14 bg-orange-500 rounded-2xl flex items-center justify-center shadow-lg shadow-orange-500/30 active:scale-90 transition-transform"
            >
              <Plus size={28} color="white" strokeWidth={3} />
            </button>
          </div>

          <button onClick={() => setActiveTab('Chat')} className={`flex flex-col items-center justify-center gap-1 py-1 ${activeTab === 'Chat' ? 'text-orange-500' : 'text-zinc-500'}`}>
            <MessageCircle size={24} />
            <span className="text-[10px] font-bold">Chat</span>
          </button>
          <button onClick={() => setActiveTab('Profile')} className={`flex flex-col items-center justify-center gap-1 py-1 ${activeTab === 'Profile' ? 'text-orange-500' : 'text-zinc-500'}`}>
            <UserIcon size={24} />
            <span className="text-[10px] font-bold">Me</span>
          </button>
        </div>
      </nav>
    );
  };

  // Sub-Views
  const renderFeed = () => (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div className="p-4">
        <div className="bg-gradient-to-r from-orange-600 to-amber-600 rounded-2xl p-4 mb-6 flex items-center justify-between shadow-lg shadow-orange-500/10">
          <div>
            <h3 className="text-white font-black text-lg italic leading-tight uppercase tracking-tighter">Daily Highlights</h3>
            <p className="text-orange-100 text-[10px] font-medium opacity-80">Top 10 consensus discussions today</p>
          </div>
          <Zap className="text-white fill-white" size={24} />
        </div>

        {posts.map(post => (
          <PostCard 
            key={post.id} 
            post={post} 
            onClick={(p) => {
              setSelectedPost(p);
              setCurrentView(p.type === 'Question' ? 'QA_DETAIL' : 'POST_DETAIL');
            }}
            onUserClick={(id) => {
              const user = posts.find(p => p.author.id === id)?.author || currentMe;
              setSelectedUser(user);
              setCurrentView('USER_PROFILE');
            }}
            onChallenge={handleChallenge}
            onLike={handleLikeRequest}
            isLiked={likedPosts.has(String(post.id)) || post.isLiked}
          />
        ))}
      </div>
    </div>
  );

  const renderFollowing = () => (
    <div className="p-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
      <h2 className="text-xl font-bold mb-4 px-2">Timeline</h2>
      {feedPostsConverted.map(post => (
        <PostCard 
          key={post.id} 
          post={post} 
          onClick={(p) => {
            setSelectedPost(p);
            setCurrentView(p.type === 'Question' ? 'QA_DETAIL' : 'POST_DETAIL');
          }}
          onUserClick={(id) => {
            const user = feedPostsConverted.find(p => p.author.id === id)?.author || currentMe;
            setSelectedUser(user);
            setCurrentView('USER_PROFILE');
          }}
        />
      ))}
    </div>
  );

  const renderChat = () => {
    const chatQuickActions = [
      { id: 'add-friends', label: 'Add Friends', icon: <UserPlus size={14} className="text-orange-400" />, view: 'ADD_FRIENDS' as View },
      { id: 'group-chat', label: 'Group Chat', icon: <Users size={14} className="text-orange-400" />, view: 'GROUP_CHAT' as View },
      { id: 'scan', label: 'Scan', icon: <ScanLine size={14} className="text-orange-400" />, view: 'SCAN' as View }
    ];

    return (
      <div className="p-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold tracking-wide uppercase text-zinc-100">Messages</h2>
          <div className="relative">
            <button
              className="p-2 bg-zinc-900 border border-zinc-800 rounded-full"
              onClick={() => setShowChatActions(prev => !prev)}
              aria-label="Open chat quick actions"
            >
              <Plus size={20} className="text-orange-500" />
            </button>
            {showChatActions && (
              <div className="absolute right-0 top-12 w-44 bg-zinc-950 border border-zinc-800 rounded-xl shadow-xl overflow-hidden z-20">
                {chatQuickActions.map(action => (
                  <button
                    key={action.id}
                    className="w-full px-3 py-2.5 text-left text-sm text-zinc-200 hover:bg-zinc-900 flex items-center gap-2"
                    onClick={() => {
                      setShowChatActions(false);
                      setCurrentView(action.view);
                    }}
                  >
                    {action.icon}
                    <span>{action.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        {chatSessions.map(chat => (
          <div
            key={chat.id}
            className="flex items-center gap-4 mb-6 active:opacity-70"
            onClick={() => {
              setShowChatActions(false);
              setSelectedChat(chat);
              setCurrentView('CHAT_DETAIL');
            }}
          >
            <div className="relative">
              <img src={chat.participants[0]?.avatar || `https://picsum.photos/id/${Number(chat.id) + 10}/200/200`} className="w-14 h-14 rounded-full border border-zinc-800 object-cover" />
              {chat.isGroup && chat.participants[1] && (
                 <img src={chat.participants[1].avatar || `https://picsum.photos/id/${Number(chat.id) + 11}/200/200`} className="w-8 h-8 rounded-full border-2 border-black absolute -bottom-1 -right-1 object-cover" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-0.5">
                <span className="font-bold text-zinc-100">{chat.isGroup ? (chat.name || 'Group Chat') : chat.participants[0]?.name}</span>
                <span className="text-[10px] text-zinc-500">{chat.timestamp}</span>
              </div>
              <p className="text-sm text-zinc-500 truncate">{chat.lastMessage}</p>
            </div>
            {chat.unreadCount > 0 && (
              <div className="w-5 h-5 bg-orange-500 rounded-full flex items-center justify-center">
                <span className="text-[10px] font-black text-white">{chat.unreadCount}</span>
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };

  const renderUserListPage = (title: 'Followers' | 'Following', users: User[]) => (
    <div className="fixed inset-0 z-[60] bg-black overflow-y-auto animate-in slide-in-from-right duration-300">
      <div className="p-4 sticky top-0 bg-black/85 backdrop-blur-md border-b border-zinc-900 flex items-center gap-4">
        <button onClick={() => setCurrentView('MAIN')}><ArrowLeft /></button>
        <h2 className="text-lg font-bold uppercase tracking-wide">{title}</h2>
      </div>
      <div className="p-4">
        <div className="space-y-3">
          {users.map(user => (
            <button
              key={user.id}
              className="w-full bg-zinc-900/50 border border-zinc-800 rounded-2xl p-3 flex items-center justify-between"
              onClick={() => {
                setSelectedUser(user);
                setCurrentView('USER_PROFILE');
              }}
            >
              <div className="flex items-center gap-3">
                <img src={user.avatar} className="w-11 h-11 rounded-full border border-zinc-800 object-cover" />
                <div className="text-left">
                  <span className="text-sm font-bold text-zinc-100 block">{user.name}</span>
                  <span className="text-[11px] text-zinc-500">{user.handle}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <TrustBadge score={user.trustScore} />
                <ArrowLeft className="rotate-180 text-zinc-700" size={14} />
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  const renderAddFriends = () => {
    const candidates = MOCK_USERS.filter(u => u.id !== currentMe.id);
    const filteredFriends = candidates.filter(u => {
      const query = friendSearch.trim().toLowerCase();
      if (!query) return true;
      return u.name.toLowerCase().includes(query) || u.handle.toLowerCase().includes(query);
    });

    const toggleAddFriend = (userId: string | number) => {
      const id = String(userId);
      setAddedFriendIds(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    };

    return (
      <div className="fixed inset-0 z-[60] bg-black overflow-y-auto animate-in slide-in-from-right duration-300">
        <div className="p-4 sticky top-0 bg-black/85 backdrop-blur-md border-b border-zinc-900 flex items-center gap-4">
          <button onClick={() => setCurrentView('MAIN')}><ArrowLeft /></button>
          <h2 className="text-lg font-bold uppercase tracking-wide">Add Friends</h2>
        </div>
        <div className="p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2 flex items-center gap-3 mb-4">
            <Search size={18} className="text-zinc-500" />
            <input
              value={friendSearch}
              onChange={(e) => setFriendSearch(e.target.value)}
              placeholder="Search name or handle..."
              className="bg-transparent border-none outline-none text-sm w-full text-zinc-100"
            />
          </div>

          <div className="space-y-3">
            {filteredFriends.map(user => {
              const isAdded = addedFriendIds.has(String(user.id));
              return (
                <div key={user.id} className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <img src={user.avatar} className="w-11 h-11 rounded-full border border-zinc-800 object-cover" />
                    <div>
                      <span className="text-sm font-bold text-zinc-100 block">{user.name}</span>
                      <span className="text-[11px] text-zinc-500">{user.handle}</span>
                    </div>
                  </div>
                  <button
                    className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wide border ${
                      isAdded
                        ? 'bg-zinc-800 text-zinc-300 border-zinc-700'
                        : 'bg-orange-500/15 text-orange-300 border-orange-500/40'
                    }`}
                    onClick={() => toggleAddFriend(user.id)}
                  >
                    {isAdded ? 'Added' : 'Add'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  const renderGroupChat = () => {
    const candidates = MOCK_USERS.filter(u => u.id !== currentMe.id);
    const toggleMember = (userId: string | number) => {
      const id = String(userId);
      setGroupMemberIds(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    };

    const canCreateGroup = groupChatName.trim().length > 0 && groupMemberIds.size >= 2;

    const handleCreateGroup = () => {
      if (!canCreateGroup) return;
      const selectedMembers = candidates.filter(user => groupMemberIds.has(user.id));
      setSelectedChat({
        id: `group-${Date.now()}`,
        participants: selectedMembers,
        lastMessage: 'Group created',
        timestamp: 'now',
        unreadCount: 0,
        isGroup: true
      });
      setGroupChatName('');
      setGroupMemberIds(new Set());
      setCurrentView('CHAT_DETAIL');
    };

    return (
      <div className="fixed inset-0 z-[60] bg-black overflow-y-auto animate-in slide-in-from-right duration-300">
        <div className="p-4 sticky top-0 bg-black/85 backdrop-blur-md border-b border-zinc-900 flex items-center gap-4">
          <button onClick={() => setCurrentView('MAIN')}><ArrowLeft /></button>
          <h2 className="text-lg font-bold uppercase tracking-wide">Group Chat</h2>
        </div>
        <div className="p-4">
          <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest block mb-2">Group Name</label>
          <input
            value={groupChatName}
            onChange={(e) => setGroupChatName(e.target.value)}
            placeholder="Enter group name"
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm mb-5"
          />

          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Select Members</span>
            <span className="text-xs text-orange-400 font-bold">{groupMemberIds.size} selected</span>
          </div>

          <div className="space-y-3 mb-6">
            {candidates.map(user => {
              const selected = groupMemberIds.has(String(user.id));
              return (
                <button
                  key={user.id}
                  className={`w-full rounded-2xl p-3 border flex items-center justify-between ${
                    selected ? 'bg-orange-500/10 border-orange-500/40' : 'bg-zinc-900/50 border-zinc-800'
                  }`}
                  onClick={() => toggleMember(user.id)}
                >
                  <div className="flex items-center gap-3">
                    <img src={user.avatar} className="w-11 h-11 rounded-full border border-zinc-800 object-cover" />
                    <div className="text-left">
                      <span className="text-sm font-bold text-zinc-100 block">{user.name}</span>
                      <span className="text-[11px] text-zinc-500">{user.handle}</span>
                    </div>
                  </div>
                  <div className={`w-5 h-5 rounded-full border-2 ${selected ? 'bg-orange-500 border-orange-500' : 'border-zinc-600'}`} />
                </button>
              );
            })}
          </div>

          <button
            className={`w-full py-3 rounded-xl text-sm font-black uppercase tracking-wide ${
              canCreateGroup ? 'bg-orange-500 text-white' : 'bg-zinc-800 text-zinc-500'
            }`}
            onClick={handleCreateGroup}
            disabled={!canCreateGroup}
          >
            Create Group
          </button>
        </div>
      </div>
    );
  };

  const renderScan = () => (
    <div className="fixed inset-0 z-[60] bg-black overflow-y-auto animate-in slide-in-from-right duration-300">
      <div className="p-4 sticky top-0 bg-black/85 backdrop-blur-md border-b border-zinc-900 flex items-center gap-4">
        <button onClick={() => setCurrentView('MAIN')}><ArrowLeft /></button>
        <h2 className="text-lg font-bold uppercase tracking-wide">Scan</h2>
      </div>
      <div className="p-4 flex flex-col items-center">
        <p className="text-sm text-zinc-400 mb-6 text-center">Scan friend QR code to add instantly</p>
        <div className="w-72 h-72 rounded-3xl border-2 border-dashed border-orange-500/60 bg-zinc-900/40 flex items-center justify-center mb-6 relative">
          <div className="absolute inset-4 border border-orange-500/30 rounded-2xl" />
          <ScanLine size={64} className="text-orange-500/80" />
        </div>
        <button className="w-full bg-orange-500 text-white font-black py-3 rounded-xl text-sm uppercase tracking-wide mb-3">
          Open Camera
        </button>
        <button className="w-full bg-zinc-900 border border-zinc-800 text-zinc-300 font-bold py-3 rounded-xl text-sm uppercase tracking-wide">
          My QR Code
        </button>
      </div>
    </div>
  );

  const renderProfile = () => {
    const followingCount = currentUser?.following_count || 0;
    const followerCount = currentUser?.followers_count || 0;

    const handleOpenMyProfile = () => {
      setSelectedUser({ ...currentMe, isFollowing: false });
      setCurrentView('USER_PROFILE');
    };

    return (
    <div className="p-4 pb-28 animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div className="flex flex-col items-center mb-8">
        <button className="relative w-28 h-28 mb-4" onClick={handleOpenMyProfile}>
           {/* TrustScore Visualization Ring (0-1000 scale) */}
           <svg className="absolute inset-0 w-full h-full transform -rotate-90">
             <circle cx="56" cy="56" r="50" stroke="currentColor" strokeWidth="6" fill="transparent" className="text-zinc-800" />
             <circle cx="56" cy="56" r="50" stroke="currentColor" strokeWidth="6" fill="transparent" strokeDasharray={314} strokeDashoffset={314 * (1 - currentMe.trustScore / 100)} className="text-orange-500" />
           </svg>
           <img src={currentMe.avatar || `https://picsum.photos/id/64/200/200`} className="absolute inset-2 w-24 h-24 rounded-full border border-zinc-800 object-cover" />
           <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 bg-orange-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full border-2 border-black">
             {currentMe.trustScore * 10}
           </div>
        </button>
        <h2 className="text-xl font-black italic tracking-tighter">{currentMe.name}</h2>
        <span className="text-zinc-500 text-xs font-medium">{currentMe.handle}</span>
        <span className="text-[10px] text-zinc-600 mt-1">Trust Score {currentMe.trustScore * 10}/1000</span>
        <div className="flex items-center gap-6 mt-4">
          <button
            className="text-center active:scale-[0.98]"
            onClick={() => setCurrentView('FOLLOWERS_LIST')}
          >
            <span className="text-base font-black text-zinc-100 block leading-none">{followerCount}</span>
            <span className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Followers</span>
          </button>
          <button
            className="text-center active:scale-[0.98]"
            onClick={() => setCurrentView('FOLLOWING_LIST')}
          >
            <span className="text-base font-black text-zinc-100 block leading-none">{followingCount}</span>
            <span className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Following</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-2xl">
          <span className="text-zinc-500 text-[10px] font-bold uppercase block mb-1">Available</span>
          <span className="text-lg font-black text-zinc-100">{availableBalance.toLocaleString()} <span className="text-orange-500 text-sm">sat</span></span>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-2xl">
          <span className="text-zinc-500 text-[10px] font-bold uppercase block mb-1">Staked</span>
          <span className="text-lg font-black text-orange-400">{lockedBalance.toLocaleString()} <span className="text-orange-300/50 text-sm">sat</span></span>
        </div>
      </div>

      {/* Daily login streak card */}
      <div className="bg-gradient-to-r from-orange-600/20 to-amber-600/20 border border-orange-500/30 rounded-2xl p-4 mb-6 flex items-center justify-between">
        <div>
          <span className="text-[10px] font-bold text-orange-400 uppercase block mb-1">Login Streak</span>
          <span className="text-xl font-black text-white">{loginStreak} {loginStreak === 1 ? 'day' : 'days'}</span>
        </div>
        <Gift className="text-orange-500" size={28} />
      </div>

      <div className="space-y-2">
        {[
          { icon: <Gift size={20} />, label: 'Invite Friends', sublabel: 'Earn 500 sat per referral', action: () => setCurrentView('INVITE') },
          { icon: <ShieldCheck size={20} />, label: 'Transactions', action: () => setCurrentView('TRANSACTIONS') },
          { icon: <SlidersHorizontal size={20} />, label: 'Settings', action: () => setCurrentView('SETTINGS') }
        ].map((item, idx) => (
          <button 
            key={idx} 
            onClick={item.action}
            className="w-full flex items-center justify-between p-4 bg-zinc-950/50 border border-zinc-900 rounded-2xl active:bg-zinc-900"
          >
            <div className="flex items-center gap-4">
              <span className="text-orange-500">{item.icon}</span>
              <div className="text-left">
                <span className="text-sm font-bold text-zinc-300 block">{item.label}</span>
                {item.sublabel && <span className="text-[10px] text-zinc-600">{item.sublabel}</span>}
              </div>
            </div>
            <ArrowLeft className="rotate-180 text-zinc-700" size={16} />
          </button>
        ))}
      </div>

      {/* Logout button */}
      <button 
        onClick={() => logout()}
        className="w-full mt-6 py-3 text-zinc-500 text-sm font-medium"
      >
        Sign Out
      </button>
    </div>
  );
  };

  const renderSearch = () => (
    <div className="fixed inset-0 z-[60] bg-black animate-in slide-in-from-right duration-300">
      <div className="p-4 border-b border-zinc-900 flex items-center gap-4">
        <button onClick={() => setCurrentView('MAIN')}><ArrowLeft /></button>
        <div className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2 flex items-center gap-3">
          <Search size={18} className="text-zinc-500" />
          <input 
            autoFocus
            placeholder="Search ideas, hunters, questions..." 
            className="bg-transparent border-none outline-none text-sm w-full text-zinc-100" 
          />
        </div>
      </div>
      <div className="p-4">
        <h3 className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-4">Trending Now</h3>
        <div className="flex flex-wrap gap-2 mb-8">
          {['#Bitcoin2025', '#AI_Moderation', '#SatStaking', '#Privacy', '#L2_Growth'].map(tag => (
            <span key={tag} className="px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-xs font-bold text-orange-400">
              {tag}
            </span>
          ))}
        </div>
        
        <div className="grid grid-cols-2 gap-3">
          {MOCK_POSTS.slice(0, 4).map((p, i) => (
            <div key={i} className="bg-zinc-950 border border-zinc-900 rounded-xl p-3 h-40 overflow-hidden relative">
              <div className="flex items-center gap-2 mb-2">
                <img src={p.author.avatar} className="w-5 h-5 rounded-full" />
                <span className="text-[10px] font-bold text-zinc-500">{p.author.handle}</span>
              </div>
              <p className="text-[11px] text-zinc-300 leading-tight">{p.content}</p>
              <div className="absolute bottom-2 right-2 bg-black/50 backdrop-blur-sm px-1.5 py-0.5 rounded flex items-center gap-1">
                 <Heart size={10} className="text-orange-500" />
                 <span className="text-[10px] font-bold">{p.likes}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const renderPostDetail = () => {
    if (!selectedPost) return null;
    const discussionPreviewCount = Math.min(3, Math.max(selectedPost.comments, 1));
    const discussionItems = Array.from({ length: discussionPreviewCount }, (_, idx) => ({
      id: `${selectedPost.id}-c-${idx + 1}`,
      userId: `commenter-${idx + 1}`,
      name: `Contributor ${idx + 1}`,
      handle: `@contrib_${idx + 1}`,
      trustScore: Math.max(35, 85 - idx * 12),
      avatarId: idx + 11,
      text:
        idx === 0
          ? 'Great point on the staking mechanics. A 24h window feels balanced for both creators and reviewers.'
          : idx === 1
            ? 'I agree with the direction. Maybe we should expose a clearer unlock timer in the UI.'
            : 'Also worth adding clearer challenge outcomes so new users can learn from resolved cases.',
      likes: 12 - idx * 3
    }));

    const handleCommentReply = (itemId: string, handle: string) => {
      setReplyTarget(prev => (prev?.id === itemId ? null : { id: itemId, handle }));
      if (!commentDraft.trim()) {
        setCommentDraft(`${handle} `);
      }
    };

    const handleCommentChallenge = (item: typeof discussionItems[number]) => {
      const commentPost: Post = {
        id: `challenge-${item.id}`,
        author: {
          id: item.userId,
          name: item.name,
          handle: item.handle,
          avatar: `https://picsum.photos/id/${item.avatarId}/200/200`,
          trustScore: item.trustScore,
          isFollowing: false
        },
        content: `[Comment] ${item.text}`,
        stakedSats: 100,
        likes: item.likes,
        comments: 0,
        timestamp: 'now',
        type: 'Note'
      };
      handleChallenge(commentPost);
    };

    const handleSubmitComment = () => {
      if (!commentDraft.trim()) return;
      setCommentDraft('');
      setReplyTarget(null);
    };

    return (
      <div className="fixed inset-0 z-[60] bg-black overflow-y-auto animate-in slide-in-from-right duration-300">
        <div className="p-4 sticky top-0 bg-black/80 backdrop-blur-md border-b border-zinc-900 flex items-center justify-between">
          <button onClick={() => setCurrentView('MAIN')}><ArrowLeft /></button>
          <span className="font-black italic tracking-tighter uppercase">Thread</span>
          <button><MoreHorizontal /></button>
        </div>
        <div className="p-4">
          <PostCard post={selectedPost} />
          
          <div className="mt-8 border-t border-zinc-900 pt-6">
            <h3 className="text-sm font-black mb-4 uppercase tracking-wider text-zinc-500">
              Discussion · Top {discussionItems.length} of {selectedPost.comments}
            </h3>
            {discussionItems.map((item, idx) => (
              <div key={item.id} className="flex gap-4 mb-6">
                <div className={`w-8 h-8 rounded-full p-[2px] ${getTrustRingClass(item.trustScore)} shrink-0`}>
                  <img src={`https://picsum.photos/id/${item.avatarId}/50/50`} className="w-full h-full rounded-full object-cover border border-zinc-900" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-bold">{item.name}</span>
                    <span className="text-[10px] text-zinc-500 font-medium">{item.handle}</span>
                  </div>
                  <p className="text-sm text-zinc-400">{item.text}</p>
                  <div className="flex items-center gap-4 mt-2">
                    <button className="flex items-center gap-1 text-[10px] font-bold text-zinc-500"><Heart size={12} /> {item.likes}</button>
                    <button
                      className="text-[10px] font-bold text-zinc-500 hover:text-zinc-300"
                      onClick={() => handleCommentReply(item.id, item.handle)}
                    >
                      Reply
                    </button>
                    <button
                      className="text-[10px] font-bold text-zinc-500 hover:text-red-400 uppercase tracking-wide"
                      onClick={() => handleCommentChallenge(item)}
                    >
                      Challenge
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-zinc-950 border-t border-zinc-900 flex items-center gap-4">
          <div className="flex-1">
            {replyTarget && (
              <div className="flex items-center justify-between mb-2 px-1">
                <span className="text-[10px] font-bold text-orange-400 uppercase tracking-wide">Replying to {replyTarget.handle}</span>
                <button className="text-[10px] text-zinc-500" onClick={() => setReplyTarget(null)}>Cancel</button>
              </div>
            )}
            <input
              value={commentDraft}
              onChange={(e) => setCommentDraft(e.target.value)}
              placeholder={replyTarget ? `Reply to ${replyTarget.handle}...` : 'Add your insight...'}
              className="w-full bg-zinc-900 rounded-xl px-4 py-3 text-sm"
            />
          </div>
          <button className="bg-orange-500 p-3 rounded-xl" onClick={handleSubmitComment}><Send size={18} /></button>
        </div>
      </div>
    );
  };

  const renderQADetail = () => {
    if (!selectedPost) return null;
    const answerItems = [
      {
        id: 'a1',
        name: 'ProtocolEngineer',
        trustScore: 94,
        bio: 'Expert in Bitcoin Script',
        content: 'Scaling L2 settlements requires a combination of BitVM for trustless verification and a robust gossip protocol...'
      },
      {
        id: 'a2',
        name: 'RollupBuilder',
        trustScore: 78,
        bio: 'L2 infra contributor',
        content: 'I would prioritize deterministic batching first, then optimize proving costs. This keeps operational risk lower in early stages.'
      }
    ];

    return (
      <div className="fixed inset-0 z-[60] bg-black overflow-y-auto animate-in slide-in-from-right duration-300">
        <div className="p-4 sticky top-0 bg-black/80 backdrop-blur-md border-b border-zinc-900 flex items-center gap-4">
          <button onClick={() => setCurrentView('MAIN')}><ArrowLeft /></button>
          <span className="font-black italic tracking-tighter uppercase">Inquiry</span>
        </div>
        <div className="p-4 bg-orange-500/5 border-b border-orange-500/10 mb-4">
           <div className="bg-orange-500 text-white text-[10px] font-black px-2 py-1 rounded inline-block mb-3 uppercase tracking-widest">Question</div>
           <h2 className="text-xl font-bold mb-4">{selectedPost.content}</h2>
           <div className="flex items-center justify-between">
             <div className="flex items-center gap-2">
               <img src={selectedPost.author.avatar} className="w-6 h-6 rounded-full" />
               <span className="text-xs font-bold">{selectedPost.author.handle}</span>
             </div>
             <div className="text-orange-500 font-black text-sm uppercase">💰 {selectedPost.bounty?.toLocaleString()} sats bounty</div>
           </div>
        </div>
        <div className="p-4">
          <h3 className="text-xs font-black uppercase text-zinc-500 mb-4 tracking-widest">{answerItems.length} Answers</h3>
          {answerItems.map((item, idx) => (
            <div key={item.id} className="bg-zinc-900/50 border border-zinc-900 rounded-2xl p-4 mb-4">
               <div className="flex items-center gap-2 mb-3">
                  <div className={`w-8 h-8 rounded-full p-[2px] ${getTrustRingClass(item.trustScore)} shrink-0`}>
                    <img src={`https://picsum.photos/id/${22 + idx}/50/50`} className="w-full h-full rounded-full object-cover border border-zinc-900" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold">{item.name}</span>
                    </div>
                    <span className="text-[10px] text-zinc-500 italic">{item.bio}</span>
                  </div>
               </div>
               <p className="text-sm text-zinc-200 leading-relaxed mb-4">
                 {item.content}
               </p>
               <div className="flex items-center justify-between">
                 <button className="text-orange-400 font-bold text-[10px] uppercase tracking-tighter border border-orange-400/20 px-3 py-1 rounded-full">Stake to Vote</button>
                 <button className="text-zinc-500"><MoreHorizontal size={18} /></button>
               </div>
            </div>
          ))}
          <button className="w-full bg-orange-600 text-white font-black py-4 rounded-2xl text-sm uppercase tracking-tighter mt-4 shadow-lg shadow-orange-900/20 active:scale-95 transition-transform">
            Submit Your Answer (Stake 500 sat)
          </button>
        </div>
      </div>
    );
  };

  // Mock transaction history
  const mockTransactions = [
    { id: '1', type: 'reward', amount: 100, description: 'Daily login reward', time: 'Today 09:30' },
    { id: '2', type: 'stake', amount: -50, description: 'Post stake', time: 'Today 10:15', status: 'locked', unlockTime: '23:15:00' },
    { id: '3', type: 'refund', amount: 50, description: 'Stake refunded', time: 'Yesterday 14:30' },
    { id: '4', type: 'penalty', amount: -200, description: 'Report rejected penalty', time: 'Yesterday 11:00' },
    { id: '5', type: 'reward', amount: 500, description: 'Referral reward', time: '3 days ago' },
    { id: '6', type: 'stake', amount: -30, description: 'Like stake', time: '3 days ago', status: 'refunded' },
  ];

  const renderTransactions = () => (
    <div className="fixed inset-0 z-[60] bg-black overflow-y-auto animate-in slide-in-from-right duration-300">
      <div className="p-4 sticky top-0 bg-black/80 backdrop-blur-md border-b border-zinc-900 flex items-center gap-4">
        <button onClick={() => setCurrentView('MAIN')}><ArrowLeft /></button>
        <h2 className="text-xl font-black italic tracking-tighter uppercase">Transactions</h2>
      </div>
      
      <div className="p-4">
        {/* Balance summary */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-2xl">
            <span className="text-zinc-500 text-[10px] font-bold uppercase block mb-1">Available</span>
            <span className="text-xl font-black text-green-500">+{availableBalance.toLocaleString()}</span>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-2xl">
            <span className="text-zinc-500 text-[10px] font-bold uppercase block mb-1">Staked</span>
            <span className="text-xl font-black text-orange-400">{lockedBalance.toLocaleString()}</span>
          </div>
        </div>

        {/* Transaction list */}
        <div className="space-y-3">
          {mockTransactions.map(tx => (
            <div key={tx.id} className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-bold text-zinc-200">{tx.description}</span>
                <span className={`text-sm font-black ${tx.amount > 0 ? 'text-green-500' : 'text-red-400'}`}>
                  {tx.amount > 0 ? '+' : ''}{tx.amount} sat
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-zinc-600">{tx.time}</span>
                {tx.status === 'locked' && (
                  <span className="text-[10px] text-orange-400 font-bold">
                    🔒 Unlocks in {tx.unlockTime}
                  </span>
                )}
                {tx.status === 'refunded' && (
                  <span className="text-[10px] text-green-500 font-bold">✓ Refunded</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const renderInvite = () => {
    const inviteCode = 'BITLINE-' + Math.random().toString(36).substring(2, 8).toUpperCase();
    const inviteLink = `https://bitline.app/invite/${inviteCode}`;
    
    return (
      <div className="fixed inset-0 z-[60] bg-black overflow-y-auto animate-in slide-in-from-right duration-300">
        <div className="p-4 sticky top-0 bg-black/80 backdrop-blur-md border-b border-zinc-900 flex items-center gap-4">
          <button onClick={() => setCurrentView('MAIN')}><ArrowLeft /></button>
          <h2 className="text-xl font-black italic tracking-tighter uppercase">Invite Friends</h2>
        </div>
        
        <div className="p-4">
          {/* Reward info */}
          <div className="bg-gradient-to-br from-orange-600/20 to-amber-600/20 border border-orange-500/30 rounded-3xl p-6 mb-6 text-center">
            <Gift className="w-12 h-12 text-orange-500 mx-auto mb-4" />
            <h3 className="text-2xl font-black text-white mb-2">Referral Reward</h3>
            <p className="text-zinc-400 text-sm mb-4">For each friend who signs up</p>
            <div className="bg-black/50 rounded-2xl p-4">
              <span className="text-3xl font-black text-orange-500">+500</span>
              <span className="text-lg font-bold text-orange-400 ml-2">sat</span>
            </div>
          </div>

          {/* Invite code */}
          <div className="mb-6">
            <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest block mb-3">Your Invite Code</label>
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex items-center justify-between">
              <span className="text-lg font-black text-white tracking-wider">{inviteCode}</span>
              <button 
                onClick={() => navigator.clipboard?.writeText(inviteCode)}
                className="p-2 bg-zinc-800 rounded-xl active:scale-95"
              >
                <Copy size={18} className="text-orange-500" />
              </button>
            </div>
          </div>

          {/* Invite link */}
          <div className="mb-8">
            <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest block mb-3">Invite Link</label>
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
              <p className="text-sm text-zinc-400 truncate mb-3">{inviteLink}</p>
              <button 
                onClick={() => navigator.clipboard?.writeText(inviteLink)}
                className="w-full bg-orange-500 text-white font-black py-3 rounded-xl text-sm uppercase tracking-tighter active:scale-95 flex items-center justify-center gap-2"
              >
                <Share2 size={18} />
                Copy Link
              </button>
            </div>
          </div>

          {/* Stats */}
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-4">
            <h4 className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-4">Referral Stats</h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-2xl font-black text-white">3</span>
                <span className="text-zinc-500 text-xs block">Invited</span>
              </div>
              <div>
                <span className="text-2xl font-black text-orange-500">1,500</span>
                <span className="text-zinc-500 text-xs block">Earned</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderPublishOverlay = () => {
    if (!isPublishing) return null;
    return (
      <div className="fixed inset-0 z-[100] bg-black/95 animate-in slide-in-from-bottom duration-300 p-4 pt-12">
        <button 
          onClick={() => { setIsPublishing(false); setPublishType(null); }} 
          className="absolute top-4 right-4 p-2 bg-zinc-900 rounded-full"
        >
          <X size={24} />
        </button>

        {!publishType ? (
          <div className="h-full flex flex-col justify-center gap-6">
            <h2 className="text-3xl font-black italic tracking-tighter text-center mb-8 uppercase">Broadcast Type</h2>
            <button 
              onClick={() => setPublishType('Note')}
              className="bg-zinc-900 border border-zinc-800 p-8 rounded-3xl flex flex-col items-center gap-4 active:scale-95 transition-transform"
            >
              <Zap className="text-orange-500" size={48} />
              <div className="text-center">
                <span className="text-xl font-black block uppercase tracking-tighter italic">Short Note</span>
                <span className="text-xs text-zinc-500 font-medium">Fast thoughts, news, updates.</span>
              </div>
            </button>
            <button 
              onClick={() => setPublishType('Question')}
              className="bg-zinc-900 border border-zinc-800 p-8 rounded-3xl flex flex-col items-center gap-4 active:scale-95 transition-transform"
            >
              <MessageCircle className="text-blue-400" size={48} />
              <div className="text-center">
                <span className="text-xl font-black block uppercase tracking-tighter italic">Inquiry</span>
                <span className="text-xs text-zinc-500 font-medium">Ask for help, set a bounty.</span>
              </div>
            </button>
          </div>
        ) : (
          <div className="h-full flex flex-col">
            <h2 className="text-xl font-black italic tracking-tighter mb-6 uppercase">New {publishType}</h2>
            <textarea 
              autoFocus
              className="flex-1 bg-transparent border-none outline-none text-lg leading-relaxed placeholder:text-zinc-700 resize-none"
              placeholder={publishType === 'Note' ? "What's the signal?" : "What do you need to know?"}
            />
            
            {publishType === 'Question' && (
              <div className="mb-6 flex items-center justify-between p-4 bg-orange-500/10 border border-orange-500/20 rounded-2xl">
                <span className="text-sm font-bold text-orange-400">Set Bounty Amount</span>
                <div className="flex items-center gap-2">
                  <span className="text-xl font-black">10,000</span>
                  <span className="text-[10px] font-black uppercase text-orange-400">sats</span>
                </div>
              </div>
            )}

            <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-2xl mb-4 flex items-center justify-between">
               <div className="flex items-center gap-2">
                 <ShieldCheck className="text-zinc-500" size={16} />
                 <span className="text-xs font-bold text-zinc-400">Stake to publish</span>
               </div>
               <span className="text-sm font-black text-orange-500">500 sat</span>
            </div>
            
            <p className="text-[10px] text-zinc-600 font-bold text-center mb-6 uppercase italic tracking-widest">Returns in 24h if no violations found</p>

            <button className="w-full bg-white text-black font-black py-4 rounded-2xl text-sm uppercase tracking-tighter mb-10">
              Broadcast Now
            </button>
          </div>
        )}
      </div>
    );
  };

  const renderChatDetail = () => {
    if (!selectedChat) return null;
    const chatPartner = selectedChat.participants.find(p => p.id !== currentMe.id) || selectedChat.participants[0];
    const isGroup = Boolean(selectedChat.isGroup);

    const handleSendMessage = async () => {
      if (!chatMessageInput.trim() || !currentUser) return;

      const content = chatMessageInput.trim();
      setChatMessageInput('');

      try {
        // If this is a new session, create it first
        let sessionId = selectedChat.id;
        if (sessionId === 'new') {
          const otherUserId = chatPartner.id;
          const newSession = await api.createChatSession(currentUser.id, {
            member_ids: [Number(otherUserId)],
          });
          sessionId = newSession.id;
          setSelectedChat({
            ...selectedChat,
            id: newSession.id,
          });
        }

        // Send the message
        const msg = await api.sendMessage(Number(sessionId), currentUser.id, content);
        setChatMessages(prev => [...prev, { id: msg.id, senderId: msg.sender_id, content: msg.content }]);
      } catch (error) {
        console.error('Failed to send message:', error);
      }
    };

    const handleOpenProfile = () => {
      if (!isGroup) {
        setSelectedUser(chatPartner);
        setCurrentView('USER_PROFILE');
      }
    };

    return (
      <div className="fixed inset-0 z-[60] bg-black flex flex-col animate-in slide-in-from-right duration-300">
        {/* Header */}
        <div className="p-4 bg-black/80 backdrop-blur-md border-b border-zinc-900 flex items-center gap-4">
          <button onClick={() => setCurrentView('MAIN')}><ArrowLeft /></button>
          <button
            className="flex items-center gap-3"
            onClick={handleOpenProfile}
            disabled={isGroup}
          >
            {isGroup ? (
              <div className="relative w-10 h-10">
                <img src={selectedChat.participants[0]?.avatar || `https://picsum.photos/id/10/200/200`} className="w-7 h-7 rounded-full border border-zinc-800 absolute top-0 left-0" />
                <img src={selectedChat.participants[1]?.avatar || `https://picsum.photos/id/11/200/200`} className="w-7 h-7 rounded-full border border-zinc-800 absolute bottom-0 right-0" />
              </div>
            ) : (
              <img src={chatPartner?.avatar || `https://picsum.photos/id/${Number(chatPartner?.id) + 10}/200/200`} className="w-10 h-10 rounded-full border border-zinc-800 object-cover" />
            )}
            <div className="text-left">
              <span className="text-sm font-bold block leading-none">{isGroup ? (selectedChat.name || 'Group Chat') : chatPartner?.name}</span>
              <span className="text-[10px] text-green-500 font-bold uppercase tracking-widest">Active now</span>
            </div>
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {isLoadingChatMessages && (
            <div className="flex justify-center py-4">
              <div className="w-6 h-6 border-2 border-orange-500/30 border-t-orange-500 rounded-full animate-spin" />
            </div>
          )}
          {chatMessages.length === 0 && !isLoadingChatMessages && (
            <div className="text-center text-zinc-600 py-8">
              No messages yet. Say hi! 👋
            </div>
          )}
          {chatMessages.map(msg => {
            const isMe = msg.senderId === currentUser?.id || msg.senderId === currentMe.id;
            return (
              <div key={msg.id} className={`flex items-end gap-2 ${isMe ? 'justify-end' : 'justify-start'}`}>
                {!isMe && (
                  <button onClick={handleOpenProfile} className="flex-shrink-0">
                    <img src={chatPartner?.avatar || `https://picsum.photos/id/${Number(chatPartner?.id) + 10}/200/200`} className="w-7 h-7 rounded-full border border-zinc-800 object-cover" />
                  </button>
                )}
                <div className={`max-w-[70%] px-4 py-2.5 text-sm break-words ${
                  isMe
                    ? 'bg-orange-600 text-white rounded-2xl rounded-br-sm'
                    : 'bg-zinc-900 text-zinc-200 rounded-2xl rounded-bl-sm'
                }`}>
                  {msg.content}
                </div>
              </div>
            );
          })}
        </div>

        {/* Input */}
        <div className="p-4 bg-black border-t border-zinc-900 flex items-center gap-4 safe-bottom-nav">
          <div className="flex-1 bg-zinc-900 rounded-xl px-4 py-3 flex items-center gap-3">
            <input 
              value={chatMessageInput}
              onChange={(e) => setChatMessageInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
              placeholder="Message..." 
              className="bg-transparent border-none outline-none text-sm w-full" 
            />
          </div>
          <button 
            onClick={handleSendMessage}
            className="bg-orange-500 p-3 rounded-xl text-white active:scale-90 transition-transform"
          >
            <Send size={18} />
          </button>
        </div>
      </div>
    );
  };

  const renderUserProfile = () => {
    if (!selectedUser) return null;
    return (
      <div className="fixed inset-0 z-[60] bg-black overflow-y-auto animate-in slide-in-from-right duration-300">
        <div className="p-4 sticky top-0 bg-black/80 backdrop-blur-md z-10 flex items-center justify-between">
           <button onClick={() => setCurrentView('MAIN')}><ArrowLeft /></button>
           <button><MoreHorizontal /></button>
        </div>
        <div className="flex flex-col items-center p-6 border-b border-zinc-900">
          <img src={selectedUser.avatar} className="w-24 h-24 rounded-full border-2 border-orange-500 p-1 object-cover mb-4" />
          <h2 className="text-2xl font-black italic tracking-tighter uppercase mb-1">{selectedUser.name}</h2>
          <span className="text-zinc-500 text-xs font-medium mb-4">{selectedUser.handle}</span>
          <TrustBadge score={selectedUser.trustScore} size="lg" />
          
          <div className="flex gap-4 mt-8 w-full">
            <button className="flex-1 bg-white text-black font-black py-3 rounded-xl text-sm uppercase italic tracking-tighter">Follow</button>
            <button 
              className="flex-1 bg-zinc-900 text-white font-black py-3 rounded-xl text-sm uppercase italic tracking-tighter border border-zinc-800"
              onClick={() => {
                setSelectedChat({ id: 'new', participants: [selectedUser], lastMessage: '', timestamp: 'now', unreadCount: 0 });
                setCurrentView('CHAT_DETAIL');
              }}
            >
              Chat
            </button>
          </div>
        </div>
        
        <div className="p-4">
          <h3 className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-4">Activity</h3>
          {MOCK_POSTS.filter(p => p.author.id === selectedUser.id).map(p => (
            <PostCard key={p.id} post={p} />
          ))}
        </div>
      </div>
    );
  };

  const renderFollowersList = () => {
    const followerUsers: User[] = [MOCK_USERS[0], MOCK_USERS[2], MOCK_USERS[4], MOCK_USERS[6]];
    return renderUserListPage('Followers', followerUsers);
  };

  const renderFollowingList = () => {
    const followingUsers = MOCK_POSTS
      .filter(p => p.author.isFollowing && p.author.id !== 'me')
      .map(p => p.author)
      .filter((user, idx, arr) => arr.findIndex(u => u.id === user.id) === idx);
    return renderUserListPage('Following', followingUsers);
  };

  const renderSettings = () => (
    <div className="fixed inset-0 z-[60] bg-black overflow-y-auto animate-in slide-in-from-right duration-300">
      <div className="p-4 sticky top-0 bg-black/85 backdrop-blur-md border-b border-zinc-900 flex items-center gap-4">
        <button onClick={() => setCurrentView('MAIN')}><ArrowLeft /></button>
        <h2 className="text-lg font-bold uppercase tracking-wide">Settings</h2>
      </div>
      <div className="p-4 space-y-3">
        {[
          { label: 'Account', sublabel: 'Manage your account details' },
          { label: 'Privacy', sublabel: 'Control who can see your content' },
          { label: 'Notifications', sublabel: 'Push and in-app notifications' },
          { label: 'Language', sublabel: 'English' },
          { label: 'About', sublabel: 'Version 0.1.0' },
        ].map((item, idx) => (
          <button
            key={idx}
            className="w-full flex items-center justify-between p-4 bg-zinc-900/50 border border-zinc-800 rounded-2xl active:bg-zinc-900"
          >
            <div className="text-left">
              <span className="text-sm font-bold text-zinc-200 block">{item.label}</span>
              <span className="text-[10px] text-zinc-500">{item.sublabel}</span>
            </div>
            <ArrowLeft className="rotate-180 text-zinc-600" size={16} />
          </button>
        ))}
      </div>
    </div>
  );

  const renderContent = () => {
    switch (activeTab) {
      case 'Feed': return renderFeed();
      case 'Following': return renderFollowing();
      case 'Chat': return renderChat();
      case 'Profile': return renderProfile();
      default: return renderFeed();
    }
  };

  return (
    <div className="min-h-screen pb-24 relative select-none">
      {renderHeader()}
      <main className="max-w-md mx-auto">
        {renderContent()}
      </main>
      
      {/* Sub-Views Logic */}
      {currentView === 'SEARCH' && renderSearch()}
      {currentView === 'POST_DETAIL' && renderPostDetail()}
      {currentView === 'QA_DETAIL' && renderQADetail()}
      {currentView === 'TRANSACTIONS' && renderTransactions()}
      {currentView === 'INVITE' && renderInvite()}
      {currentView === 'CHAT_DETAIL' && renderChatDetail()}
      {currentView === 'USER_PROFILE' && renderUserProfile()}
      {currentView === 'FOLLOWERS_LIST' && renderFollowersList()}
      {currentView === 'FOLLOWING_LIST' && renderFollowingList()}
      {currentView === 'ADD_FRIENDS' && renderAddFriends()}
      {currentView === 'GROUP_CHAT' && renderGroupChat()}
      {currentView === 'SCAN' && renderScan()}
      {currentView === 'SETTINGS' && renderSettings()}
      
      {/* Daily Reward Modal */}
      <DailyRewardModal
        isOpen={showDailyReward}
        onClose={() => setShowDailyReward(false)}
        rewardAmount={dailyRewardAmount}
        streak={loginStreak}
        totalBalance={availableBalance}
      />

      {/* Challenge Modal */}
      <ChallengeModal
        isOpen={showChallengeModal}
        onClose={() => setShowChallengeModal(false)}
        post={challengePost}
        userBalance={availableBalance}
        onChallengeComplete={handleChallengeComplete}
      />

      {/* Like Stake Modal */}
      <LikeStakeModal
        isOpen={showLikeModal}
        onClose={() => setShowLikeModal(false)}
        onConfirm={handleLikeConfirm}
        stakeAmount={LIKE_STAKE}
        userBalance={availableBalance}
      />
      
      {/* Modals */}
      {renderPublishOverlay()}
      {renderBottomNav()}
    </div>
  );
};

export default App;
