import React, { useState, useEffect, useCallback } from 'react';
import { Tab, Post, User, ChatSession, apiPostToPost, apiUserToUser, apiSessionToSession } from './types';
import { MOCK_ME } from './constants';
import { useUserStore, usePostStore, useChatStore } from './stores';
import { api, ApiComment, ApiMessage } from './api/client';
import { Search, Bell, Plus, Home, Users, MessageCircle, User as UserIcon, X, SlidersHorizontal, ArrowLeft, Send, Trash2, ShieldCheck, Zap, MoreHorizontal, Heart, Gift, Copy, Share2, UserPlus, ScanLine, QrCode, Camera, Image, Reply, Forward, Undo2, Smile, Crown, Settings, UserMinus, Volume2, VolumeX, Link, LogOut, Edit3, Check } from 'lucide-react';
import { PostCard } from './components/PostCard';
import { TrustBadge } from './components/TrustBadge';
import { LoginPage } from './components/LoginPage';
import { ChallengeModal } from './components/ChallengeModal';
import { LikeStakeModal } from './components/LikeStakeModal';
import { ToastContainer, toast } from './components/Toast';
import { getTrustRingClass, getTrustStrokeColor, getTrustBadgeBg, getTrustTier } from './trustTheme';
import { ApiTrustBreakdown, ApiUserCosts, ApiGroupDetail, ApiMemberInfo, ApiInviteLink, ApiJoinRequest } from './api/client';
import { useChatWebSocket } from './hooks/useChatWebSocket';

// Views
type View = 'MAIN' | 'POST_DETAIL' | 'QA_DETAIL' | 'SEARCH' | 'USER_PROFILE' | 'CHAT_DETAIL' | 'TRANSACTIONS' | 'INVITE' | 'SETTINGS' | 'FOLLOWERS_LIST' | 'FOLLOWING_LIST' | 'MY_QR_CODE' | 'GROUP_CHAT' | 'SCAN' | 'TRUST_DETAIL' | 'GROUP_INFO' | 'JOIN_GROUP';

const App: React.FC = () => {
  // Stores
  const {
    currentUser,
    isLoggedIn,
    isLoading: isLoggingIn,
    availableBalance,
    change24h,
    ledgerEntries,
    availableUsers,
    loadFromStorage,
    logout,
    fetchBalance,
    fetchLedger,
  } = useUserStore();

  const {
    posts: apiPosts,
    feedPosts: apiFeedPosts,
    comments: apiComments,
    fetchPosts,
    fetchFeed,
    fetchComments,
    createPost: createApiPost,
    createComment: createApiComment,
    toggleLikePost,
    toggleLikeComment,
  } = usePostStore();

  const {
    sessions: apiSessions,
    messages: apiMessages,
    fetchSessions,
    fetchMessages,
    sendMessage: sendApiMessage,
    createSession: createApiSession,
    markSessionAsRead,
    updateSessionLastMessage,
  } = useChatStore();

  // Convert API data to UI format (no mock fallbacks)
  const posts: Post[] = apiPosts.map(apiPostToPost);
  const feedPostsConverted: Post[] = apiFeedPosts.map(apiPostToPost);
  const chatSessions: ChatSession[] = apiSessions.map(apiSessionToSession);
  const currentMe: User = currentUser ? apiUserToUser(currentUser) : MOCK_ME;

  // Local UI state
  const [activeTab, setActiveTab] = useState<Tab>('Feed');
  const [currentView, setCurrentView] = useState<View>('MAIN');
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [selectedChat, setSelectedChat] = useState<ChatSession | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishType, setPublishType] = useState<'Note' | 'Question'>('Note');
  const [publishContent, setPublishContent] = useState('');
  const [publishBounty, setPublishBounty] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [challengePost, setChallengePost] = useState<Post | null>(null);
  const [showChallengeModal, setShowChallengeModal] = useState(false);
  const [showLikeModal, setShowLikeModal] = useState(false);
  const [likeTargetPost, setLikeTargetPost] = useState<Post | null>(null);
  const [likedPosts, setLikedPosts] = useState<Set<string>>(new Set());
  const [showChatActions, setShowChatActions] = useState(false);
  const [friendSearch, setFriendSearch] = useState('');
  const [friendSearchResults, setFriendSearchResults] = useState<User[]>([]);
  const [isFriendSearching, setIsFriendSearching] = useState(false);
  const [friendSearchError, setFriendSearchError] = useState<string | null>(null);
  const [addedFriendIds, setAddedFriendIds] = useState<Set<string>>(new Set());
  const [groupChatName, setGroupChatName] = useState('');
  const [groupMemberIds, setGroupMemberIds] = useState<Set<string>>(new Set());
  const [commentDraft, setCommentDraft] = useState('');
  const [replyTarget, setReplyTarget] = useState<{ id: string; handle: string } | null>(null);


  // Chat detail state
  type ChatMessageReaction = { emoji: string; user_id: number; user_name: string };
  const [chatMessages, setChatMessages] = useState<Array<{id: string | number; senderId: string | number; content: string; messageType: 'text' | 'system'; status: 'sent' | 'pending'; createdAt?: string; reactions?: ChatMessageReaction[]; replyTo?: {id: number; content: string; sender_name: string} | null}>>([]);
  const [chatMessageInput, setChatMessageInput] = useState('');
  const [isLoadingChatMessages, setIsLoadingChatMessages] = useState(false);
  const [removedFromSessions, setRemovedFromSessions] = useState<Set<number>>(new Set());
  const [selectedMessageId, setSelectedMessageId] = useState<string | number | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);
  const [emojiPage, setEmojiPage] = useState(0);
  const [showAttachmentPicker, setShowAttachmentPicker] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [replyingTo, setReplyingTo] = useState<{id: string | number; content: string} | null>(null);
  const [showReactorsFor, setShowReactorsFor] = useState<{messageId: string | number; emoji: string} | null>(null);
  const longPressTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggered = React.useRef(false);
  const reactionLongPressTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const reactionLongPressTriggered = React.useRef(false);
  const messageRefs = React.useRef<Record<string, HTMLDivElement | null>>({});
  const [highlightedMsgId, setHighlightedMsgId] = useState<string | number | null>(null);

  // Group info state
  const [groupDetail, setGroupDetail] = useState<ApiGroupDetail | null>(null);
  const [isLoadingGroupDetail, setIsLoadingGroupDetail] = useState(false);
  const [showMemberActions, setShowMemberActions] = useState<number | null>(null);
  const [isEditingGroup, setIsEditingGroup] = useState(false);
  const [settingsMenu, setSettingsMenu] = useState<'who_can_send' | 'who_can_add' | null>(null);
  const [editGroupName, setEditGroupName] = useState('');
  const [editGroupDescription, setEditGroupDescription] = useState('');
  const [showInviteLinks, setShowInviteLinks] = useState(false);
  const [inviteLinks, setInviteLinks] = useState<ApiInviteLink[]>([]);
  const [showAddMembersModal, setShowAddMembersModal] = useState(false);
  const [addMemberSearch, setAddMemberSearch] = useState('');
  const [addMemberResults, setAddMemberResults] = useState<User[]>([]);
  const [selectedNewMembers, setSelectedNewMembers] = useState<Set<number>>(new Set());
  const [inviteCodeInput, setInviteCodeInput] = useState('');
  const [invitePreview, setInvitePreview] = useState<{ group_name: string | null; avatar: string | null; description: string | null; member_count: number; requires_approval: boolean } | null>(null);
  const [isJoiningViaInvite, setIsJoiningViaInvite] = useState(false);
  const [joinRequests, setJoinRequests] = useState<ApiJoinRequest[]>([]);
  const [isLoadingJoinRequests, setIsLoadingJoinRequests] = useState(false);
  const [invitableUsers, setInvitableUsers] = useState<User[]>([]);
  const [isLoadingInvitableUsers, setIsLoadingInvitableUsers] = useState(false);

  // Scroll to a specific message and briefly highlight it
  const scrollToMessage = (msgId: number) => {
    const el = messageRefs.current[String(msgId)];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightedMsgId(msgId);
      setTimeout(() => setHighlightedMsgId(null), 1500);
    }
  };

  // Default emoji reactions
  const defaultReactions = ['👍', '❤️', '🎉', '😂', '😮', '😢', '😡', '🔥', '👏', '🙏'];

  // Long press handlers for message selection
  const handleLongPressStart = (msgId: string | number, e: React.MouseEvent | React.TouchEvent) => {
    longPressTriggered.current = false;
    const target = e.currentTarget as HTMLElement;
    longPressTimer.current = setTimeout(() => {
      longPressTriggered.current = true;
      const rect = target.getBoundingClientRect();
      setSelectedMessageId(msgId);
      setMenuPosition({ x: rect.left + rect.width / 2, y: rect.bottom + 8 });
      setEmojiPage(0);
    }, 500); // 500ms for long press
  };

  const handleLongPressEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const handleMessageClick = (e: React.MouseEvent, msgId: string | number) => {
    e.stopPropagation();
    // Only toggle selection if it wasn't a long press
    if (!longPressTriggered.current) {
      setSelectedMessageId(prev => prev === msgId ? null : msgId);
    }
    longPressTriggered.current = false;
  };

  // Use ref to avoid reconnecting WebSocket when selectedChat changes
  const selectedChatRef = React.useRef(selectedChat);
  React.useEffect(() => {
    selectedChatRef.current = selectedChat;
  }, [selectedChat]);

  // WebSocket message handler - stable reference using ref
  const handleWebSocketMessage = useCallback((message: ApiMessage) => {
    console.log('[WS] Received message:', message);
    const currentChat = selectedChatRef.current;
    console.log('[WS] Current chat:', currentChat?.id, 'Message session:', message.session_id);
    
    if (currentChat && Number(message.session_id) === Number(currentChat.id)) {
      // User is viewing this chat - add message directly
      console.log('[WS] Adding message to chat');
      setChatMessages(prev => {
        if (prev.some(m => Number(m.id) === Number(message.id))) return prev;
        
        // If this is a reply from the other person, remove system warnings
        const isFromOther = Number(message.sender_id) !== Number(currentUser?.id);
        let updated = prev;
        if (isFromOther && message.message_type === 'text') {
          // Filter out system messages (warnings) since conversation is now established
          updated = prev.filter(m => m.messageType !== 'system');
        }
        
        return [...updated, { 
          id: message.id, 
          senderId: message.sender_id, 
          content: message.content, 
          messageType: message.message_type,
          status: message.status,
          replyTo: message.reply_to ? { id: message.reply_to.id, content: message.reply_to.content, sender_name: message.reply_to.sender_name } : null,
        }];
      });
    } else {
      // User is not viewing this chat - refresh sessions to update unread count
      console.log('[WS] Refreshing sessions list');
      if (currentUser?.id) {
        fetchSessions(currentUser.id);
      }
    }
  }, [currentUser?.id, fetchSessions]);

  // WebSocket reaction handlers (only for OTHER users' reactions; sender uses optimistic update)
  const handleReactionAdded = useCallback((event: { message_id: number; user_id: number; user_name?: string; emoji: string }) => {
    setChatMessages(prev => prev.map(m => {
      if (Number(m.id) === Number(event.message_id)) {
        const reactions = [...(m.reactions || [])];
        // Only add if not already exists (safety dedup)
        if (!reactions.some(r => r.emoji === event.emoji && Number(r.user_id) === Number(event.user_id))) {
          reactions.push({ emoji: event.emoji, user_id: Number(event.user_id), user_name: event.user_name || 'User' });
        }
        return { ...m, reactions };
      }
      return m;
    }));
  }, []);

  const handleReactionRemoved = useCallback((event: { message_id: number; user_id: number; emoji: string }) => {
    setChatMessages(prev => prev.map(m => {
      if (Number(m.id) === Number(event.message_id)) {
        const reactions = (m.reactions || []).filter(
          r => !(r.emoji === event.emoji && Number(r.user_id) === Number(event.user_id))
        );
        return { ...m, reactions };
      }
      return m;
    }));
  }, []);

  // Handle member removed from group (refresh member list)
  const handleMemberRemoved = useCallback((event: { session_id: number; user_id?: number }) => {
    // Refresh sessions to update member lists
    if (currentUser) {
      loadChatSessions(currentUser.id);
    }
  }, [currentUser]);

  // Handle new members added to group
  const handleMembersAdded = useCallback((event: { session_id: number; count: number }) => {
    // Refresh sessions to update member lists
    if (currentUser) {
      loadChatSessions(currentUser.id);
    }
  }, [currentUser]);

  // Handle when current user is removed from a group
  const handleYouWereRemoved = useCallback((event: { session_id: number }) => {
    // Mark this session as removed
    setRemovedFromSessions(prev => new Set(prev).add(event.session_id));
    // Refresh messages to get the "You were removed" message
    if (selectedChat && Number(selectedChat.id) === event.session_id) {
      loadChatMessages(event.session_id);
    }
    // Refresh sessions list
    if (currentUser) {
      loadChatSessions(currentUser.id);
    }
  }, [selectedChat, currentUser]);

  // Connect to WebSocket for real-time chat
  useChatWebSocket({
    userId: currentUser?.id ?? null,
    onMessage: handleWebSocketMessage,
    onReactionAdded: handleReactionAdded,
    onReactionRemoved: handleReactionRemoved,
    onMemberRemoved: handleMemberRemoved,
    onMembersAdded: handleMembersAdded,
    onYouWereRemoved: handleYouWereRemoved,
  });

  // Trust & dynamic costs state
  const [trustBreakdown, setTrustBreakdown] = useState<ApiTrustBreakdown | null>(null);
  const [userCosts, setUserCosts] = useState<ApiUserCosts | null>(null);
  
  // Profile message permission state
  const [profileMsgPermission, setProfileMsgPermission] = useState<{ permission: string; reason: string; can_message: boolean } | null>(null);
  const [isFollowingProfile, setIsFollowingProfile] = useState(false);
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);

  const LIKE_STAKE = 10; // sat required to like

  // Fetch trust breakdown & dynamic costs
  const fetchTrustData = async (userId: number) => {
    try {
      const [trust, costs] = await Promise.all([
        api.getTrustBreakdown(userId),
        api.getUserCosts(userId),
      ]);
      setTrustBreakdown(trust);
      setUserCosts(costs);
    } catch { /* silent */ }
  };





  // Handle challenge action
  const handleChallenge = (post: Post) => {
    setChallengePost(post);
    setShowChallengeModal(true);
  };

  const handleChallengeComplete = (result: 'violation' | 'no_violation') => {
    // Refresh balance + posts after challenge settles
    if (currentUser) {
      fetchBalance(currentUser.id);
      fetchPosts({ user_id: currentUser.id });
    }
  };

  // Handle like action (toggle)
  const handleLikeToggle = async (post: Post) => {
    if (!currentUser) return;
    const isLiked = likedPosts.has(String(post.id)) || post.isLiked;
    try {
      await toggleLikePost(Number(post.id), currentUser.id, isLiked);
      if (isLiked) {
        setLikedPosts(prev => { const s = new Set(prev); s.delete(String(post.id)); return s; });
      } else {
        setLikedPosts(prev => new Set([...prev, String(post.id)]));
      }
      fetchBalance(currentUser.id);
    } catch (error) {
      const msg = (error as Error).message || 'Like failed';
      toast.warning(msg);
    }
  };

  // Legacy — keep modal wiring for now but simplified
  const handleLikeRequest = (post: Post) => {
    handleLikeToggle(post);
  };

  const handleLikeConfirm = async () => {
    if (likeTargetPost) handleLikeToggle(likeTargetPost);
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

  // Handle invite deep links
  useEffect(() => {
    const path = window.location.pathname;
    const joinMatch = path.match(/^\/join\/([a-zA-Z0-9_-]+)$/);
    if (joinMatch && isLoggedIn) {
      const code = joinMatch[1];
      setInviteCodeInput(code);
      setCurrentView('JOIN_GROUP');
      // Auto-preview
      api.previewInvite(code).then(preview => {
        setInvitePreview(preview);
      }).catch(error => {
        toast.error((error as Error).message);
      });
      // Clear the URL
      window.history.replaceState({}, '', '/');
    }
  }, [isLoggedIn]);

  // Fetch posts and chats when logged in
  useEffect(() => {
    if (isLoggedIn && currentUser) {
      fetchPosts({ user_id: currentUser.id });
      fetchFeed(currentUser.id);
      fetchSessions(currentUser.id);
      fetchTrustData(currentUser.id);
    }
  }, [isLoggedIn, currentUser?.id]);

  // Load available users when entering group chat creation
  useEffect(() => {
    if (currentView === 'GROUP_CHAT' && currentUser) {
      setIsLoadingInvitableUsers(true);
      api.searchUsers('', 50)
        .then(users => {
          setInvitableUsers(users
            .filter(u => u.id !== currentUser.id)
            .map(u => ({
              id: u.id,
              name: u.name,
              handle: u.handle,
              avatar: u.avatar || `https://picsum.photos/id/${u.id + 10}/200/200`,
              trustScore: u.trust_score,
            })) as User[]);
        })
        .catch(console.error)
        .finally(() => setIsLoadingInvitableUsers(false));
    }
  }, [currentView, currentUser]);

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
        setChatMessages(msgs.map(m => ({ 
          id: m.id, 
          senderId: m.sender_id, 
          content: m.content, 
          messageType: m.message_type,
          status: m.status,
          createdAt: m.created_at,
          replyTo: m.reply_to ? { id: m.reply_to.id, content: m.reply_to.content, sender_name: m.reply_to.sender_name } : null,
          reactions: m.reactions || []
        })));
        // Clear unread count after messages are loaded (backend already marked as read)
        markSessionAsRead(Number(selectedChat.id));
      } catch (error) {
        console.error('Failed to load messages:', error);
        setChatMessages([]);
      } finally {
        setIsLoadingChatMessages(false);
      }
    };
    loadMessages();
  }, [selectedChat?.id, currentUser?.id]);

  // Load profile permission when viewing a user
  useEffect(() => {
    const profileUserId = selectedUser ? Number(selectedUser.id) : null;
    if (currentView === 'USER_PROFILE' && profileUserId && currentUser) {
      setIsLoadingProfile(true);
      Promise.all([
        api.checkMessagePermission(currentUser.id, profileUserId),
        api.getUser(profileUserId, currentUser.id),
      ]).then(([perm, user]) => {
        setProfileMsgPermission(perm);
        setIsFollowingProfile(user.is_following || false);
      }).catch(() => {
        setProfileMsgPermission(null);
      }).finally(() => {
        setIsLoadingProfile(false);
      });
    }
  }, [currentView, selectedUser?.id, currentUser?.id]);

  // Show login page if not logged in
  if (!isLoggedIn) {
    return <LoginPage onLogin={handleLogin} isLoading={isLoggingIn} />;
  }

  // Layout Helpers
  const renderHeader = () => {
    if (currentView !== 'MAIN') return null;
    return (
      <header className="sticky top-0 z-40 bg-black/80 backdrop-blur-md border-b border-zinc-800 px-4 py-3 flex items-center justify-between">
        <h1 className="text-xl font-black italic tracking-tighter text-orange-500">BITLINK</h1>
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
          <button data-testid="nav-feed" onClick={() => { setActiveTab('Feed'); setShowChatActions(false); }} className={`flex flex-col items-center justify-center gap-1 py-1 ${activeTab === 'Feed' ? 'text-orange-500' : 'text-zinc-500'}`}>
            <Home size={24} />
            <span className="text-[10px] font-bold">Feed</span>
          </button>
          <button data-testid="nav-following" onClick={() => { setActiveTab('Following'); setShowChatActions(false); }} className={`flex flex-col items-center justify-center gap-1 py-1 ${activeTab === 'Following' ? 'text-orange-500' : 'text-zinc-500'}`}>
            <Users size={24} />
            <span className="text-[10px] font-bold">Following</span>
          </button>
          
          <div className="flex justify-center -mt-4">
            <button 
              data-testid="new-post-button"
              onClick={() => setIsPublishing(true)}
              className="w-14 h-14 bg-orange-500 rounded-2xl flex items-center justify-center shadow-lg shadow-orange-500/30 active:scale-90 transition-transform duration-200"
            >
              <Plus size={28} color="white" strokeWidth={3} />
            </button>
          </div>

          <button data-testid="nav-chat" onClick={() => { setActiveTab('Chat'); setShowChatActions(false); }} className={`flex flex-col items-center justify-center gap-1 py-1 ${activeTab === 'Chat' ? 'text-orange-500' : 'text-zinc-500'}`}>
            <MessageCircle size={24} />
            <span className="text-[10px] font-bold">Chat</span>
          </button>
          <button data-testid="nav-profile" onClick={() => { setActiveTab('Profile'); setShowChatActions(false); }} className={`flex flex-col items-center justify-center gap-1 py-1 ${activeTab === 'Profile' ? 'text-orange-500' : 'text-zinc-500'}`}>
            <UserIcon size={24} />
            <span className="text-[10px] font-bold">Me</span>
          </button>
        </div>
      </nav>
    );
  };

  // Sub-Views
  const renderFeed = () => (
    <div className="">
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
              fetchComments(Number(p.id), currentUser?.id);
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
    <div className="p-4">
      <h2 className="text-xl font-bold mb-4 px-2">Timeline</h2>
      {feedPostsConverted.map(post => (
        <PostCard 
          key={post.id} 
          post={post} 
          onClick={(p) => {
            setSelectedPost(p);
            setCurrentView(p.type === 'Question' ? 'QA_DETAIL' : 'POST_DETAIL');
            fetchComments(Number(p.id), currentUser?.id);
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
      { id: 'my-qr', label: 'My QR Code', icon: <QrCode size={14} className="text-orange-400" />, view: 'MY_QR_CODE' as View },
      { id: 'group-chat', label: 'New Group', icon: <Users size={14} className="text-orange-400" />, view: 'GROUP_CHAT' as View },
      { id: 'join-group', label: 'Join Group', icon: <UserPlus size={14} className="text-orange-400" />, view: 'JOIN_GROUP' as View },
      { id: 'scan', label: 'Scan', icon: <ScanLine size={14} className="text-orange-400" />, view: 'SCAN' as View }
    ];

    return (
      <div className="p-4">
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
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowChatActions(false)} />
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
              </>
            )}
          </div>
        </div>
        {chatSessions.map(chat => {
          // For DMs, show the OTHER participant (not current user)
          const otherParticipants = chat.participants.filter(p => String(p.id) !== String(currentMe.id));
          const displayUser = otherParticipants[0] || chat.participants[0];
          
          return (
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
                <img src={displayUser?.avatar || `https://picsum.photos/id/${Number(chat.id) + 10}/200/200`} className="w-14 h-14 rounded-full border border-zinc-800 object-cover" />
                {chat.isGroup && otherParticipants[1] && (
                   <img src={otherParticipants[1].avatar || `https://picsum.photos/id/${Number(chat.id) + 11}/200/200`} className="w-8 h-8 rounded-full border-2 border-black absolute -bottom-1 -right-1 object-cover" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="font-bold text-zinc-100">{chat.isGroup ? (chat.name || 'Group Chat') : displayUser?.name}</span>
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
          );
        })}
      </div>
    );
  };

  const renderUserListPage = (title: 'Followers' | 'Following', users: User[]) => (
    <div className="fixed inset-0 z-[60] bg-black overflow-y-auto">
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

  const handleFriendSearch = async () => {
    const query = friendSearch.trim();
    if (!query) {
      setFriendSearchResults([]);
      return;
    }
    setIsFriendSearching(true);
    setFriendSearchError(null);
    try {
      const results = await api.searchUsers(query);
      setFriendSearchResults(results.filter(u => u.id !== currentUser?.id).map(apiUserToUser));
    } catch (err) {
      setFriendSearchError('Search failed');
    } finally {
      setIsFriendSearching(false);
    }
  };

  const renderMyQRCode = () => {
    const handleCopyHandle = () => {
      navigator.clipboard.writeText(`@${currentMe.handle}`);
      toast.success('Handle copied!');
    };

    return (
      <div className="fixed inset-0 z-[60] bg-black overflow-y-auto">
        <div className="p-4 sticky top-0 bg-black/85 backdrop-blur-md border-b border-zinc-900 flex items-center gap-4">
          <button onClick={() => setCurrentView('MAIN')}><ArrowLeft /></button>
          <h2 className="text-lg font-bold uppercase tracking-wide">My QR Code</h2>
        </div>
        <div className="flex flex-col items-center justify-center p-8 pt-16">
          {/* QR Code placeholder - in real app would generate actual QR */}
          <div className="w-64 h-64 bg-white rounded-3xl p-4 flex items-center justify-center mb-8">
            <div className="w-full h-full bg-gradient-to-br from-zinc-200 to-zinc-100 rounded-2xl flex items-center justify-center relative">
              <QrCode size={180} className="text-zinc-800" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-16 h-16 bg-gradient-to-br from-orange-500 to-amber-600 rounded-xl flex items-center justify-center shadow-lg">
                  <Zap className="w-8 h-8 text-white fill-white" />
                </div>
              </div>
            </div>
          </div>

          <div className="text-center mb-8">
            <h3 className="text-2xl font-black text-white mb-1">{currentMe.name}</h3>
            <p className="text-orange-400 font-bold text-lg">@{currentMe.handle}</p>
          </div>

          <button
            onClick={handleCopyHandle}
            className="flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-xl px-6 py-3"
          >
            <Copy size={18} className="text-orange-400" />
            <span className="text-zinc-300 font-medium">Copy Handle</span>
          </button>

          <p className="text-zinc-600 text-sm text-center mt-8 px-8">
            Others can scan this code or search your handle <span className="text-orange-400">@{currentMe.handle}</span> to find you
          </p>
        </div>
      </div>
    );
  };

  const renderGroupChat = () => {
    const candidates = invitableUsers;
    const toggleMember = (userId: string | number) => {
      const id = String(userId);
      setGroupMemberIds(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    };

    const canCreateGroup = groupChatName.trim().length > 0 && groupMemberIds.size >= 1;

    const handleCreateGroup = async () => {
      if (!canCreateGroup || !currentUser) return;
      try {
        const memberIds = Array.from(groupMemberIds).map(id => Number(id));
        const session = await api.createChatSession(currentUser.id, {
          member_ids: memberIds,
          name: groupChatName.trim(),
          is_group: true,
        });
        const selectedMembers = candidates.filter(user => groupMemberIds.has(String(user.id)));
        setSelectedChat({
          id: session.id,
          name: session.name,
          participants: selectedMembers,
          lastMessage: 'Group created',
          timestamp: 'now',
          unreadCount: 0,
          isGroup: true,
        });
        setGroupChatName('');
        setGroupMemberIds(new Set());
        fetchSessions(currentUser.id);
        setCurrentView('CHAT_DETAIL');
      } catch (error) {
        toast.error((error as Error).message);
      }
    };

    return (
      <div className="fixed inset-0 z-[60] bg-black overflow-y-auto">
        <div className="p-4 sticky top-0 bg-black/85 backdrop-blur-md border-b border-zinc-900 flex items-center gap-4">
          <button onClick={() => setCurrentView('MAIN')}><ArrowLeft /></button>
          <h2 className="text-lg font-bold uppercase tracking-wide">New Group</h2>
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

          <p className="text-xs text-zinc-500 mb-4">
            Only showing users who follow you or have a conversation with you.
          </p>

          {isLoadingInvitableUsers ? (
            <div className="flex justify-center py-8">
              <div className="w-6 h-6 border-2 border-orange-500/30 border-t-orange-500 rounded-full animate-spin" />
            </div>
          ) : candidates.length === 0 ? (
            <div className="text-center py-8 text-zinc-500">
              <p>No contacts available to invite.</p>
              <p className="text-xs mt-2">Users must follow you or have an established conversation.</p>
            </div>
          ) : (
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
          )}

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
    <div className="fixed inset-0 z-[60] bg-black overflow-y-auto">
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
    <div className="p-4 pb-28">
      <div className="flex flex-col items-center mb-8">
        <button className="relative w-28 h-28 mb-4" onClick={() => { if (currentUser) fetchTrustData(currentUser.id); setCurrentView('TRUST_DETAIL'); }}>
           <svg className="absolute inset-0 w-full h-full transform -rotate-90">
             <circle cx="56" cy="56" r="50" stroke="currentColor" strokeWidth="6" fill="transparent" className="text-zinc-800" />
             <circle cx="56" cy="56" r="50" stroke={getTrustStrokeColor(currentMe.trustScore)} strokeWidth="6" fill="transparent" strokeDasharray={314} strokeDashoffset={314 * (1 - currentMe.trustScore / 1000)} strokeLinecap="round" />
           </svg>
           <img src={currentMe.avatar || `https://picsum.photos/id/64/200/200`} className="absolute inset-2 w-24 h-24 rounded-full border border-zinc-800 object-cover" />
           <div className={`absolute -bottom-1 left-1/2 -translate-x-1/2 ${getTrustBadgeBg(currentMe.trustScore)} text-white text-[10px] font-black px-2 py-0.5 rounded-full border-2 border-black`}>
             {currentMe.trustScore}
           </div>
        </button>
        <h2 className="text-xl font-black italic tracking-tighter">{currentMe.name}</h2>
        <span className="text-zinc-500 text-xs font-medium">{currentMe.handle}</span>
        <span className="text-[10px] text-zinc-600 mt-1">{getTrustTier(currentMe.trustScore).toUpperCase()} · {currentMe.trustScore}/1000</span>
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

      <div data-testid="balance-card" className="bg-zinc-900 border border-zinc-800 p-4 rounded-2xl mb-4">
        <span className="text-zinc-500 text-[10px] font-bold uppercase block mb-1">Balance</span>
        <div className="flex items-baseline justify-between">
          <span data-testid="balance-amount" className="text-2xl font-black text-zinc-100">{availableBalance.toLocaleString()} <span className="text-orange-500 text-sm">sat</span></span>
          {change24h !== 0 && (
            <span className={`text-sm font-bold ${change24h > 0 ? 'text-green-500' : 'text-red-500'}`}>
              {change24h > 0 ? '+' : ''}{change24h.toLocaleString()} <span className="text-[10px] text-zinc-500">24h</span>
            </span>
          )}
        </div>
      </div>

      <div className="space-y-2">
        {[
          { icon: <ShieldCheck size={20} />, label: 'Trust Score', sublabel: userCosts ? `${userCosts.tier.toUpperCase()} · ${userCosts.fee_multiplier}× fees` : 'View breakdown', action: () => { if (currentUser) fetchTrustData(currentUser.id); setCurrentView('TRUST_DETAIL'); } },
          { icon: <Zap size={20} />, label: 'Transactions', action: () => { if (currentUser) fetchLedger(currentUser.id); setCurrentView('TRANSACTIONS'); } },
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

  const renderSearch = () => {
    const handleViewProfile = (user: User) => {
      setSelectedUser(user);
      setFriendSearch('');
      setFriendSearchResults([]);
      setCurrentView('USER_PROFILE');
    };

    return (
      <div className="fixed inset-0 z-[60] bg-black overflow-y-auto">
        <div className="p-4 border-b border-zinc-900 flex items-center gap-4">
          <button onClick={() => { setCurrentView('MAIN'); setFriendSearch(''); setFriendSearchResults([]); }}><ArrowLeft /></button>
          <div className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2 flex items-center gap-3">
            <Search size={18} className="text-zinc-500" />
            <input 
              autoFocus
              value={friendSearch}
              onChange={(e) => setFriendSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleFriendSearch()}
              placeholder="Search @handle or topics..." 
              className="bg-transparent border-none outline-none text-sm w-full text-zinc-100" 
            />
            {friendSearch.trim() && (
              <button
                onClick={handleFriendSearch}
                disabled={isFriendSearching}
                className="px-3 py-1 bg-orange-500 text-white text-xs font-bold rounded-lg disabled:opacity-50"
              >
                {isFriendSearching ? '...' : 'Go'}
              </button>
            )}
          </div>
        </div>
        <div className="p-4">
          {/* User search results */}
          {friendSearchResults.length > 0 && (
            <div className="mb-6">
              <h3 className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-3">Users</h3>
              <div className="space-y-2">
                {friendSearchResults.map(user => (
                  <div 
                    key={user.id} 
                    className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-3 flex items-center gap-3"
                    onClick={() => handleViewProfile(user)}
                  >
                    <img 
                      src={user.avatar || `https://api.dicebear.com/7.x/identicon/svg?seed=${user.handle}`} 
                      className="w-10 h-10 rounded-full border border-zinc-700 object-cover" 
                    />
                    <div className="flex-1">
                      <span className="text-sm font-bold text-zinc-100 block">{user.name}</span>
                      <span className="text-[11px] text-zinc-500">{user.handle}</span>
                    </div>
                    <span className="text-zinc-600 text-xs">→</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {friendSearchError && (
            <p className="text-red-400 text-sm text-center py-4 mb-4">{friendSearchError}</p>
          )}

          {friendSearch.trim() && friendSearchResults.length === 0 && !isFriendSearching && (
            <p className="text-zinc-500 text-sm text-center py-6 mb-4">
              No users found for "{friendSearch}"
            </p>
          )}

          {/* Show trending when no search */}
          {!friendSearch.trim() && (
            <>
              <h3 className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-4">Trending Now</h3>
              <div className="flex flex-wrap gap-2 mb-8">
                {['#Bitcoin2025', '#AI_Moderation', '#SatStaking', '#Privacy', '#L2_Growth'].map(tag => (
                  <span key={tag} className="px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-xs font-bold text-orange-400">
                    {tag}
                  </span>
                ))}
              </div>
              
              <h3 className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-4">Popular Posts</h3>
              <div className="grid grid-cols-2 gap-3">
                {posts.slice(0, 4).map((p, i) => (
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
            </>
          )}
        </div>
      </div>
    );
  };

  // Shared comment-list component used by Post Detail & QA Detail
  const renderCommentItem = (c: ApiComment) => {
    const isLiked = c.is_liked;
    return (
      <div key={c.id} className={`flex gap-3 mb-5 ${c.parent_id ? 'ml-10' : ''}`}>
        <div className={`w-8 h-8 rounded-full p-[2px] ${getTrustRingClass(c.author.trust_score)} shrink-0`}>
          <img
            src={c.author.avatar || `https://api.dicebear.com/7.x/identicon/svg?seed=${c.author.handle}`}
            className="w-full h-full rounded-full object-cover border border-zinc-900"
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-bold truncate">{c.author.name}</span>
            <span className="text-[10px] text-zinc-500 font-medium">@{c.author.handle}</span>
          </div>
          <p className="text-sm text-zinc-400 break-words">{c.content}</p>
          <div className="flex items-center gap-4 mt-2">
            <button
              className={`flex items-center gap-1 text-[10px] font-bold ${isLiked ? 'text-orange-400' : 'text-zinc-500'}`}
              onClick={async () => {
                if (!currentUser || !selectedPost) return;
                try {
                  await toggleLikeComment(Number(selectedPost.id), c.id, currentUser.id, isLiked);
                  fetchBalance(currentUser.id);
                } catch (err) {
                  toast.warning((err as Error).message);
                }
              }}
            >
              <Heart size={12} fill={isLiked ? 'currentColor' : 'none'} /> {c.likes_count}
              <span className="text-zinc-600 ml-0.5">5</span>
            </button>
            <button
              className="text-[10px] font-bold text-zinc-500 hover:text-zinc-300"
              onClick={() => {
                setReplyTarget(prev => prev?.id === String(c.id) ? null : { id: String(c.id), handle: `@${c.author.handle}` });
                if (!commentDraft.trim()) setCommentDraft(`@${c.author.handle} `);
              }}
            >
              Reply <span className="text-zinc-600">20</span>
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Submit comment or reply (shared)
  const handleSubmitComment = async () => {
    if (!commentDraft.trim() || !selectedPost || !currentUser) return;
    const parentId = replyTarget ? Number(replyTarget.id) : undefined;
    try {
      await createApiComment(Number(selectedPost.id), currentUser.id, commentDraft.trim(), parentId);
      setCommentDraft('');
      setReplyTarget(null);
      fetchBalance(currentUser.id);
    } catch (err) {
      toast.warning((err as Error).message);
    }
  };

  // Determine comment input cost label (S6: updated costs)
  const commentCostLabel = () => {
    if (!selectedPost) return '';
    if (replyTarget) return '10 sat';
    if (selectedPost.type === 'Question') return '50 sat';  // Answer
    return '20 sat';  // Comment
  };

  const renderPostDetail = () => {
    if (!selectedPost) return null;
    const topLevel = apiComments.filter(c => !c.parent_id);
    const replies = apiComments.filter(c => c.parent_id);

    return (
      <div className="fixed inset-0 z-[60] bg-black overflow-y-auto">
        <div className="p-4 sticky top-0 bg-black/80 backdrop-blur-md border-b border-zinc-900 flex items-center justify-between">
          <button onClick={() => { setCurrentView('MAIN'); usePostStore.getState().clearCurrentPost(); }}><ArrowLeft /></button>
          <span className="font-black italic tracking-tighter uppercase">Thread</span>
          <button><MoreHorizontal /></button>
        </div>
        <div className="p-4 pb-28">
          <PostCard post={selectedPost} />



          {apiComments.length > 0 && (
            <div className="mt-8 border-t border-zinc-900 pt-6">
              <h3 className="text-sm font-black mb-4 uppercase tracking-wider text-zinc-500">
                Discussion · {apiComments.length}
              </h3>
              {topLevel.map(c => (
                <div key={c.id}>
                  {renderCommentItem(c)}
                  {replies.filter(r => r.parent_id === c.id).map(r => renderCommentItem(r))}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-zinc-950 border-t border-zinc-900 flex items-center gap-3">
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
              onKeyDown={(e) => e.key === 'Enter' && handleSubmitComment()}
              placeholder={replyTarget ? `Reply to ${replyTarget.handle}...` : 'Add your insight...'}
              className="w-full bg-zinc-900 rounded-xl px-4 py-3 text-sm"
            />
          </div>
          <div className="flex flex-col items-center gap-1">
            <button className="bg-orange-500 p-3 rounded-xl" onClick={handleSubmitComment}><Send size={18} /></button>
            <span className="text-[9px] text-zinc-500 font-medium">{commentCostLabel()}</span>
          </div>
        </div>
      </div>
    );
  };

  const renderQADetail = () => {
    if (!selectedPost) return null;
    const answers = apiComments.filter(c => !c.parent_id);
    const answerReplies = apiComments.filter(c => c.parent_id);

    return (
      <div className="fixed inset-0 z-[60] bg-black overflow-y-auto">
        <div className="p-4 sticky top-0 bg-black/80 backdrop-blur-md border-b border-zinc-900 flex items-center gap-4">
          <button onClick={() => { setCurrentView('MAIN'); usePostStore.getState().clearCurrentPost(); }}><ArrowLeft /></button>
          <span className="font-black italic tracking-tighter uppercase">Inquiry</span>
        </div>
        <div className="p-4 bg-orange-500/5 border-b border-orange-500/10 mb-4">
           <div className="bg-orange-500 text-white text-[10px] font-black px-2 py-1 rounded inline-block mb-3 uppercase tracking-widest">Question</div>
           <h2 className="text-xl font-bold mb-4">{selectedPost.content}</h2>
           <div className="flex items-center justify-between">
             <div className="flex items-center gap-2">
               <img src={selectedPost.author.avatar || `https://api.dicebear.com/7.x/identicon/svg?seed=${selectedPost.author.handle}`} className="w-6 h-6 rounded-full" />
               <span className="text-xs font-bold">{selectedPost.author.handle}</span>
             </div>
             {selectedPost.bounty ? (
               <div className="text-orange-500 font-black text-sm uppercase">💰 {selectedPost.bounty.toLocaleString()} sat bounty</div>
             ) : null}
           </div>
        </div>
        <div className="p-4 pb-28">

          <h3 className="text-xs font-black uppercase text-zinc-500 mb-4 tracking-widest">{answers.length} Answers</h3>
          {answers.map(answer => (
            <div key={answer.id} className="bg-zinc-900/50 border border-zinc-900 rounded-2xl p-4 mb-4">
               <div className="flex items-center gap-2 mb-3">
                  <div className={`w-8 h-8 rounded-full p-[2px] ${getTrustRingClass(answer.author.trust_score)} shrink-0`}>
                    <img
                      src={answer.author.avatar || `https://api.dicebear.com/7.x/identicon/svg?seed=${answer.author.handle}`}
                      className="w-full h-full rounded-full object-cover border border-zinc-900"
                    />
                  </div>
                  <div>
                    <span className="text-xs font-bold">{answer.author.name}</span>
                    <span className="text-[10px] text-zinc-500 italic block">@{answer.author.handle}</span>
                  </div>
               </div>
               <p className="text-sm text-zinc-200 leading-relaxed mb-3 break-words">{answer.content}</p>
               <div className="flex items-center gap-4">
                 <button
                   className={`flex items-center gap-1 text-[10px] font-bold ${answer.is_liked ? 'text-orange-400' : 'text-zinc-500'}`}
                   onClick={async () => {
                     if (!currentUser || !selectedPost) return;
                     try {
                       await toggleLikeComment(Number(selectedPost.id), answer.id, currentUser.id, answer.is_liked);
                       fetchBalance(currentUser.id);
                     } catch (err) { toast.warning((err as Error).message); }
                   }}
                 >
                   <Heart size={12} fill={answer.is_liked ? 'currentColor' : 'none'} /> {answer.likes_count}
                   <span className="text-zinc-600 ml-0.5">5</span>
                 </button>
                 <button
                   className="text-[10px] font-bold text-zinc-500 hover:text-zinc-300"
                   onClick={() => {
                     setReplyTarget(prev => prev?.id === String(answer.id) ? null : { id: String(answer.id), handle: `@${answer.author.handle}` });
                     if (!commentDraft.trim()) setCommentDraft(`@${answer.author.handle} `);
                   }}
                 >
                   Reply <span className="text-zinc-600">20</span>
                 </button>
               </div>
               {/* Sub-replies to this answer */}
               {answerReplies.filter(r => r.parent_id === answer.id).length > 0 && (
                 <div className="mt-3 pt-3 border-t border-zinc-800">
                   {answerReplies.filter(r => r.parent_id === answer.id).map(r => renderCommentItem(r))}
                 </div>
               )}
            </div>
          ))}
          {answers.length === 0 && (
            <p className="text-zinc-600 text-sm text-center py-4">No answers yet. Be the first!</p>
          )}
        </div>
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-zinc-950 border-t border-zinc-900 flex items-center gap-3">
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
              onKeyDown={(e) => e.key === 'Enter' && handleSubmitComment()}
              placeholder={replyTarget ? `Reply to ${replyTarget.handle}...` : 'Submit your answer...'}
              className="w-full bg-zinc-900 rounded-xl px-4 py-3 text-sm"
            />
          </div>
          <div className="flex flex-col items-center gap-1">
            <button className="bg-orange-500 p-3 rounded-xl" onClick={handleSubmitComment}><Send size={18} /></button>
            <span className="text-[9px] text-zinc-500 font-medium">{commentCostLabel()}</span>
          </div>
        </div>
      </div>
    );
  };

  const renderTrustDetail = () => {
    const tb = trustBreakdown;
    const uc = userCosts;
    const trustScore = tb?.trust_score ?? currentMe.trustScore;
    const tier = tb?.tier ?? getTrustTier(trustScore);
    const strokeColor = getTrustStrokeColor(trustScore);
    const badgeBg = getTrustBadgeBg(trustScore);

    const dimensions = [
      { label: 'Creator', score: tb?.creator_score ?? 500, desc: 'Post quality & engagement', color: 'text-orange-400' },
      { label: 'Curator', score: tb?.curator_score ?? 500, desc: 'Like accuracy (liked good posts)', color: 'text-blue-400' },
      { label: 'Juror', score: tb?.juror_score ?? 500, desc: 'Challenge judgement accuracy', color: 'text-purple-400' },
      { label: 'Risk', score: tb?.risk_score ?? 0, desc: 'Spam / violation penalty (lower=better)', color: 'text-red-400', inverted: true },
    ];

    return (
      <div className="p-4 pb-28">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => setCurrentView('MAIN')} className="text-zinc-500"><ArrowLeft size={20} /></button>
          <h2 className="text-lg font-black tracking-tight">Trust Score</h2>
        </div>

        {/* Big ring */}
        <div className="flex flex-col items-center mb-8">
          <div className="relative w-36 h-36 mb-3">
            <svg className="absolute inset-0 w-full h-full transform -rotate-90">
              <circle cx="72" cy="72" r="64" stroke="currentColor" strokeWidth="7" fill="transparent" className="text-zinc-800" />
              <circle cx="72" cy="72" r="64" stroke={strokeColor} strokeWidth="7" fill="transparent" strokeDasharray={402} strokeDashoffset={402 * (1 - trustScore / 1000)} strokeLinecap="round" />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-black">{trustScore}</span>
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">/1000</span>
            </div>
          </div>
          <span className={`text-xs font-black uppercase tracking-widest ${badgeBg} text-white px-3 py-1 rounded-full`}>{tier}</span>
        </div>

        {/* Fee multiplier */}
        {uc && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 mb-6">
            <div className="flex justify-between items-center mb-2">
              <span className="text-[10px] text-zinc-500 font-bold uppercase">Fee Multiplier</span>
              <span className="text-lg font-black">{uc.fee_multiplier}×</span>
            </div>
            <p className="text-[10px] text-zinc-600">
              {uc.fee_multiplier < 1 ? 'You pay less than base cost — high trust discount!' : uc.fee_multiplier > 1 ? 'You pay more than base — build trust to reduce fees.' : 'Standard rate.'}
            </p>
          </div>
        )}

        {/* Sub-scores */}
        <div className="space-y-3 mb-6">
          <h3 className="text-xs font-bold uppercase text-zinc-500 tracking-wider">Dimensions</h3>
          {dimensions.map((d) => (
            <div key={d.label} className="bg-zinc-950/50 border border-zinc-900 rounded-xl p-3">
              <div className="flex justify-between items-center mb-1">
                <span className={`text-sm font-bold ${d.color}`}>{d.label}</span>
                <span className="text-sm font-black text-zinc-200">{d.score}</span>
              </div>
              <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden mb-1">
                <div
                  className={`h-full rounded-full ${d.inverted ? 'bg-red-500' : 'bg-gradient-to-r from-zinc-600 to-green-500'}`}
                  style={{ width: `${(d.score / 1000) * 100}%` }}
                />
              </div>
              <span className="text-[10px] text-zinc-600">{d.desc}</span>
            </div>
          ))}
        </div>

        {/* Dynamic costs */}
        {uc && (
          <div>
            <h3 className="text-xs font-bold uppercase text-zinc-500 tracking-wider mb-3">Your Action Costs</h3>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'Post', base: 50, cost: uc.costs.post },
                { label: 'Question', base: 100, cost: uc.costs.question },
                { label: 'Answer', base: 50, cost: uc.costs.answer },
                { label: 'Comment', base: 20, cost: uc.costs.comment },
                { label: 'Reply', base: 10, cost: uc.costs.reply },
                { label: 'Like Post', base: 20, cost: uc.costs.like_post },
                { label: 'Like Comment', base: 10, cost: uc.costs.like_comment },
              ].map((c) => (
                <div key={c.label} className="bg-zinc-950/50 border border-zinc-900 rounded-xl p-3">
                  <span className="text-[10px] text-zinc-500 font-bold uppercase block">{c.label}</span>
                  <div className="flex items-baseline gap-1.5 mt-0.5">
                    <span className="text-sm font-black text-zinc-100">{c.cost} sat</span>
                    {c.cost !== c.base && (
                      <span className={`text-[10px] font-medium ${c.cost < c.base ? 'text-green-500' : 'text-red-400'}`}>
                        {c.cost < c.base ? '↓' : '↑'}{Math.abs(c.cost - c.base)}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderTransactions = () => {
    const actionLabel = (t: string) => {
      const map: Record<string, string> = {
        free_post: 'Free Post',
        reward_post: 'Post Reward',
        reward_comment: 'Comment Reward',
        spend_post: 'Post',
        spend_question: 'Question',
        spend_answer: 'Answer',
        spend_comment: 'Comment',
        spend_reply: 'Reply',
        spend_like: 'Like',
        spend_comment_like: 'Comment Like',
        spend_boost: 'Boost',
        fine: 'Fine',
        challenge_fee: 'Challenge Fee',
        challenge_refund: 'Challenge Refund',
        challenge_reward: 'Challenge Reward',
        deposit: 'Deposit',
        withdraw: 'Withdraw',
      };
      return map[t] || t;
    };

    return (
      <div className="fixed inset-0 z-[60] bg-black overflow-y-auto">
        <div className="p-4 sticky top-0 bg-black/80 backdrop-blur-md border-b border-zinc-900 flex items-center gap-4">
          <button onClick={() => setCurrentView('MAIN')}><ArrowLeft /></button>
          <h2 className="text-xl font-black italic tracking-tighter uppercase">Transactions</h2>
        </div>
        
        <div className="p-4">
          <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-2xl mb-6">
            <span className="text-zinc-500 text-[10px] font-bold uppercase block mb-1">Balance</span>
            <span className="text-2xl font-black text-zinc-100">{availableBalance.toLocaleString()} <span className="text-orange-500 text-sm">sat</span></span>
          </div>

          <div className="space-y-3">
            {ledgerEntries.length === 0 && (
              <p className="text-zinc-600 text-center py-8">No transactions yet</p>
            )}
            {ledgerEntries.map(tx => (
              <div key={tx.id} className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-bold text-zinc-200">{tx.note || actionLabel(tx.action_type)}</span>
                  <span className={`text-sm font-black ${tx.amount > 0 ? 'text-green-500' : 'text-red-400'}`}>
                    {tx.amount > 0 ? '+' : ''}{tx.amount} sat
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-zinc-600">{new Date(tx.created_at).toLocaleString()}</span>
                  <span className="text-[10px] text-zinc-600">{tx.balance_after.toLocaleString()} sat</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const renderInvite = () => {
    const inviteCode = 'BITLINK-' + Math.random().toString(36).substring(2, 8).toUpperCase();
    const inviteLink = `https://bitlink.app/invite/${inviteCode}`;
    
    return (
      <div className="fixed inset-0 z-[60] bg-black overflow-y-auto">
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

    const isNote = publishType === 'Note';
    const accentBg = isNote ? 'bg-orange-500' : 'bg-blue-500';
    const accentText = isNote ? 'text-orange-500' : 'text-blue-400';
    const accentBorder = isNote ? 'border-orange-500/30' : 'border-blue-500/30';
    const accentGlow = isNote ? 'shadow-orange-500/30' : 'shadow-blue-500/30';
    const freePost = currentUser?.free_posts_remaining && currentUser.free_posts_remaining > 0;

    const handlePublish = async () => {
      if (!publishContent.trim() || !currentUser) return;
      setIsSubmitting(true);
      try {
        const bounty = publishType === 'Question' && publishBounty ? parseInt(publishBounty) : undefined;
        await createApiPost(currentUser.id, publishContent, publishType === 'Note' ? 'note' : 'question', bounty);
        setPublishContent('');
        setPublishBounty('');
        setIsPublishing(false);
        setPublishType('Note');
        toast.success('Posted');
        // Refresh feed and balance
        fetchPosts({ user_id: currentUser.id });
        if (currentUser) {
          fetchBalance(currentUser.id);
          fetchLedger(currentUser.id);
        }
      } catch (err) {
        const msg = (err as Error).message || 'Failed to publish';
        if (msg.includes('Insufficient balance')) {
          toast.warning(msg);
        } else {
          toast.error(msg);
        }
      } finally {
        setIsSubmitting(false);
      }
    };

    return (
      <div className={`fixed inset-0 z-[100] bg-black flex flex-col`}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <button
            onClick={() => { setIsPublishing(false); setPublishContent(''); setPublishBounty(''); setPublishType('Note'); }}
            className="p-2 text-zinc-400"
          >
            <X size={24} />
          </button>

          {/* Type toggle */}
          <div className="flex bg-zinc-900 rounded-xl p-1 gap-1">
            <button
              onClick={() => setPublishType('Note')}
              className={`px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-tight transition-all duration-200 ${
                isNote ? 'bg-orange-500 text-white' : 'text-zinc-500'
              }`}
            >
              Note
            </button>
            <button
              onClick={() => setPublishType('Question')}
              className={`px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-tight transition-all duration-200 ${
                !isNote ? 'bg-blue-500 text-white' : 'text-zinc-500'
              }`}
            >
              Inquiry
            </button>
          </div>

          <button
            data-testid="publish-button"
            onClick={handlePublish}
            disabled={!publishContent.trim() || isSubmitting}
            className={`px-5 py-2 rounded-xl text-sm font-black uppercase tracking-tight transition-all duration-200 ${
              publishContent.trim()
                ? `${accentBg} text-white shadow-lg ${accentGlow} active:scale-95`
                : 'bg-zinc-800 text-zinc-600'
            }`}
          >
            {isSubmitting ? '...' : 'Post'}
          </button>
        </div>

        {/* Accent line */}
        <div className={`h-0.5 ${isNote ? 'bg-gradient-to-r from-orange-500/50 via-orange-500 to-orange-500/50' : 'bg-gradient-to-r from-blue-500/50 via-blue-500 to-blue-500/50'}`} />

        {/* Editor */}
        <div className="flex-1 px-4 pt-4 overflow-auto">
          <div className="flex items-start gap-3 mb-4">
            <img
              src={currentMe.avatar || 'https://picsum.photos/200'}
              className={`w-10 h-10 rounded-full border-2 ${isNote ? 'border-orange-500/50' : 'border-blue-500/50'} object-cover flex-shrink-0`}
            />
            <div className="flex-1 min-w-0">
              <span className="text-sm font-bold text-zinc-300 block">{currentMe.name}</span>
              <span className="text-[11px] text-zinc-500 font-medium">
                {freePost
                  ? 'free · 1 remaining'
                  : `${isNote ? (userCosts?.costs.post ?? 50) : (userCosts?.costs.question ?? 100)} sat · ${availableBalance.toLocaleString()} available`
                }
              </span>
            </div>
          </div>

          <textarea
            data-testid="post-content"
            autoFocus
            value={publishContent}
            onChange={(e) => setPublishContent(e.target.value)}
            className={`w-full bg-transparent border-none outline-none text-lg leading-relaxed resize-none min-h-[200px] ${
              isNote ? 'placeholder:text-orange-500/30' : 'placeholder:text-blue-400/30'
            }`}
            placeholder={isNote ? "What's the signal?" : 'What do you need to know?'}
          />

          {publishType === 'Question' && (
            <div className={`mt-4 flex items-center justify-between p-4 bg-blue-500/10 border ${accentBorder} rounded-2xl`}>
              <span className="text-sm font-bold text-blue-400">Bounty (optional)</span>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={publishBounty}
                  onChange={(e) => setPublishBounty(e.target.value)}
                  placeholder="0"
                  className="w-20 bg-transparent border-none outline-none text-right text-xl font-black text-white"
                />
                <span className="text-[10px] font-black uppercase text-blue-400">sat</span>
              </div>
            </div>
          )}
        </div>

        <div className="px-4 pb-8" />
      </div>
    );
  };

  const renderChatDetail = () => {
    if (!selectedChat) return null;
    const chatPartner = selectedChat.participants.find(p => p.id !== currentMe.id) || selectedChat.participants[0];
    const isGroup = Boolean(selectedChat.isGroup);
    const selectedMessage = chatMessages.find(m => m.id === selectedMessageId);

    // Check if message can be retreated (within 3 minutes)
    const canRetreat = (msg: typeof chatMessages[0]) => {
      if (!msg.createdAt) return false;
      const msgTime = new Date(msg.createdAt).getTime();
      const now = Date.now();
      return (now - msgTime) < 3 * 60 * 1000; // 3 minutes
    };

    const handleSendMessage = async () => {
      if (!chatMessageInput.trim() || !currentUser) return;

      const content = chatMessageInput.trim();
      const replyId = replyingTo?.id ? Number(replyingTo.id) : undefined;
      setChatMessageInput('');
      setReplyingTo(null);

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

        // Send the message with reply_to_id if replying
        const msgs = await api.sendMessage(Number(sessionId), currentUser.id, content, replyId);
        setChatMessages(prev => {
          const existingIds = new Set(prev.map(m => Number(m.id)));
          const newMsgs = msgs
            .filter(m => !existingIds.has(m.id))
            .map(m => ({ 
              id: m.id, 
              senderId: m.sender_id, 
              content: m.content, 
              messageType: m.message_type,
              status: m.status,
              createdAt: m.created_at,
              replyTo: m.reply_to ? { id: m.reply_to.id, content: m.reply_to.content, sender_name: m.reply_to.sender_name } : null,
            }));
          return [...prev, ...newMsgs];
        });
        // Update session's last message preview
        updateSessionLastMessage(Number(sessionId), content);
      } catch (error) {
          console.error('Failed to send message:', error);
          toast.error('Failed to send message');
      }
    };

    const handleOpenProfile = () => {
      if (!isGroup) {
        setSelectedUser(chatPartner);
        setCurrentView('USER_PROFILE');
      }
    };

    const handleMessageAction = (action: string) => {
      if (!selectedMessage) return;
      
      switch (action) {
        case 'copy':
          navigator.clipboard.writeText(selectedMessage.content);
          toast.success('Copied to clipboard');
          break;
        case 'reply':
          setReplyingTo({ id: selectedMessage.id, content: selectedMessage.content });
          break;
        case 'forward':
          toast.info('Forward feature coming soon');
          break;
        case 'retreat':
          if (canRetreat(selectedMessage)) {
            setChatMessages(prev => prev.filter(m => m.id !== selectedMessage.id));
            toast.success('Message retreated');
          } else {
            toast.error('Can only retreat messages within 3 minutes');
          }
          break;
        case 'delete':
          setChatMessages(prev => prev.filter(m => m.id !== selectedMessage.id));
          toast.success('Deleted for you');
          break;
      }
      setSelectedMessageId(null);
      setMenuPosition(null);
    };

    const handleReaction = async (emoji: string) => {
      if (!selectedMessage || !currentUser) return;
      const messageId = selectedMessage.id;
      const myId = Number(currentUser.id);
      setSelectedMessageId(null);
      setMenuPosition(null);
      
      // Optimistically update UI BEFORE API call
      const wasAdding = !chatMessages.find(m => Number(m.id) === Number(messageId))
        ?.reactions?.some(r => Number(r.user_id) === myId && r.emoji === emoji);

      setChatMessages(prev => prev.map(m => {
        if (Number(m.id) === Number(messageId)) {
          const reactions = [...(m.reactions || [])];
          const existingIdx = reactions.findIndex(r => r.emoji === emoji && Number(r.user_id) === myId);
          if (existingIdx >= 0) {
            reactions.splice(existingIdx, 1);
          } else {
            reactions.push({ emoji, user_id: myId, user_name: currentUser.name });
          }
          return { ...m, reactions };
        }
        return m;
      }));
      
      try {
        await api.addReaction(Number(messageId), myId, emoji);
      } catch (error) {
        console.error('Failed to add reaction:', error);
        toast.error('Failed to add reaction');
        // Revert optimistic update on error
        setChatMessages(prev => prev.map(m => {
          if (Number(m.id) === Number(messageId)) {
            if (wasAdding) {
              // We added it optimistically, remove it
              const reactions = (m.reactions || []).filter(
                r => !(r.emoji === emoji && Number(r.user_id) === myId)
              );
              return { ...m, reactions };
            } else {
              // We removed it optimistically, re-add it
              const reactions = [...(m.reactions || []), { emoji, user_id: myId, user_name: currentUser.name }];
              return { ...m, reactions };
            }
          }
          return m;
        }));
      }
    };

    // Toggle reaction when clicking on existing reaction badge (only affects YOUR reaction)
    const toggleReactionBadge = async (messageId: string | number, emoji: string) => {
      if (!currentUser) return;
      const myId = Number(currentUser.id);
      
      // Check if we're adding or removing BEFORE the optimistic update
      const wasAdding = !chatMessages.find(m => Number(m.id) === Number(messageId))
        ?.reactions?.some(r => Number(r.user_id) === myId && r.emoji === emoji);

      // Optimistically toggle only MY reaction
      setChatMessages(prev => prev.map(m => {
        if (Number(m.id) === Number(messageId)) {
          const reactions = [...(m.reactions || [])];
          const existingIdx = reactions.findIndex(r => r.emoji === emoji && Number(r.user_id) === myId);
          if (existingIdx >= 0) {
            reactions.splice(existingIdx, 1);
          } else {
            reactions.push({ emoji, user_id: myId, user_name: currentUser.name });
          }
          return { ...m, reactions };
        }
        return m;
      }));
      
      try {
        await api.addReaction(Number(messageId), myId, emoji);
      } catch (error) {
        console.error('Failed to toggle reaction:', error);
        // Revert optimistic update on error
        setChatMessages(prev => prev.map(m => {
          if (Number(m.id) === Number(messageId)) {
            if (wasAdding) {
              const reactions = (m.reactions || []).filter(
                r => !(r.emoji === emoji && Number(r.user_id) === myId)
              );
              return { ...m, reactions };
            } else {
              const reactions = [...(m.reactions || []), { emoji, user_id: myId, user_name: currentUser.name }];
              return { ...m, reactions };
            }
          }
          return m;
        }));
      }
    };

    // Long press handlers for reaction badges
    const handleReactionBadgeLongPressStart = (messageId: string | number, emoji: string) => {
      reactionLongPressTriggered.current = false;
      reactionLongPressTimer.current = setTimeout(() => {
        reactionLongPressTriggered.current = true;
        setShowReactorsFor({ messageId, emoji });
      }, 500);
    };

    const handleReactionBadgeLongPressEnd = () => {
      if (reactionLongPressTimer.current) {
        clearTimeout(reactionLongPressTimer.current);
        reactionLongPressTimer.current = null;
      }
    };

    const handleReactionBadgeClick = (e: React.MouseEvent, messageId: string | number, emoji: string) => {
      e.stopPropagation();
      if (!reactionLongPressTriggered.current) {
        toggleReactionBadge(messageId, emoji);
      }
      reactionLongPressTriggered.current = false;
    };

    const handleAttachment = (type: 'camera' | 'album') => {
      setShowAttachmentPicker(false);
      toast.info(`${type === 'camera' ? 'Camera' : 'Album'} feature coming soon`);
    };

    // Handler to open group info page
    const handleOpenGroupInfo = async () => {
      if (!selectedChat || !currentUser) return;
      setIsLoadingGroupDetail(true);
      setCurrentView('GROUP_INFO');
      try {
        const detail = await api.getGroupDetail(Number(selectedChat.id), currentUser.id);
        setGroupDetail(detail);
      } catch (error) {
        console.error('Failed to load group detail:', error);
        toast.error('Failed to load group info');
      } finally {
        setIsLoadingGroupDetail(false);
      }
    };

    return (
      <div className="fixed inset-0 z-[60] bg-black flex flex-col">
        {/* Header */}
        <div className="p-4 bg-black/80 backdrop-blur-md border-b border-zinc-900 flex items-center gap-4">
          <button onClick={() => { setCurrentView('MAIN'); setSelectedMessageId(null); setReplyingTo(null); }}><ArrowLeft /></button>
          <button
            className="flex items-center gap-3"
            onClick={isGroup ? handleOpenGroupInfo : handleOpenProfile}
          >
            {isGroup ? (
              <div className="relative w-10 h-10">
                <img src={selectedChat.participants[0]?.avatar || `https://picsum.photos/id/10/200/200`} className="w-7 h-7 rounded-full border border-zinc-800 absolute top-0 left-0" />
                <img src={selectedChat.participants[1]?.avatar || `https://picsum.photos/id/11/200/200`} className="w-7 h-7 rounded-full border border-zinc-800 absolute bottom-0 right-0" />
              </div>
            ) : (
              <img src={chatPartner?.avatar || `https://picsum.photos/id/${Number(chatPartner?.id) + 10}/200/200`} className="w-10 h-10 rounded-full border border-zinc-800 object-cover" />
            )}
            <div className="flex flex-col items-start">
              <span className="text-sm font-bold">{isGroup ? (selectedChat.name || 'Group Chat') : chatPartner?.name}</span>
              {isGroup && <span className="text-xs text-zinc-500">{selectedChat.participants.length} members</span>}
            </div>
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3" onClick={() => { setSelectedMessageId(null); setShowAttachmentPicker(false); }}>
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
          {/* Render all messages in chronological order */}
          {chatMessages.map(msg => {
            const isMe = msg.senderId === currentUser?.id || msg.senderId === currentMe.id;
            const isPending = msg.status === 'pending';
            const isSystem = msg.messageType === 'system';
            const isSelected = selectedMessageId === msg.id;

            // System message (warning banner style, in chat history)
            if (isSystem) {
              return (
                <div key={msg.id} className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 mx-2">
                  <p className="text-amber-400 text-xs text-center">
                    ⚠️ {msg.content}
                  </p>
                </div>
              );
            }

            // Pending message (not sent yet)
            if (isPending) {
              return (
                <div key={msg.id} className="flex items-end gap-2 justify-end">
                  <div className="flex flex-col gap-1 max-w-[70%] items-end">
                    <div className="px-4 py-2.5 text-sm break-words bg-red-900/50 text-red-300 border border-red-500/30 rounded-2xl rounded-br-sm">
                      {msg.content}
                    </div>
                    <span className="text-[10px] text-red-400 flex items-center gap-1">
                      <X size={10} /> Not sent
                    </span>
                  </div>
                </div>
              );
            }

            // Normal text message
            return (
              <div key={msg.id} ref={el => { messageRefs.current[String(msg.id)] = el; }} className={`flex items-end gap-2 ${isMe ? 'justify-end' : 'justify-start'} relative transition-colors duration-500 ${highlightedMsgId === msg.id ? 'bg-orange-500/15 rounded-xl' : ''}`}>
                {!isMe && (
                  <button onClick={handleOpenProfile} className="flex-shrink-0">
                    <img src={chatPartner?.avatar || `https://picsum.photos/id/${Number(chatPartner?.id) + 10}/200/200`} className="w-7 h-7 rounded-full border border-zinc-800 object-cover" />
                  </button>
                )}
                <div className={`flex flex-col gap-1 max-w-[70%] ${isMe ? 'items-end' : 'items-start'}`}>
                  {/* Reply preview - click to scroll to original */}
                  {msg.replyTo && (
                    <button
                      onClick={() => scrollToMessage(msg.replyTo!.id)}
                      className="text-[10px] text-zinc-500 bg-zinc-900/50 px-2 py-1 rounded-lg border-l-2 border-orange-500 text-left cursor-pointer hover:bg-zinc-800/60 transition-colors max-w-full"
                    >
                      <span className="text-orange-400 font-medium">{msg.replyTo.sender_name}</span>
                      <span className="ml-1 line-clamp-1">↩ {msg.replyTo.content}</span>
                    </button>
                  )}
                  <button
                    className={`px-4 py-2.5 text-sm break-words text-left select-none ${
                      isMe
                          ? 'bg-orange-600 text-white rounded-2xl rounded-br-sm'
                          : 'bg-zinc-900 text-zinc-200 rounded-2xl rounded-bl-sm'
                    } ${isSelected ? 'ring-2 ring-orange-400' : ''}`}
                    onClick={(e) => handleMessageClick(e, msg.id)}
                    onMouseDown={(e) => handleLongPressStart(msg.id, e)}
                    onMouseUp={handleLongPressEnd}
                    onMouseLeave={handleLongPressEnd}
                    onTouchStart={(e) => handleLongPressStart(msg.id, e)}
                    onTouchEnd={handleLongPressEnd}
                    onContextMenu={(e) => { 
                      e.preventDefault(); 
                      const rect = e.currentTarget.getBoundingClientRect();
                      setSelectedMessageId(msg.id); 
                      setMenuPosition({ x: rect.left + rect.width / 2, y: rect.bottom + 8 }); 
                      setEmojiPage(0);
                    }}
                  >
                    {msg.content}
                  </button>
                  {/* Reactions display */}
                  {msg.reactions && msg.reactions.length > 0 && (
                    <div className="flex gap-1 flex-wrap relative">
                      {Object.entries(
                        msg.reactions.reduce((acc, r) => {
                          if (!acc[r.emoji]) acc[r.emoji] = [];
                          acc[r.emoji].push({ user_id: Number(r.user_id), user_name: r.user_name });
                          return acc;
                        }, {} as Record<string, Array<{user_id: number; user_name: string}>>)
                      ).map(([emoji, reactors]) => {
                        const hasMyReaction = currentUser ? reactors.some(r => Number(r.user_id) === Number(currentUser.id)) : false;
                        return (
                          <button
                            key={emoji}
                            className={`text-xs px-1.5 py-0.5 rounded-full flex items-center gap-0.5 select-none transition-colors ${
                              hasMyReaction ? 'bg-orange-500/30 border border-orange-500/50' : 'bg-zinc-800 border border-transparent'
                            }`}
                            onClick={(e) => handleReactionBadgeClick(e, msg.id, emoji)}
                            onMouseDown={() => handleReactionBadgeLongPressStart(msg.id, emoji)}
                            onMouseUp={handleReactionBadgeLongPressEnd}
                            onMouseLeave={handleReactionBadgeLongPressEnd}
                            onTouchStart={() => handleReactionBadgeLongPressStart(msg.id, emoji)}
                            onTouchEnd={handleReactionBadgeLongPressEnd}
                          >
                            <span>{emoji}</span>
                            {reactors.length > 1 && <span className="text-zinc-400 min-w-[0.75rem] text-center">{reactors.length}</span>}
                          </button>
                        );
                      })}
                      
                      {/* Reactors popup on long press */}
                      {showReactorsFor?.messageId === msg.id && (
                        <>
                          <div className="fixed inset-0 z-40" onClick={() => setShowReactorsFor(null)} />
                          <div className="absolute bottom-full mb-2 left-0 bg-zinc-900 border border-zinc-700 rounded-xl p-3 shadow-xl z-50 min-w-[160px]">
                            <div className="text-sm font-bold mb-2 flex items-center gap-2">
                              <span className="text-lg">{showReactorsFor.emoji}</span>
                              <span className="text-zinc-400">Reactions</span>
                            </div>
                            <div className="space-y-2 max-h-40 overflow-y-auto">
                              {msg.reactions
                                .filter(r => r.emoji === showReactorsFor.emoji)
                                .map((r, idx) => (
                                  <div key={`${r.user_id}-${idx}`} className="flex items-center gap-2">
                                    <div className="w-6 h-6 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-bold">
                                      {r.user_name?.charAt(0)?.toUpperCase() || '?'}
                                    </div>
                                    <span className="text-sm text-zinc-300">{r.user_name}</span>
                                    {currentUser && Number(r.user_id) === Number(currentUser.id) && (
                                      <span className="text-[10px] text-orange-400">(you)</span>
                                    )}
                                  </div>
                                ))
                              }
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Message action menu - positioned below message */}
                {isSelected && menuPosition && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); setSelectedMessageId(null); setMenuPosition(null); }} />
                    <div 
                      className="fixed z-50 bg-zinc-900 border border-zinc-800 rounded-xl shadow-xl overflow-hidden"
                      style={{
                        left: Math.min(Math.max(menuPosition.x, 120), window.innerWidth - 120),
                        top: Math.min(menuPosition.y, window.innerHeight - 280),
                        transform: 'translateX(-50%)',
                        minWidth: '200px',
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {/* Emoji reactions row */}
                      <div className="px-3 py-2 flex items-center gap-1 border-b border-zinc-800">
                        {defaultReactions.slice(emojiPage * 5, emojiPage * 5 + 5).map(emoji => (
                          <button
                            key={emoji}
                            className="text-xl hover:scale-125 transition-transform active:scale-90 p-1"
                            onClick={() => handleReaction(emoji)}
                          >
                            {emoji}
                          </button>
                        ))}
                        <button
                          className="text-zinc-400 hover:text-zinc-200 px-2 text-lg font-bold"
                          onClick={() => setEmojiPage(p => (p + 1) % 2)}
                        >
                          ···
                        </button>
                      </div>
                      {/* Action buttons */}
                      <button className="w-full px-4 py-3 text-left text-sm text-zinc-200 hover:bg-zinc-800 flex items-center gap-3" onClick={() => handleMessageAction('reply')}>
                        <Reply size={16} className="text-orange-400" /> Reply
                      </button>
                      <button className="w-full px-4 py-3 text-left text-sm text-zinc-200 hover:bg-zinc-800 flex items-center gap-3" onClick={() => handleMessageAction('forward')}>
                        <Forward size={16} className="text-orange-400" /> Forward
                      </button>
                      <button className="w-full px-4 py-3 text-left text-sm text-zinc-200 hover:bg-zinc-800 flex items-center gap-3" onClick={() => handleMessageAction('copy')}>
                        <Copy size={16} className="text-orange-400" /> Copy
                      </button>
                      {isMe && canRetreat(msg) && (
                        <button className="w-full px-4 py-3 text-left text-sm text-zinc-200 hover:bg-zinc-800 flex items-center gap-3" onClick={() => handleMessageAction('retreat')}>
                          <Undo2 size={16} className="text-amber-400" /> Retreat
                        </button>
                      )}
                      <button className="w-full px-4 py-3 text-left text-sm text-red-400 hover:bg-zinc-800 flex items-center gap-3" onClick={() => handleMessageAction('delete')}>
                        <Trash2 size={16} /> Delete for me
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>

        {/* Reply preview bar */}
        {replyingTo && (
          <div className="px-4 py-2 bg-zinc-900 border-t border-zinc-800 flex items-center gap-3">
            <div className="flex-1 text-sm text-zinc-400 truncate">
              <span className="text-orange-400">↩ Replying:</span> {replyingTo.content.slice(0, 50)}{replyingTo.content.length > 50 ? '...' : ''}
            </div>
            <button onClick={() => setReplyingTo(null)} className="text-zinc-500 hover:text-zinc-300">
              <X size={16} />
            </button>
          </div>
        )}

        {/* Attachment picker */}
        {showAttachmentPicker && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setShowAttachmentPicker(false)} />
            <div className="absolute bottom-24 right-16 bg-zinc-900 border border-zinc-800 rounded-xl shadow-xl overflow-hidden z-20">
              <button 
                className="w-full px-4 py-3 text-left text-sm text-zinc-200 hover:bg-zinc-800 flex items-center gap-3"
                onClick={() => handleAttachment('camera')}
              >
                <Camera size={18} className="text-orange-400" /> Camera
              </button>
              <button 
                className="w-full px-4 py-3 text-left text-sm text-zinc-200 hover:bg-zinc-800 flex items-center gap-3"
                onClick={() => handleAttachment('album')}
              >
                <Image size={18} className="text-orange-400" /> Album
              </button>
            </div>
          </>
        )}

        {/* Emoji picker */}
        {showEmojiPicker && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setShowEmojiPicker(false)} />
            <div className="absolute bottom-24 right-4 bg-zinc-900 border border-zinc-800 rounded-xl shadow-xl p-3 z-20">
              <div className="grid grid-cols-5 gap-2">
                {defaultReactions.map(emoji => (
                  <button
                    key={emoji}
                    className="text-2xl hover:scale-110 transition-transform active:scale-90 p-1"
                    onClick={() => { setChatMessageInput(prev => prev + emoji); setShowEmojiPicker(false); }}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Input */}
        {selectedChat && (removedFromSessions.has(Number(selectedChat.id)) || chatSessions.find(s => Number(s.id) === Number(selectedChat.id))?.userHasLeft) ? (
          <div className="p-4 bg-black border-t border-zinc-900 safe-bottom-nav">
            <div className="bg-zinc-900 rounded-xl px-4 py-3 text-center text-zinc-500 text-sm">
              You were removed from this group
            </div>
          </div>
        ) : (
          <div className="p-4 bg-black border-t border-zinc-900 flex items-center gap-3 safe-bottom-nav">
            <div className="flex-1 bg-zinc-900 rounded-xl px-4 py-3 flex items-center">
              <input 
                value={chatMessageInput}
                onChange={(e) => setChatMessageInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                placeholder={replyingTo ? 'Reply...' : 'Message...'} 
                className="bg-transparent border-none outline-none text-sm w-full" 
              />
            </div>
            <button 
              className="p-2 text-zinc-400 hover:text-orange-400 transition-colors"
              onClick={(e) => { e.stopPropagation(); setShowEmojiPicker(prev => !prev); setShowAttachmentPicker(false); }}
            >
              <Smile size={22} />
            </button>
            {chatMessageInput.trim() ? (
              <button 
                onClick={handleSendMessage}
                className="bg-orange-500 p-3 rounded-xl text-white active:scale-90 transition-transform duration-200"
              >
                <Send size={18} />
              </button>
            ) : (
              <button 
                className="p-2 text-zinc-400 hover:text-orange-400 transition-colors"
                onClick={(e) => { e.stopPropagation(); setShowAttachmentPicker(prev => !prev); setShowEmojiPicker(false); }}
              >
                <Plus size={22} />
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  const handleFollowToggle = async () => {
    const profileUserId = selectedUser ? Number(selectedUser.id) : null;
    if (!currentUser || !profileUserId) return;
    try {
      if (isFollowingProfile) {
        await api.unfollowUser(profileUserId, currentUser.id);
        setIsFollowingProfile(false);
        toast.success('Unfollowed');
      } else {
        await api.followUser(profileUserId, currentUser.id);
        setIsFollowingProfile(true);
        toast.success('Followed!');
      }
      // Refresh permission
      const perm = await api.checkMessagePermission(currentUser.id, profileUserId);
      setProfileMsgPermission(perm);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleStartChat = async () => {
    if (!currentUser || !selectedUser) return;
    try {
      // Create or get existing session
      const session = await createApiSession(currentUser.id, [Number(selectedUser.id)]);
      setSelectedChat({
        id: String(session.id),
        participants: session.members.map((m: any) => apiUserToUser(m)),
        lastMessage: session.last_message || '',
        timestamp: session.last_message_at ? new Date(session.last_message_at).toLocaleTimeString() : 'now',
        unreadCount: session.unread_count,
      });
      setCurrentView('CHAT_DETAIL');
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  // Join Group via Invite Code
  const renderJoinGroup = () => {
    const handlePreview = async () => {
      if (!inviteCodeInput.trim()) return;
      try {
        const preview = await api.previewInvite(inviteCodeInput.trim());
        setInvitePreview(preview);
      } catch (error) {
        toast.error((error as Error).message);
      }
    };

    const handleJoin = async () => {
      if (!inviteCodeInput.trim() || !currentUser) return;
      setIsJoiningViaInvite(true);
      try {
        const result = await api.joinViaInvite(inviteCodeInput.trim(), currentUser.id);
        
        if (result.status === 'pending') {
          toast.success('Join request sent! Waiting for admin approval.');
          setInviteCodeInput('');
          setInvitePreview(null);
          setCurrentView('MAIN');
        } else {
          toast.success('Joined the group!');
          // Refresh sessions and navigate to the new group
          await fetchSessions(currentUser.id);
          const session = await api.getChatSession(result.session_id, currentUser.id);
          setSelectedChat({
            id: session.id,
            name: session.name,
            isGroup: true,
            participants: session.members.map(m => ({
              id: m.id,
              name: m.name,
              handle: m.handle,
              avatar: m.avatar,
              trustScore: m.trust_score,
            })) as any,
            lastMessage: session.last_message || '',
            timestamp: session.last_message_at || session.created_at,
            unreadCount: 0,
          });
          setInviteCodeInput('');
          setInvitePreview(null);
          setCurrentView('CHAT_DETAIL');
        }
      } catch (error) {
        toast.error((error as Error).message);
      } finally {
        setIsJoiningViaInvite(false);
      }
    };

    return (
      <div className="fixed inset-0 z-[60] bg-black flex flex-col">
        <div className="p-4 bg-black/80 backdrop-blur-md border-b border-zinc-900 flex items-center gap-4">
          <button onClick={() => { setCurrentView('MAIN'); setInvitePreview(null); setInviteCodeInput(''); }}><ArrowLeft /></button>
          <span className="font-bold">Join Group</span>
        </div>

        <div className="flex-1 p-4 flex flex-col">
          {/* Input */}
          <div className="space-y-3">
            <label className="text-sm text-zinc-400">Enter invite code</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={inviteCodeInput}
                onChange={(e) => setInviteCodeInput(e.target.value)}
                placeholder="e.g. abc123xyz"
                className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3"
              />
              <button
                onClick={handlePreview}
                className="px-4 bg-zinc-800 rounded-xl"
              >
                Preview
              </button>
            </div>
          </div>

          {/* Preview */}
          {invitePreview && (
            <div className="mt-6 bg-zinc-900/50 rounded-2xl p-6 flex flex-col items-center gap-4">
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center">
                {invitePreview.avatar ? (
                  <img src={invitePreview.avatar} className="w-20 h-20 rounded-full object-cover" />
                ) : (
                  <Users className="w-10 h-10 text-white" />
                )}
              </div>
              <h2 className="text-xl font-bold">{invitePreview.group_name || 'Unnamed Group'}</h2>
              <p className="text-zinc-500">{invitePreview.member_count} members</p>
              {invitePreview.description && (
                <p className="text-zinc-400 text-sm text-center">{invitePreview.description}</p>
              )}
              {invitePreview.requires_approval && (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-2 text-amber-400 text-sm">
                  This group requires admin approval to join
                </div>
              )}
              <button
                onClick={handleJoin}
                disabled={isJoiningViaInvite}
                className="w-full py-3 bg-orange-500 rounded-xl font-bold mt-4 disabled:opacity-50"
              >
                {isJoiningViaInvite ? 'Joining...' : (invitePreview.requires_approval ? 'Request to Join' : 'Join Group')}
              </button>
            </div>
          )}

          {/* QR Scan Option */}
          <div className="mt-auto">
            <button
              onClick={() => setCurrentView('SCAN')}
              className="w-full py-4 bg-zinc-900 rounded-xl flex items-center justify-center gap-2 text-zinc-400"
            >
              <ScanLine className="w-5 h-5" />
              <span>Scan QR Code Instead</span>
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Group Info Page
  const renderGroupInfo = () => {
    if (!groupDetail || !selectedChat || !currentUser) return null;

    const isOwner = groupDetail.my_role === 'owner';
    const isAdmin = groupDetail.my_role === 'admin' || isOwner;

    const handleLeaveGroup = async () => {
      if (!confirm('Are you sure you want to leave this group?')) return;
      try {
        await api.leaveGroup(groupDetail.id, currentUser.id);
        toast.success('Left the group');
        setCurrentView('MAIN');
        setSelectedChat(null);
        setGroupDetail(null);
        fetchSessions(currentUser.id);
      } catch (error) {
        toast.error((error as Error).message);
      }
    };

    const handleDeleteGroup = async () => {
      if (!confirm('Are you sure you want to DELETE this group? This cannot be undone.')) return;
      try {
        await api.deleteGroup(groupDetail.id, currentUser.id);
        toast.success('Group deleted');
        setCurrentView('MAIN');
        setSelectedChat(null);
        setGroupDetail(null);
        fetchSessions(currentUser.id);
      } catch (error) {
        toast.error((error as Error).message);
      }
    };

    const handleSaveGroupEdit = async () => {
      try {
        await api.updateGroup(groupDetail.id, currentUser.id, {
          name: editGroupName,
          description: editGroupDescription,
        });
        setGroupDetail({ ...groupDetail, name: editGroupName, description: editGroupDescription });
        setIsEditingGroup(false);
        toast.success('Group updated');
      } catch (error) {
        toast.error((error as Error).message);
      }
    };

    const handleUpdateRole = async (targetUserId: number, newRole: 'admin' | 'member') => {
      try {
        await api.updateMemberRole(groupDetail.id, currentUser.id, targetUserId, newRole);
        setGroupDetail({
          ...groupDetail,
          members: groupDetail.members.map(m =>
            m.user.id === targetUserId ? { ...m, role: newRole } : m
          ),
        });
        toast.success(`Role updated to ${newRole}`);
        setShowMemberActions(null);
      } catch (error) {
        toast.error((error as Error).message);
      }
    };

    const handleRemoveMember = async (targetUserId: number) => {
      if (!confirm('Remove this member from the group?')) return;
      try {
        await api.removeMember(groupDetail.id, currentUser.id, targetUserId);
        setGroupDetail({
          ...groupDetail,
          members: groupDetail.members.filter(m => m.user.id !== targetUserId),
          member_count: groupDetail.member_count - 1,
        });
        toast.success('Member removed');
        setShowMemberActions(null);
      } catch (error) {
        toast.error((error as Error).message);
      }
    };

    const handleMuteMember = async (targetUserId: number, isMuted: boolean) => {
      try {
        await api.muteMember(groupDetail.id, currentUser.id, targetUserId, isMuted);
        setGroupDetail({
          ...groupDetail,
          members: groupDetail.members.map(m =>
            m.user.id === targetUserId ? { ...m, is_muted: isMuted } : m
          ),
        });
        toast.success(isMuted ? 'Member muted' : 'Member unmuted');
        setShowMemberActions(null);
      } catch (error) {
        toast.error((error as Error).message);
      }
    };

    const handleTransferOwnership = async (newOwnerId: number) => {
      if (!confirm('Transfer ownership to this member? You will become an admin.')) return;
      try {
        await api.transferOwnership(groupDetail.id, currentUser.id, newOwnerId);
        toast.success('Ownership transferred');
        // Reload group detail
        const detail = await api.getGroupDetail(groupDetail.id, currentUser.id);
        setGroupDetail(detail);
        setShowMemberActions(null);
      } catch (error) {
        toast.error((error as Error).message);
      }
    };

    const handleCreateInviteLink = async () => {
      try {
        const link = await api.createInviteLink(groupDetail.id, currentUser.id);
        setInviteLinks([link, ...inviteLinks]);
        const fullUrl = `${window.location.origin}/join/${link.code}`;
        await navigator.clipboard.writeText(fullUrl);
        toast.success('Invite link copied to clipboard!');
      } catch (error) {
        toast.error((error as Error).message);
      }
    };

    const handleLoadInviteLinks = async () => {
      try {
        const links = await api.getInviteLinks(groupDetail.id, currentUser.id);
        setInviteLinks(links);
        setShowInviteLinks(true);
      } catch (error) {
        toast.error((error as Error).message);
      }
    };

    const handleAddMembers = async () => {
      if (selectedNewMembers.size === 0) return;
      try {
        await api.addMembers(groupDetail.id, currentUser.id, Array.from(selectedNewMembers));
        toast.success('Members added');
        // Reload group detail
        const detail = await api.getGroupDetail(groupDetail.id, currentUser.id);
        setGroupDetail(detail);
        setShowAddMembersModal(false);
        setSelectedNewMembers(new Set());
        setAddMemberSearch('');
      } catch (error) {
        toast.error((error as Error).message);
      }
    };

    const handleLoadJoinRequests = async () => {
      setIsLoadingJoinRequests(true);
      try {
        const requests = await api.getJoinRequests(groupDetail.id, currentUser.id);
        setJoinRequests(requests);
      } catch (error) {
        toast.error((error as Error).message);
      } finally {
        setIsLoadingJoinRequests(false);
      }
    };

    const handleJoinRequestAction = async (requestId: number, action: 'approve' | 'reject') => {
      try {
        await api.handleJoinRequest(groupDetail.id, requestId, currentUser.id, action);
        setJoinRequests(joinRequests.filter(r => r.id !== requestId));
        toast.success(action === 'approve' ? 'Member approved' : 'Request rejected');
        if (action === 'approve') {
          // Reload group detail to show new member
          const detail = await api.getGroupDetail(groupDetail.id, currentUser.id);
          setGroupDetail(detail);
        }
      } catch (error) {
        toast.error((error as Error).message);
      }
    };

    const getRoleIcon = (role: string) => {
      if (role === 'owner') return <Crown className="w-4 h-4 text-amber-400" />;
      if (role === 'admin') return <ShieldCheck className="w-4 h-4 text-blue-400" />;
      return null;
    };

    const handleSettingChange = async (setting: 'who_can_send' | 'who_can_add', value: string) => {
      try {
        await api.updateGroup(groupDetail.id, currentUser.id, { [setting]: value });
        setGroupDetail({ ...groupDetail, [setting]: value });
        setSettingsMenu(null);
        toast.success('Setting updated');
      } catch (error) {
        toast.error((error as Error).message);
      }
    };

    return (
      <div className="fixed inset-0 z-[60] bg-black flex flex-col">
        {/* Header */}
        <div className="p-4 bg-black border-b border-zinc-900 flex items-center gap-4">
          <button onClick={() => setCurrentView('CHAT_DETAIL')} className="p-1">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <span className="font-bold text-lg flex-1">Group Settings</span>
        </div>

        {isLoadingGroupDetail ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-orange-500/30 border-t-orange-500 rounded-full animate-spin" />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto pb-8">
            {/* Members Section */}
            <div className="p-4">
              <div className="bg-zinc-900/60 rounded-2xl p-4">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm font-medium text-zinc-400 uppercase tracking-wider">
                    Members · {groupDetail.member_count}
                  </span>
                </div>
                <div className="flex flex-wrap gap-3">
                  {groupDetail.members.slice(0, 12).map((member) => (
                    <button
                      key={member.user.id}
                      onClick={() => {
                        if (member.user.id !== currentUser.id) {
                          setSelectedUser(member.user as any);
                          setCurrentView('USER_PROFILE');
                        }
                      }}
                      className="flex flex-col items-center w-16 group"
                    >
                      <div className="relative mb-1">
                        <img
                          src={member.user.avatar || `https://picsum.photos/id/${member.user.id + 10}/200/200`}
                          className="w-14 h-14 rounded-xl object-cover border-2 border-zinc-800 group-hover:border-orange-500/50 transition-colors"
                        />
                        {member.role === 'owner' && (
                          <div className="absolute -top-1 -right-1 w-5 h-5 bg-gradient-to-br from-amber-400 to-orange-500 rounded-full flex items-center justify-center">
                            <Crown className="w-3 h-3 text-black" />
                          </div>
                        )}
                        {member.role === 'admin' && (
                          <div className="absolute -top-1 -right-1 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
                            <ShieldCheck className="w-3 h-3 text-white" />
                          </div>
                        )}
                      </div>
                      <span className="text-xs text-zinc-500 truncate w-full text-center">
                        {member.user.id === currentUser.id ? 'You' : member.user.name.split(' ')[0]}
                      </span>
                    </button>
                  ))}
                  {/* Add button */}
                  {(groupDetail.who_can_add === 'all' || isAdmin) && (
                    <button
                      onClick={() => setShowAddMembersModal(true)}
                      className="flex flex-col items-center w-16 group"
                    >
                      <div className="w-14 h-14 rounded-xl border-2 border-dashed border-zinc-700 group-hover:border-orange-500/50 flex items-center justify-center mb-1 transition-colors">
                        <Plus className="w-6 h-6 text-zinc-600 group-hover:text-orange-500 transition-colors" />
                      </div>
                      <span className="text-xs text-zinc-600">Add</span>
                    </button>
                  )}
                  {/* Remove button (admin only) */}
                  {isAdmin && groupDetail.members.length > 1 && (
                    <button
                      onClick={() => setShowMemberActions(-1)}
                      className="flex flex-col items-center w-16 group"
                    >
                      <div className="w-14 h-14 rounded-xl border-2 border-dashed border-zinc-700 group-hover:border-red-500/50 flex items-center justify-center mb-1 transition-colors">
                        <UserMinus className="w-6 h-6 text-zinc-600 group-hover:text-red-500 transition-colors" />
                      </div>
                      <span className="text-xs text-zinc-600">Remove</span>
                    </button>
                  )}
                </div>
                {groupDetail.member_count > 12 && (
                  <button className="w-full mt-4 py-2 text-sm text-orange-500 hover:text-orange-400 transition-colors">
                    View all {groupDetail.member_count} members →
                  </button>
                )}
              </div>
            </div>

            {/* Settings Section */}
            <div className="px-4">
              <div className="bg-zinc-900/60 rounded-2xl overflow-hidden">
                {/* Group Name */}
                <button
                  onClick={() => {
                    if (isAdmin) {
                      setEditGroupName(groupDetail.name || '');
                      setIsEditingGroup(true);
                    }
                  }}
                  className="w-full px-4 py-4 flex items-center justify-between hover:bg-zinc-800/50 transition-colors"
                >
                  <span className="text-zinc-300">Group Name</span>
                  <div className="flex items-center gap-2">
                    <span className="text-zinc-500 text-sm max-w-[180px] truncate">{groupDetail.name || 'Unnamed'}</span>
                    {isAdmin && <ArrowLeft className="w-4 h-4 text-zinc-600 rotate-180" />}
                  </div>
                </button>

                <div className="h-px bg-zinc-800 mx-4" />

                {/* Announcement */}
                <button
                  onClick={() => {
                    if (isAdmin) {
                      setEditGroupDescription(groupDetail.description || '');
                      setIsEditingGroup(true);
                    }
                  }}
                  className="w-full px-4 py-4 flex items-center justify-between hover:bg-zinc-800/50 transition-colors"
                >
                  <span className="text-zinc-300">Announcement</span>
                  <div className="flex items-center gap-2">
                    <span className="text-zinc-500 text-sm max-w-[180px] truncate">{groupDetail.description || 'None'}</span>
                    <ArrowLeft className="w-4 h-4 text-zinc-600 rotate-180" />
                  </div>
                </button>

                <div className="h-px bg-zinc-800 mx-4" />

                {/* Invite via Link */}
                <button
                  onClick={handleCreateInviteLink}
                  className="w-full px-4 py-4 flex items-center justify-between hover:bg-zinc-800/50 transition-colors"
                >
                  <span className="text-zinc-300">Invite via Link</span>
                  <div className="flex items-center gap-2">
                    <Link className="w-4 h-4 text-orange-500" />
                  </div>
                </button>

                {/* Admin Settings */}
                {isAdmin && (
                  <>
                    <div className="h-px bg-zinc-800 mx-4" />
                    <button
                      onClick={() => setSettingsMenu('who_can_send')}
                      className="w-full px-4 py-4 flex items-center justify-between hover:bg-zinc-800/50 transition-colors"
                    >
                      <span className="text-zinc-300">Who can send</span>
                      <div className="flex items-center gap-2">
                        <span className="text-orange-500 text-sm">
                          {groupDetail.who_can_send === 'all' ? 'Everyone' : 'Admins Only'}
                        </span>
                        <ArrowLeft className="w-4 h-4 text-zinc-600 rotate-180" />
                      </div>
                    </button>

                    <div className="h-px bg-zinc-800 mx-4" />
                    <button
                      onClick={() => setSettingsMenu('who_can_add')}
                      className="w-full px-4 py-4 flex items-center justify-between hover:bg-zinc-800/50 transition-colors"
                    >
                      <span className="text-zinc-300">Who can add members</span>
                      <div className="flex items-center gap-2">
                        <span className="text-orange-500 text-sm">
                          {groupDetail.who_can_add === 'all' ? 'Everyone' : 'Admins Only'}
                        </span>
                        <ArrowLeft className="w-4 h-4 text-zinc-600 rotate-180" />
                      </div>
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Danger Zone */}
            <div className="px-4 mt-6">
              <div className="bg-zinc-900/60 rounded-2xl overflow-hidden">
                <button
                  onClick={handleLeaveGroup}
                  className="w-full px-4 py-4 flex items-center justify-center gap-2 hover:bg-red-500/10 transition-colors"
                >
                  <LogOut className="w-5 h-5 text-red-500" />
                  <span className="text-red-500 font-medium">Leave Group</span>
                </button>
                {isOwner && (
                  <>
                    <div className="h-px bg-zinc-800 mx-4" />
                    <button
                      onClick={handleDeleteGroup}
                      className="w-full px-4 py-4 flex items-center justify-center gap-2 hover:bg-red-500/10 transition-colors"
                    >
                      <Trash2 className="w-5 h-5 text-red-600" />
                      <span className="text-red-600 font-medium">Delete Group</span>
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Settings Selection Modal */}
        {settingsMenu && (
          <>
            <div className="fixed inset-0 z-[70] bg-black/60" onClick={() => setSettingsMenu(null)} />
            <div className="fixed bottom-0 left-0 right-0 z-[70] bg-zinc-900 rounded-t-3xl p-4 space-y-2">
              <div className="w-12 h-1 bg-zinc-700 rounded-full mx-auto mb-4" />
              <p className="text-center text-zinc-400 text-sm mb-4">
                {settingsMenu === 'who_can_send' ? 'Who can send messages?' : 'Who can add members?'}
              </p>
              <button
                onClick={() => handleSettingChange(settingsMenu, 'all')}
                className={`w-full py-4 rounded-xl text-center font-medium transition-colors ${
                  groupDetail[settingsMenu] === 'all' 
                    ? 'bg-orange-500 text-white' 
                    : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                }`}
              >
                Everyone
              </button>
              <button
                onClick={() => handleSettingChange(settingsMenu, 'admins_only')}
                className={`w-full py-4 rounded-xl text-center font-medium transition-colors ${
                  groupDetail[settingsMenu] === 'admins_only' 
                    ? 'bg-orange-500 text-white' 
                    : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                }`}
              >
                Admins Only
              </button>
              <button
                onClick={() => setSettingsMenu(null)}
                className="w-full py-4 text-zinc-500 text-center"
              >
                Cancel
              </button>
            </div>
          </>
        )}

        {/* Edit Group Modal */}
        {isEditingGroup && (
          <>
            <div className="fixed inset-0 z-[70] bg-black/60" onClick={() => setIsEditingGroup(false)} />
            <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-[70] bg-zinc-900 rounded-2xl p-5 space-y-4 max-w-sm mx-auto">
              <h3 className="font-bold text-lg text-center">Edit Group</h3>
              <div className="space-y-3">
                <input
                  type="text"
                  value={editGroupName}
                  onChange={(e) => setEditGroupName(e.target.value)}
                  placeholder="Group name"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 focus:border-orange-500 focus:outline-none transition-colors"
                  autoFocus
                />
                <textarea
                  value={editGroupDescription}
                  onChange={(e) => setEditGroupDescription(e.target.value)}
                  placeholder="Announcement (optional)"
                  rows={3}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 resize-none focus:border-orange-500 focus:outline-none transition-colors"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button 
                  onClick={() => setIsEditingGroup(false)} 
                  className="flex-1 py-3 bg-zinc-800 hover:bg-zinc-700 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleSaveGroupEdit} 
                  className="flex-1 py-3 bg-orange-500 hover:bg-orange-600 rounded-xl font-bold transition-colors"
                >
                  Save
                </button>
              </div>
            </div>
          </>
        )}

        {/* Add Members Modal */}
        {showAddMembersModal && (
          <>
            <div className="fixed inset-0 z-[70] bg-black/60" onClick={() => { setShowAddMembersModal(false); setSelectedNewMembers(new Set()); }} />
            <div className="fixed bottom-0 left-0 right-0 z-[70] bg-zinc-900 rounded-t-3xl max-h-[80vh] flex flex-col">
              <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
                <span className="font-bold text-lg">Add Members</span>
                <button 
                  onClick={() => { setShowAddMembersModal(false); setSelectedNewMembers(new Set()); }}
                  className="p-2 hover:bg-zinc-800 rounded-full transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-4">
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
                  <input
                    type="text"
                    value={addMemberSearch}
                    onChange={async (e) => {
                      setAddMemberSearch(e.target.value);
                      try {
                        const results = await api.searchUsers(e.target.value);
                        const existingIds = new Set(groupDetail.members.map(m => m.user.id));
                        setAddMemberResults(results.filter((u: any) => !existingIds.has(u.id)));
                      } catch (error) {
                        console.error(error);
                      }
                    }}
                    placeholder="Search users..."
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl pl-12 pr-4 py-3 focus:border-orange-500 focus:outline-none transition-colors"
                  />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {addMemberResults.map((user) => (
                  <button
                    key={user.id}
                    onClick={() => {
                      const newSet = new Set(selectedNewMembers);
                      if (newSet.has(Number(user.id))) {
                        newSet.delete(Number(user.id));
                      } else {
                        newSet.add(Number(user.id));
                      }
                      setSelectedNewMembers(newSet);
                    }}
                    className={`w-full p-3 rounded-xl flex items-center gap-3 ${selectedNewMembers.has(Number(user.id)) ? 'bg-orange-500/20 border border-orange-500' : 'bg-zinc-800'}`}
                  >
                    <img src={user.avatar || `https://picsum.photos/id/${Number(user.id) + 10}/200/200`} className="w-10 h-10 rounded-full" />
                    <div className="flex-1 text-left">
                      <p className="font-medium">{user.name}</p>
                      <p className="text-zinc-500 text-sm">@{user.handle}</p>
                    </div>
                    {selectedNewMembers.has(Number(user.id)) && <Check className="w-5 h-5 text-orange-500" />}
                  </button>
                ))}
              </div>
              {selectedNewMembers.size > 0 && (
                <div className="p-4 border-t border-zinc-800">
                  <button
                    onClick={handleAddMembers}
                    className="w-full py-3 bg-orange-500 rounded-xl font-bold"
                  >
                    Add {selectedNewMembers.size} Member{selectedNewMembers.size > 1 ? 's' : ''}
                  </button>
                </div>
              )}
            </div>
          </>
        )}

        {/* Remove Member Modal */}
        {showMemberActions === -1 && (
          <div className="fixed inset-0 z-[70] bg-black/80 flex items-end">
            <div className="w-full bg-zinc-900 rounded-t-3xl max-h-[60vh] flex flex-col">
              <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
                <span className="font-bold">Remove Member</span>
                <button onClick={() => setShowMemberActions(null)}>
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto divide-y divide-zinc-800">
                {groupDetail.members
                  .filter(m => m.user.id !== currentUser.id && (isOwner || m.role === 'member'))
                  .map((member) => (
                    <button
                      key={member.user.id}
                      onClick={() => handleRemoveMember(member.user.id)}
                      className="w-full p-4 flex items-center gap-3 hover:bg-zinc-800"
                    >
                      <img
                        src={member.user.avatar || `https://picsum.photos/id/${member.user.id + 10}/200/200`}
                        className="w-10 h-10 rounded-full"
                      />
                      <div className="flex-1 text-left">
                        <p className="font-medium">{member.user.name}</p>
                        <p className="text-zinc-500 text-sm">@{member.user.handle}</p>
                      </div>
                      <UserMinus className="w-5 h-5 text-red-400" />
                    </button>
                  ))}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderUserProfile = () => {
    if (!selectedUser) return null;

    const getMessageButtonText = () => {
      if (isLoadingProfile) return '...';
      return 'Message';
    };

    // Always allow clicking - will open existing chat or create new one
    const canMessage = true;

    return (
      <div className="fixed inset-0 z-[60] bg-black overflow-y-auto">
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
            <button 
              onClick={handleFollowToggle}
              className={`flex-1 font-black py-3 rounded-xl text-sm uppercase italic tracking-tighter ${
                isFollowingProfile 
                  ? 'bg-zinc-800 text-zinc-300 border border-zinc-700' 
                  : 'bg-white text-black'
              }`}
            >
              {isFollowingProfile ? 'Following ✓' : 'Follow'}
            </button>
            <button 
              className={`flex-1 font-black py-3 rounded-xl text-sm uppercase italic tracking-tighter border ${
                canMessage 
                  ? 'bg-orange-500 text-white border-orange-500' 
                  : 'bg-zinc-900 text-zinc-500 border-zinc-800'
              }`}
              onClick={handleStartChat}
              disabled={!canMessage}
            >
              {getMessageButtonText()}
            </button>
          </div>
        </div>
        
        <div className="p-4">
          <h3 className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-4">Activity</h3>
          {posts.filter(p => String(p.author.id) === String(selectedUser.id)).map(p => (
            <PostCard key={p.id} post={p} />
          ))}
        </div>
      </div>
    );
  };

  const renderFollowersList = () => {
    // Use actual users from API (TODO: implement proper followers endpoint)
    const followerUsers: User[] = availableUsers
      .filter(u => u.id !== currentUser?.id)
      .slice(0, 4)
      .map(apiUserToUser);
    return renderUserListPage('Followers', followerUsers);
  };

  const renderFollowingList = () => {
    // Use actual users from API (TODO: implement proper following endpoint)
    const followingUsers: User[] = availableUsers
      .filter(u => u.id !== currentUser?.id)
      .slice(0, 4)
      .map(apiUserToUser);
    return renderUserListPage('Following', followingUsers);
  };

  const renderSettings = () => (
    <div className="fixed inset-0 z-[60] bg-black overflow-y-auto">
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
      {currentView === 'TRUST_DETAIL' && renderTrustDetail()}
      {currentView === 'INVITE' && renderInvite()}
      {currentView === 'CHAT_DETAIL' && renderChatDetail()}
      {currentView === 'GROUP_INFO' && renderGroupInfo()}
      {currentView === 'JOIN_GROUP' && renderJoinGroup()}
      {currentView === 'USER_PROFILE' && renderUserProfile()}
      {currentView === 'FOLLOWERS_LIST' && renderFollowersList()}
      {currentView === 'FOLLOWING_LIST' && renderFollowingList()}
      {currentView === 'MY_QR_CODE' && renderMyQRCode()}
      {currentView === 'GROUP_CHAT' && renderGroupChat()}
      {currentView === 'SCAN' && renderScan()}
      {currentView === 'SETTINGS' && renderSettings()}
      
      {/* Challenge Modal */}
      <ChallengeModal
        isOpen={showChallengeModal}
        onClose={() => setShowChallengeModal(false)}
        post={challengePost}
        userBalance={availableBalance}
        userId={currentUser?.id || 0}
        challengeFee={userCosts?.costs ? Math.round(100 * userCosts.fee_multiplier) : 100}
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
      <ToastContainer />
    </div>
  );
};

export default App;
