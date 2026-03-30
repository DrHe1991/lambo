import React, { useState, useEffect, useCallback, useRef } from 'react';
import { App as CapApp } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Keyboard } from '@capacitor/keyboard';
import { Tab, Post, User, ChatSession, apiPostToPost, apiUserToUser, apiSessionToSession } from './types';
import { MOCK_ME } from './constants';
import { useUserStore, usePostStore, useChatStore, useWalletStore } from './stores';
import { api, ApiComment, ApiMessage } from './api/client';
import { Search, Bell, Plus, Home, Users, MessageCircle, User as UserIcon, X, SlidersHorizontal, ArrowLeft, Send, Trash2, ShieldCheck, Zap, MoreHorizontal, Heart, Gift, Copy, Share2, UserPlus, ScanLine, QrCode, Camera, Image, Reply, Forward, Undo2, Smile, Crown, Settings, UserMinus, Volume2, VolumeX, Link, LogOut, Edit3, Check, FileText, Download, Upload, RefreshCw, Sun, Moon } from 'lucide-react';
import { PostCard } from './components/PostCard';
// TrustBadge removed - trust system simplified
import { LoginPage } from './components/LoginPage';
// ChallengeModal removed in minimal system
import { LikeStakeModal } from './components/LikeStakeModal';
// BoostModal removed in minimal system
import { ToastContainer, toast } from './components/Toast';
import { ArticleEditor } from './components/ArticleEditor';
import { ArticleRenderer } from './components/ArticleRenderer';
import { DepositView } from './components/DepositView';
import { WithdrawView } from './components/WithdrawView';
import { ExchangeView } from './components/ExchangeView';
// Trust theme removed - trust system simplified
import { ApiUserCosts, ApiGroupDetail, ApiMemberInfo, ApiInviteLink, ApiJoinRequest, ApiDraft } from './api/client';
import { useChatWebSocket } from './hooks/useChatWebSocket';
import { useTheme } from './hooks/useTheme';
import { compressImage } from './utils/imageCompressor';
import ImageLightbox from './components/ImageLightbox';

// Views
type View = 'MAIN' | 'POST_DETAIL' | 'QA_DETAIL' | 'SEARCH' | 'USER_PROFILE' | 'CHAT_DETAIL' | 'TRANSACTIONS' | 'INVITE' | 'SETTINGS' | 'FOLLOWERS_LIST' | 'FOLLOWING_LIST' | 'MY_QR_CODE' | 'GROUP_CHAT' | 'SCAN' | 'GROUP_INFO' | 'JOIN_GROUP' | 'DEPOSIT' | 'WITHDRAW' | 'EXCHANGE';

import { fixUrl, fixHtmlUrls } from './utils/urlFixer';

// Avatar fallback - must match apiUserToUser in types.ts so every view shows the same face
const getAvatarUrl = (avatar: string | null | undefined, name: string): string => {
  if (avatar) return fixUrl(avatar);
  return `https://i.pravatar.cc/150?u=${encodeURIComponent(name)}`;
};

const handleAvatarError = (e: React.SyntheticEvent<HTMLImageElement>, name: string) => {
  const img = e.target as HTMLImageElement;
  img.onerror = null;
  img.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=333&color=fff&size=150`;
};

const App: React.FC = () => {
  // Theme
  const { theme, toggleTheme, isDark } = useTheme();

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
    feedHasMore,
    feedLoading,
    comments: apiComments,
    fetchPosts,
    fetchFeed,
    loadMoreFeed,
    fetchComments,
    createPost: createApiPost,
    createComment: createApiComment,
    toggleLikePost,
    toggleLikeComment,
    deleteComment: deleteApiComment,
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

  const {
    cryptoBalances,
    fetchCryptoBalance,
    stableBalance,
    fetchUserBalances,
  } = useWalletStore();

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
  const [publishType, setPublishType] = useState<'Post' | 'Question'>('Post');
  const [showTitleInput, setShowTitleInput] = useState(false);
  const [publishContent, setPublishContent] = useState('');
  const [publishTitle, setPublishTitle] = useState('');
  const [publishBounty, setPublishBounty] = useState('');
  const [publishPreview, setPublishPreview] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [publishImages, setPublishImages] = useState<string[]>([]);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const publishImageInputRef = useRef<HTMLInputElement>(null);
  const [drafts, setDrafts] = useState<ApiDraft[]>([]);
  const [currentDraftId, setCurrentDraftId] = useState<number | null>(null);
  const [showDraftList, setShowDraftList] = useState(false);
  // Challenge modal removed in minimal system
  const [showLikeModal, setShowLikeModal] = useState(false);
  const [likeTargetPost, setLikeTargetPost] = useState<Post | null>(null);
  const [likedPosts, setLikedPosts] = useState<Set<string>>(new Set());
  // Boost modal removed in minimal system
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
  const commentInputRef = useRef<HTMLInputElement>(null);
  const [inlineCommentPost, setInlineCommentPost] = useState<Post | null>(null);
  const [inlineCommentDraft, setInlineCommentDraft] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const pullStartY = useRef(0);
  const isPulling = useRef(false);
  const mainContentRef = useRef<HTMLElement>(null);


  // Chat detail state
  type ChatMessageReaction = { emoji: string; user_id: number; user_name: string };
  const [chatMessages, setChatMessages] = useState<Array<{id: string | number; senderId: string | number; senderName?: string; senderAvatar?: string | null; content: string; mediaUrl?: string | null; messageType: 'text' | 'image' | 'system'; status: 'sent' | 'pending'; createdAt?: string; reactions?: ChatMessageReaction[]; replyTo?: {id: number; content: string; sender_name: string} | null}>>([]);
  const [chatMessageInput, setChatMessageInput] = useState('');
  const [isLoadingChatMessages, setIsLoadingChatMessages] = useState(false);
  const [removedFromSessions, setRemovedFromSessions] = useState<Set<number>>(new Set());
  const [selectedMessageId, setSelectedMessageId] = useState<string | number | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);
  const [emojiPage, setEmojiPage] = useState(0);
  const [showAttachmentPicker, setShowAttachmentPicker] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isUploadingChatImage, setIsUploadingChatImage] = useState(false);
  const chatImageInputRef = useRef<HTMLInputElement>(null);
  const [chatLightboxSrc, setChatLightboxSrc] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<{id: string | number; content: string} | null>(null);
  const [showReactorsFor, setShowReactorsFor] = useState<{messageId: string | number; emoji: string} | null>(null);
  const longPressTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggered = React.useRef(false);
  const reactionLongPressTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const reactionLongPressTriggered = React.useRef(false);
  const messageRefs = React.useRef<Record<string, HTMLDivElement | null>>({});
  const [highlightedMsgId, setHighlightedMsgId] = useState<string | number | null>(null);
  const feedSentinelRef = React.useRef<HTMLDivElement>(null);

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

  // Android platform setup: status bar, keyboard, overscroll
  useEffect(() => {
    StatusBar.setStyle({ style: isDark ? Style.Dark : Style.Light }).catch(() => {});
    StatusBar.setOverlaysWebView({ overlay: true }).catch(() => {});
    Keyboard.setAccessoryBarVisible({ isVisible: false }).catch(() => {});
    Keyboard.setScroll({ isDisabled: true }).catch(() => {});
    Keyboard.addListener('keyboardWillShow', (info) => {
      document.documentElement.style.setProperty('--keyboard-height', `${info.keyboardHeight}px`);
    }).catch(() => {});
    Keyboard.addListener('keyboardWillHide', () => {
      document.documentElement.style.setProperty('--keyboard-height', '0px');
    }).catch(() => {});
  }, [isDark]);

  // Android back button / gesture handler
  useEffect(() => {
    const listener = CapApp.addListener('backButton', () => {
      // Dismiss modals and overlays first
      if (chatLightboxSrc) { setChatLightboxSrc(null); return; }
      if (showLikeModal) { setShowLikeModal(false); return; }
      if (showEmojiPicker) { setShowEmojiPicker(false); return; }
      if (showChatActions) { setShowChatActions(false); return; }
      if (selectedMessageId) { setSelectedMessageId(null); setMenuPosition(null); return; }
      if (showReactorsFor) { setShowReactorsFor(null); return; }
      if (showAttachmentPicker) { setShowAttachmentPicker(false); return; }
      if (showDraftList) { setShowDraftList(false); return; }
      if (showAddMembersModal) { setShowAddMembersModal(false); return; }
      if (showInviteLinks) { setShowInviteLinks(false); return; }
      if (showMemberActions !== null) { setShowMemberActions(null); return; }
      if (inlineCommentPost) { setInlineCommentPost(null); return; }
      if (publishPreview) { setPublishPreview(false); return; }

      // Close publisher
      if (isPublishing) { setIsPublishing(false); return; }

      // Navigate back through view hierarchy
      if (currentView === 'GROUP_INFO') { setCurrentView('CHAT_DETAIL'); return; }
      if (currentView === 'FOLLOWERS_LIST' || currentView === 'FOLLOWING_LIST') { setCurrentView('USER_PROFILE'); return; }
      if (currentView !== 'MAIN') {
        setCurrentView('MAIN');
        if (currentView === 'POST_DETAIL' || currentView === 'QA_DETAIL') {
          usePostStore.getState().clearCurrentPost();
        }
        if (currentView === 'SEARCH') {
          setFriendSearch('');
          setFriendSearchResults([]);
        }
        if (currentView === 'JOIN_GROUP') {
          setInvitePreview(null);
          setInviteCodeInput('');
        }
        if (currentView === 'CHAT_DETAIL') {
          setSelectedMessageId(null);
          setReplyingTo(null);
        }
        return;
      }

      // At MAIN view, minimize the app
      CapApp.minimizeApp();
    });

    return () => { listener.then(l => l.remove()); };
  }, [currentView, isPublishing, chatLightboxSrc, showLikeModal, showEmojiPicker,
      showChatActions, selectedMessageId, showReactorsFor, showAttachmentPicker,
      showDraftList, showAddMembersModal, showInviteLinks, showMemberActions,
      inlineCommentPost, publishPreview]);

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
    const currentChat = selectedChatRef.current;

    if (currentChat && Number(message.session_id) === Number(currentChat.id)) {
      // User is viewing this chat - add message directly
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
          senderName: message.sender?.name,
          senderAvatar: message.sender?.avatar,
          content: message.content,
          mediaUrl: message.media_url ? fixUrl(message.media_url) : undefined,
          messageType: message.message_type,
          status: message.status,
          replyTo: message.reply_to ? { id: message.reply_to.id, content: message.reply_to.content, sender_name: message.reply_to.sender_name } : null,
        }];
      });
    } else {
      // User is not viewing this chat - refresh sessions to update unread count
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

  // Dynamic costs state (trust system removed)
  const [userCosts, setUserCosts] = useState<ApiUserCosts | null>(null);
  
  // Profile message permission state
  const [profileMsgPermission, setProfileMsgPermission] = useState<{ permission: string; reason: string; can_message: boolean } | null>(null);
  const [isFollowingProfile, setIsFollowingProfile] = useState(false);
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);

  // Dynamic like cost from backend
  const LIKE_STAKE = userCosts?.costs?.like_post ?? 20;

  // Fetch dynamic costs (trust system removed)
  const fetchUserCosts = async (userId: number) => {
    try {
      const costs = await api.getUserCosts(userId);
      setUserCosts(costs);
    } catch { /* silent */ }
  };





  // Handle challenge action (simplified in minimal system)
  const handleChallenge = (post: Post) => {
    toast.info('Report feature coming soon');
  };

  const handleChallengeComplete = () => {
    // Challenge system removed in minimal system
    if (currentUser) {
      fetchBalance(currentUser.id);
      fetchPosts({ user_id: currentUser.id });
    }
  };

  // Execute unlike action
  const executeUnlike = async (post: Post) => {
    if (!currentUser) return;
    try {
      await toggleLikePost(Number(post.id), currentUser.id, true);
      setLikedPosts(prev => { const s = new Set(prev); s.delete(String(post.id)); return s; });
      if (selectedPost && String(selectedPost.id) === String(post.id)) {
        setSelectedPost({
          ...selectedPost,
          isLiked: false,
          likeStatus: null,
          likes: Math.max(0, selectedPost.likes - 1),
        });
      }
      toast.success('Unliked! 90% refunded');
      fetchBalance(currentUser.id);
    } catch (error) {
      const msg = (error as Error).message || 'Unlike failed';
      toast.warning(msg);
    }
  };

  // Handle like action (toggle)
  const handleLikeToggle = async (post: Post) => {
    if (!currentUser) return;
    const isLiked = likedPosts.has(String(post.id)) || post.isLiked;
    
    // Settled likes cannot be unliked (PostCard handles UI feedback)
    if (isLiked && post.likeStatus === 'settled') {
      return;
    }
    
    // If trying to unlike a pending like, show toast with confirm button
    if (isLiked && post.likeStatus === 'pending') {
      toast.confirm('Unlike? 90% refund (10% fee)', () => executeUnlike(post), 'Unlike');
      return;
    }
    
    // Like action
    try {
      await toggleLikePost(Number(post.id), currentUser.id, false);
      setLikedPosts(prev => new Set([...prev, String(post.id)]));
      if (selectedPost && String(selectedPost.id) === String(post.id)) {
        setSelectedPost({
          ...selectedPost,
          isLiked: true,
          likeStatus: 'pending',
          likes: selectedPost.likes + 1,
        });
      }
      toast.success('Liked! Locked for 1h');
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

  // Boost handlers removed in minimal system

  const PULL_THRESHOLD = 60;

  const handleRefresh = async () => {
    if (!currentUser || isRefreshing) return;
    setIsRefreshing(true);
    try {
      await fetchFeed(currentUser.id);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (activeTab !== 'Feed' && activeTab !== 'Following') return;
    const scrollEl = mainContentRef.current;
    if (scrollEl && scrollEl.scrollTop <= 0) {
      pullStartY.current = e.touches[0].clientY;
      isPulling.current = true;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isPulling.current) return;
    const scrollEl = mainContentRef.current;
    const dy = e.touches[0].clientY - pullStartY.current;
    if (dy > 0 && scrollEl && scrollEl.scrollTop <= 0) {
      setPullDistance(Math.min(dy * 0.5, 100));
    } else {
      isPulling.current = false;
      setPullDistance(0);
    }
  };

  const handleTouchEnd = () => {
    if (!isPulling.current) { setPullDistance(0); return; }
    if (pullDistance >= PULL_THRESHOLD) {
      handleRefresh();
    }
    isPulling.current = false;
    setPullDistance(0);
  };

  // Handle Google Sign-In (placeholder for Phase 2)
  const handleLogin = async () => {
    // In Phase 2, this will trigger actual Google OAuth
    // For now, users must use the "Create Account" button
    // Google login will be implemented in Phase 2
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
      fetchUserCosts(currentUser.id);
    }
  }, [isLoggedIn, currentUser?.id]);

  // Fetch crypto balance when logged in
  useEffect(() => {
    if (isLoggedIn && currentUser) {
      fetchCryptoBalance(currentUser.id).catch(() => {});
      fetchUserBalances(currentUser.id).catch(() => {});
    }
  }, [isLoggedIn, currentUser?.id]);

  // Infinite scroll: observe sentinel to load more feed posts
  useEffect(() => {
    const sentinel = feedSentinelRef.current;
    if (!sentinel || !currentUser) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadMoreFeed(currentUser.id);
        }
      },
      { rootMargin: '200px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [currentUser, feedHasMore, feedLoading, loadMoreFeed]);

  // Article cost estimation removed - posts are free in minimal system

  // Fetch drafts when opening publish overlay
  useEffect(() => {
    if (isPublishing && currentUser) {
      api.getDrafts(currentUser.id).then(setDrafts).catch(() => {});
    }
  }, [isPublishing, currentUser?.id]);

  // Auto-save draft when tab becomes hidden
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.hidden && isPublishing && publishContent.trim() && currentUser) {
        const draftData = {
          post_type: publishType === 'Question' ? 'question' : (showTitleInput ? 'article' : 'note'),
          title: publishTitle || undefined,
          content: publishContent,
          bounty: publishType === 'Question' && publishBounty ? parseInt(publishBounty) : undefined,
          has_title: showTitleInput,
        };
        try {
          if (currentDraftId) {
            await api.updateDraft(currentDraftId, currentUser.id, draftData);
          } else {
            const draft = await api.createDraft(currentUser.id, draftData);
            setCurrentDraftId(draft.id);
          }
        } catch (err) {
          // Auto-save failed silently
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isPublishing, publishContent, publishTitle, publishBounty, publishType, showTitleInput, currentDraftId, currentUser?.id]);

  // Load available users when entering group chat creation
  useEffect(() => {
    if (currentView === 'GROUP_CHAT' && currentUser) {
      setIsLoadingInvitableUsers(true);
      api.listUsers()
        .then(users => {
          setInvitableUsers(users
            .filter(u => u.id !== currentUser.id)
            .map(u => ({
              id: u.id,
              name: u.name,
              handle: u.handle,
              avatar: getAvatarUrl(u.avatar, u.name),
              trustScore: u.trust_score,
            })) as User[]);
        })
        .catch(() => {})
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
          senderName: m.sender?.name,
          senderAvatar: m.sender?.avatar,
          content: m.content,
          mediaUrl: m.media_url ? fixUrl(m.media_url) : undefined,
          messageType: m.message_type,
          status: m.status,
          createdAt: m.created_at,
          replyTo: m.reply_to ? { id: m.reply_to.id, content: m.reply_to.content, sender_name: m.reply_to.sender_name } : null,
          reactions: m.reactions || []
        })));
        // Clear unread count after messages are loaded (backend already marked as read)
        markSessionAsRead(Number(selectedChat.id));
      } catch (error) {
        // Failed to load messages
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
      <header className="flex-shrink-0 z-40 bg-black/90 backdrop-blur-xl px-5 py-1.5 flex items-center justify-between top-nav">
        <span className="text-[19px] text-white select-none font-display font-bold tracking-tight">
          <span className="text-orange-500">Bit</span>Link
        </span>
        <div className="flex items-center gap-1">
          <button
            className="p-2.5 rounded-full hover:bg-stone-800/60 transition-colors"
            onClick={() => setCurrentView('SEARCH')}
          >
            <Search className="text-stone-300" size={20} />
          </button>
          <button className="p-2.5 rounded-full hover:bg-stone-800/60 transition-colors relative">
            <Bell className="text-stone-300" size={20} />
          </button>
        </div>
      </header>
    );
  };

  const renderBottomNav = () => {
    if (currentView !== 'MAIN' || isPublishing) return null;
    return (
      <nav className="flex-shrink-0 z-50 bg-black/90 backdrop-blur-lg border-t border-stone-800 safe-bottom-nav bottom-nav">
        <div className="max-w-md mx-auto px-4 py-2 grid grid-cols-5 items-center">
          <button data-testid="nav-feed" onClick={() => { setActiveTab('Feed'); setShowChatActions(false); }} className={`flex flex-col items-center justify-center gap-1 ${activeTab === 'Feed' ? 'text-orange-500' : 'text-stone-500'}`}>
            <Home size={22} />
            <span className="text-xs font-medium">Feed</span>
          </button>
          <button data-testid="nav-following" onClick={() => { setActiveTab('Following'); setShowChatActions(false); }} className={`flex flex-col items-center justify-center gap-1 ${activeTab === 'Following' ? 'text-orange-500' : 'text-stone-500'}`}>
            <Users size={22} />
            <span className="text-xs font-medium">Following</span>
          </button>
          
          <div className="flex justify-center relative">
            <button 
              data-testid="new-post-button"
              onClick={() => setIsPublishing(true)}
              className="w-12 h-12 bg-orange-500 rounded-xl flex items-center justify-center shadow-lg shadow-orange-500/30 active:scale-90 transition-transform duration-200 -mt-3"
            >
              <Plus size={26} color="white" strokeWidth={2.5} />
            </button>
          </div>

          <button data-testid="nav-chat" onClick={() => { setActiveTab('Chat'); setShowChatActions(false); }} className={`flex flex-col items-center justify-center gap-1 ${activeTab === 'Chat' ? 'text-orange-500' : 'text-stone-500'}`}>
            <MessageCircle size={22} />
            <span className="text-xs font-medium">Chat</span>
          </button>
          <button data-testid="nav-profile" onClick={() => { setActiveTab('Profile'); setShowChatActions(false); }} className={`flex flex-col items-center justify-center gap-1 ${activeTab === 'Profile' ? 'text-orange-500' : 'text-stone-500'}`}>
            <UserIcon size={22} />
            <span className="text-xs font-medium">Me</span>
          </button>
        </div>
      </nav>
    );
  };

  // Sub-Views
  const pullIndicator = (
    <div
      className="flex justify-center items-center overflow-hidden transition-all duration-200"
      style={{ height: isRefreshing ? 40 : pullDistance > 10 ? pullDistance : 0 }}
    >
      {isRefreshing ? (
        <div className="w-5 h-5 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
      ) : pullDistance >= PULL_THRESHOLD ? (
        <span className="text-xs text-stone-400">Release to refresh</span>
      ) : pullDistance > 10 ? (
        <span className="text-xs text-stone-500">Pull down to refresh</span>
      ) : null}
    </div>
  );

  const renderFeed = () => (
    <div>
      {pullIndicator}
      <div className="px-4 py-3">
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
              const user = feedPostsConverted.find(p => String(p.author.id) === String(id))?.author;
              if (user) {
                setSelectedUser(user);
                setCurrentView('USER_PROFILE');
              }
            }}
            onChallenge={handleChallenge}
            onLike={handleLikeRequest}
            onComment={(p) => { setInlineCommentPost(p); setInlineCommentDraft(''); }}
            isLiked={likedPosts.has(String(post.id)) || post.isLiked}
          />
        ))}

        {feedLoading && !isRefreshing && (
          <div className="flex justify-center py-6">
            <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        {!feedHasMore && feedPostsConverted.length > 0 && (
          <p className="text-center text-stone-600 text-xs py-6">No more posts</p>
        )}
        <div ref={feedSentinelRef} className="h-1" />
      </div>
    </div>
  );

  const renderFollowing = () => (
    <div>
      {pullIndicator}
      <div className="px-4 py-3">
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
            const user = feedPostsConverted.find(p => String(p.author.id) === String(id))?.author;
            if (user) {
              setSelectedUser(user);
              setCurrentView('USER_PROFILE');
            }
          }}
          onChallenge={handleChallenge}
          onLike={handleLikeRequest}
          onComment={(p) => { setInlineCommentPost(p); setInlineCommentDraft(''); }}
          isLiked={likedPosts.has(String(post.id)) || post.isLiked}
        />
      ))}
      {feedLoading && !isRefreshing && (
        <div className="flex justify-center py-6">
          <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}
      {!feedHasMore && feedPostsConverted.length > 0 && (
        <p className="text-center text-stone-600 text-xs py-6">No more posts</p>
      )}
      <div ref={feedSentinelRef} className="h-1" />
      </div>
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
          <h2 className="text-lg font-bold tracking-wide uppercase text-stone-100">Messages</h2>
          <div className="relative">
            <button
              className="p-2 bg-stone-900 border border-stone-800 rounded-full"
              onClick={() => setShowChatActions(prev => !prev)}
              aria-label="Open chat quick actions"
            >
              <Plus size={20} className="text-orange-500" />
            </button>
            {showChatActions && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowChatActions(false)} />
                <div className="absolute right-0 top-12 w-44 bg-stone-950 border border-stone-800 rounded-xl shadow-xl overflow-hidden z-20">
                  {chatQuickActions.map(action => (
                    <button
                      key={action.id}
                      className="w-full px-3 py-2.5 text-left text-sm text-stone-200 hover:bg-stone-900 flex items-center gap-2"
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
                <img src={getAvatarUrl(displayUser?.avatar, displayUser?.name || 'User')} className="w-14 h-14 rounded-full border border-stone-800 object-cover" onError={(e) => handleAvatarError(e, displayUser?.name || 'User')} />
                {chat.isGroup && otherParticipants[1] && (
                   <img src={getAvatarUrl(otherParticipants[1].avatar, otherParticipants[1].name)} className="w-8 h-8 rounded-full border-2 border-black absolute -bottom-1 -right-1 object-cover" onError={(e) => handleAvatarError(e, otherParticipants[1].name)} />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="font-bold text-stone-100">{chat.isGroup ? (chat.name || 'Group Chat') : displayUser?.name}</span>
                  <span className="text-xs text-stone-500">{chat.timestamp}</span>
                </div>
                <p className="text-sm text-stone-500 truncate">{chat.lastMessage}</p>
              </div>
              {chat.unreadCount > 0 && (
                <div className="w-5 h-5 bg-orange-500 rounded-full flex items-center justify-center">
                  <span className="text-xs font-bold text-white">{chat.unreadCount}</span>
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
      <div className="p-4 sticky top-0 bg-black/85 backdrop-blur-md border-b border-stone-900 flex items-center gap-4">
        <button onClick={() => setCurrentView('MAIN')}><ArrowLeft /></button>
        <h2 className="text-lg font-bold uppercase tracking-wide">{title}</h2>
      </div>
      <div className="p-4">
        <div className="space-y-3">
          {users.map(user => (
            <button
              key={user.id}
              className="w-full bg-stone-900/50 border border-stone-800 rounded-2xl p-3 flex items-center justify-between"
              onClick={() => {
                setSelectedUser(user);
                setCurrentView('USER_PROFILE');
              }}
            >
              <div className="flex items-center gap-3">
                <img src={getAvatarUrl(user.avatar, user.name)} className="w-11 h-11 rounded-full border border-stone-800 object-cover" onError={(e) => handleAvatarError(e, user.name)} />
                <div className="text-left">
                  <span className="text-sm font-bold text-stone-100 block">{user.name}</span>
                  <span className="text-xs text-stone-500">{user.handle}</span>
                </div>
              </div>
              <ArrowLeft className="rotate-180 text-stone-700" size={14} />
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
        <div className="p-4 sticky top-0 bg-black/85 backdrop-blur-md border-b border-stone-900 flex items-center gap-4">
          <button onClick={() => setCurrentView('MAIN')}><ArrowLeft /></button>
          <h2 className="text-lg font-bold uppercase tracking-wide">My QR Code</h2>
        </div>
        <div className="flex flex-col items-center justify-center p-8 pt-16">
          {/* QR Code placeholder - in real app would generate actual QR */}
          <div className="w-64 h-64 bg-white rounded-3xl p-4 flex items-center justify-center mb-8">
            <div className="w-full h-full bg-gradient-to-br from-stone-200 to-stone-100 rounded-2xl flex items-center justify-center relative">
              <QrCode size={180} className="text-stone-800" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-16 h-16 bg-gradient-to-br from-orange-500 to-amber-600 rounded-xl flex items-center justify-center shadow-lg">
                  <Zap className="w-8 h-8 text-white fill-white" />
                </div>
              </div>
            </div>
          </div>

          <div className="text-center mb-8">
            <h3 className="text-2xl font-bold text-white mb-1">{currentMe.name}</h3>
            <p className="text-orange-400 font-bold text-lg">@{currentMe.handle}</p>
          </div>

          <button
            onClick={handleCopyHandle}
            className="flex items-center gap-3 bg-stone-900 border border-stone-800 rounded-xl px-6 py-3"
          >
            <Copy size={18} className="text-orange-400" />
            <span className="text-stone-300 font-medium">Copy Handle</span>
          </button>

          <p className="text-stone-600 text-sm text-center mt-8 px-8">
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
        <div className="p-4 sticky top-0 bg-black/85 backdrop-blur-md border-b border-stone-900 flex items-center gap-4">
          <button onClick={() => setCurrentView('MAIN')}><ArrowLeft /></button>
          <h2 className="text-lg font-bold uppercase tracking-wide">New Group</h2>
        </div>
        <div className="p-4">
          <label className="text-xs font-bold text-stone-500 uppercase tracking-wide block mb-2">Group Name</label>
          <input
            value={groupChatName}
            onChange={(e) => setGroupChatName(e.target.value)}
            placeholder="Enter group name"
            className="w-full bg-stone-900 border border-stone-800 rounded-xl px-4 py-3 text-sm mb-5"
          />

          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-stone-500 uppercase tracking-wide">Select Members</span>
            <span className="text-xs text-orange-400 font-bold">{groupMemberIds.size} selected</span>
          </div>

          <p className="text-xs text-stone-500 mb-4">
            Only showing users who follow you or have a conversation with you.
          </p>

          {isLoadingInvitableUsers ? (
            <div className="flex justify-center py-8">
              <div className="w-6 h-6 border-2 border-orange-500/30 border-t-orange-500 rounded-full animate-spin" />
            </div>
          ) : candidates.length === 0 ? (
            <div className="text-center py-8 text-stone-500">
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
                      selected ? 'bg-orange-500/10 border-orange-500/40' : 'bg-stone-900/50 border-stone-800'
                    }`}
                    onClick={() => toggleMember(user.id)}
                  >
                    <div className="flex items-center gap-3">
                      <img src={getAvatarUrl(user.avatar, user.name)} className="w-11 h-11 rounded-full border border-stone-800 object-cover" onError={(e) => handleAvatarError(e, user.name)} />
                      <div className="text-left">
                        <span className="text-sm font-bold text-stone-100 block">{user.name}</span>
                        <span className="text-xs text-stone-500">{user.handle}</span>
                      </div>
                    </div>
                    <div className={`w-5 h-5 rounded-full border-2 ${selected ? 'bg-orange-500 border-orange-500' : 'border-stone-600'}`} />
                  </button>
                );
              })}
            </div>
          )}

          <button
            className={`w-full py-3 rounded-xl text-sm font-bold uppercase tracking-wide ${
              canCreateGroup ? 'bg-orange-500 text-white' : 'bg-stone-800 text-stone-500'
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
      <div className="p-4 sticky top-0 bg-black/85 backdrop-blur-md border-b border-stone-900 flex items-center gap-4">
        <button onClick={() => setCurrentView('MAIN')}><ArrowLeft /></button>
        <h2 className="text-lg font-bold uppercase tracking-wide">Scan</h2>
      </div>
      <div className="p-4 flex flex-col items-center">
        <p className="text-sm text-stone-400 mb-6 text-center">Scan friend QR code to add instantly</p>
        <div className="w-72 h-72 rounded-3xl border-2 border-dashed border-orange-500/60 bg-stone-900/40 flex items-center justify-center mb-6 relative">
          <div className="absolute inset-4 border border-orange-500/30 rounded-2xl" />
          <ScanLine size={64} className="text-orange-500/80" />
        </div>
        <button className="w-full bg-orange-500 text-white font-bold py-3 rounded-xl text-sm uppercase tracking-wide mb-3">
          Open Camera
        </button>
        <button className="w-full bg-stone-900 border border-stone-800 text-stone-300 font-bold py-3 rounded-xl text-sm uppercase tracking-wide">
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
    <div className="p-4 pb-4">
      <div className="flex flex-col items-center mb-8">
        <div className="relative w-28 h-28 mb-4">
           <img src={getAvatarUrl(currentMe.avatar, currentMe.name)} className="w-full h-full rounded-full border-4 border-orange-500 object-cover" onError={(e) => handleAvatarError(e, currentMe.name)} />
        </div>
        <h2 className="text-xl font-bold tracking-tight font-display">{currentMe.name}</h2>
        <span className="text-stone-500 text-xs font-medium">{currentMe.handle}</span>
        <div className="flex items-center gap-6 mt-4">
          <button
            className="text-center active:scale-[0.98]"
            onClick={() => setCurrentView('FOLLOWERS_LIST')}
          >
            <span className="text-base font-bold text-stone-100 block leading-none">{followerCount}</span>
            <span className="text-xs font-bold uppercase tracking-wide text-stone-500">Followers</span>
          </button>
          <button
            className="text-center active:scale-[0.98]"
            onClick={() => setCurrentView('FOLLOWING_LIST')}
          >
            <span className="text-base font-bold text-stone-100 block leading-none">{followingCount}</span>
            <span className="text-xs font-bold uppercase tracking-wide text-stone-500">Following</span>
          </button>
        </div>
      </div>

      <div data-testid="balance-card" className="bg-stone-900 border border-stone-800 p-5 rounded-2xl mb-4">
        <div className="flex items-center justify-between mb-5">
          <button
            className="text-left active:opacity-70 transition-opacity"
            onClick={() => { if (currentUser) fetchLedger(currentUser.id); setCurrentView('TRANSACTIONS'); }}
          >
            <span className="text-stone-500 text-[10px] font-bold uppercase tracking-wider block mb-1.5">Balance</span>
            <div className="flex items-baseline gap-1.5">
              <span data-testid="balance-amount" className="text-[28px] font-bold text-stone-100 leading-none">{availableBalance.toLocaleString()}</span>
              <span className="text-orange-500 text-sm font-bold">sat</span>
              {change24h !== 0 && (
                <span className={`text-xs font-bold ml-2 ${change24h > 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {change24h > 0 ? '+' : ''}{change24h.toLocaleString()}
                </span>
              )}
            </div>
          </button>
          <button
            className="text-right active:opacity-70 transition-opacity"
            onClick={() => setCurrentView('EXCHANGE')}
          >
            <span className="text-stone-500 text-[10px] font-bold uppercase tracking-wider block mb-1.5">USDT</span>
            <span className="text-[22px] font-bold text-stone-100 leading-none">${(stableBalance / 1_000_000).toFixed(2)}</span>
          </button>
        </div>
        <div className="flex items-center justify-around pt-3 border-t border-stone-800/60">
          <button
            onClick={() => setCurrentView('DEPOSIT')}
            className="flex flex-col items-center gap-1.5 active:scale-95 transition-transform"
          >
            <div className="w-10 h-10 rounded-full bg-orange-500/15 flex items-center justify-center">
              <Download size={18} className="text-orange-500" />
            </div>
            <span className="text-[11px] font-semibold text-stone-400">Deposit</span>
          </button>
          <button
            onClick={() => setCurrentView('EXCHANGE')}
            className="flex flex-col items-center gap-1.5 active:scale-95 transition-transform"
          >
            <div className="w-10 h-10 rounded-full bg-orange-500/15 flex items-center justify-center">
              <RefreshCw size={18} className="text-orange-500" />
            </div>
            <span className="text-[11px] font-semibold text-stone-400">Exchange</span>
          </button>
          <button
            onClick={() => setCurrentView('WITHDRAW')}
            className="flex flex-col items-center gap-1.5 active:scale-95 transition-transform"
          >
            <div className="w-10 h-10 rounded-full bg-orange-500/15 flex items-center justify-center">
              <Upload size={18} className="text-orange-500" />
            </div>
            <span className="text-[11px] font-semibold text-stone-400">Withdraw</span>
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {[
          { icon: <Zap size={20} />, label: 'Transactions', action: () => { if (currentUser) fetchLedger(currentUser.id); setCurrentView('TRANSACTIONS'); } },
          { icon: <SlidersHorizontal size={20} />, label: 'Settings', action: () => setCurrentView('SETTINGS') }
        ].map((item, idx) => (
          <button 
            key={idx} 
            onClick={item.action}
            className="w-full flex items-center justify-between p-4 bg-stone-950/50 border border-stone-900 rounded-2xl active:bg-stone-900"
          >
            <div className="flex items-center gap-4">
              <span className="text-orange-500">{item.icon}</span>
              <span className="text-sm font-bold text-stone-300">{item.label}</span>
            </div>
            <ArrowLeft className="rotate-180 text-stone-700" size={16} />
          </button>
        ))}
      </div>

      {/* Logout button */}
      <button 
        onClick={() => logout()}
        className="w-full mt-6 py-3 text-stone-500 text-sm font-medium"
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
        <div className="p-4 border-b border-stone-900 flex items-center gap-4">
          <button onClick={() => { setCurrentView('MAIN'); setFriendSearch(''); setFriendSearchResults([]); }}><ArrowLeft /></button>
          <div className="flex-1 bg-stone-900 border border-stone-800 rounded-xl px-4 py-2 flex items-center gap-3">
            <Search size={18} className="text-stone-500" />
            <input 
              autoFocus
              value={friendSearch}
              onChange={(e) => setFriendSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleFriendSearch()}
              placeholder="Search @handle or topics..." 
              className="bg-transparent border-none outline-none text-sm w-full text-stone-100" 
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
              <h3 className="text-xs font-bold text-stone-500 uppercase tracking-wide mb-3">Users</h3>
              <div className="space-y-2">
                {friendSearchResults.map(user => (
                  <div 
                    key={user.id} 
                    className="bg-stone-900/50 border border-stone-800 rounded-xl p-3 flex items-center gap-3"
                    onClick={() => handleViewProfile(user)}
                  >
                    <img 
                      src={getAvatarUrl(user.avatar, user.name)} 
                      className="w-10 h-10 rounded-full border border-stone-700 object-cover"
                      onError={(e) => handleAvatarError(e, user.name)}
                    />
                    <div className="flex-1">
                      <span className="text-sm font-bold text-stone-100 block">{user.name}</span>
                      <span className="text-xs text-stone-500">{user.handle}</span>
                    </div>
                    <span className="text-stone-600 text-xs">→</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {friendSearchError && (
            <p className="text-red-400 text-sm text-center py-4 mb-4">{friendSearchError}</p>
          )}

          {friendSearch.trim() && friendSearchResults.length === 0 && !isFriendSearching && (
            <p className="text-stone-500 text-sm text-center py-6 mb-4">
              No users found for "{friendSearch}"
            </p>
          )}

          {/* Show trending when no search */}
          {!friendSearch.trim() && (
            <>
              <h3 className="text-xs font-bold text-stone-500 uppercase tracking-wide mb-4">Trending Now</h3>
              <div className="flex flex-wrap gap-2 mb-8">
                {['#Bitcoin2025', '#AI_Moderation', '#SatStaking', '#Privacy', '#L2_Growth'].map(tag => (
                  <span key={tag} className="px-3 py-1.5 bg-stone-900 border border-stone-800 rounded-lg text-xs font-bold text-orange-400">
                    {tag}
                  </span>
                ))}
              </div>
              
              <h3 className="text-xs font-bold text-stone-500 uppercase tracking-wide mb-4">Popular Posts</h3>
              <div className="grid grid-cols-2 gap-3">
                {posts.slice(0, 4).map((p, i) => (
                  <div key={i} className="bg-stone-950 border border-stone-900 rounded-xl p-3 h-40 overflow-hidden relative">
                    <div className="flex items-center gap-2 mb-2">
                      <img src={getAvatarUrl(p.author.avatar, p.author.name)} className="w-5 h-5 rounded-full" onError={(e) => handleAvatarError(e, p.author.name)} />
                      <span className="text-xs font-bold text-stone-500">{p.author.handle}</span>
                    </div>
                    <p className="text-xs text-stone-300 leading-tight">{p.content}</p>
                    <div className="absolute bottom-2 right-2 bg-black/50 backdrop-blur-sm px-1.5 py-0.5 rounded flex items-center gap-1">
                       <Heart size={10} className="text-orange-500" />
                       <span className="text-xs font-bold">{p.likes}</span>
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

  // Get comment heart color: pending=red, settled=orange, not liked=gray
  const getCommentHeartColor = (c: ApiComment) => {
    if (!c.is_liked) return 'text-stone-500';
    if (c.like_status === 'pending') return 'text-red-500';
    return 'text-orange-400';  // settled or legacy
  };

  // Shared comment-list component used by Post Detail & QA Detail
  const renderCommentItem = (c: ApiComment) => {
    const isLiked = c.is_liked;
    const canDelete = currentUser && c.author.id === currentUser.id && c.interaction_status === 'pending';
    const heartColor = getCommentHeartColor(c);

    return (
      <div key={c.id} className={`flex gap-3 mb-5 ${c.parent_id ? 'ml-10' : ''}`}>
        <div className="w-8 h-8 rounded-full shrink-0">
          <img
            src={getAvatarUrl(c.author.avatar, c.author.name)}
            className="w-full h-full rounded-full object-cover border-2 border-stone-700"
            onError={(e) => handleAvatarError(e, c.author.name)}
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-bold truncate">{c.author.name}</span>
            <span className="text-xs text-stone-500 font-medium">@{c.author.handle}</span>
          </div>
          <p className="text-sm text-stone-400 break-words">{c.content}</p>
          <div className="flex items-center gap-4 mt-2">
            <button
              className={`flex items-center gap-1 text-xs font-bold ${heartColor}`}
              onClick={async () => {
                if (!currentUser || !selectedPost) return;
                try {
                  const result = await toggleLikeComment(Number(selectedPost.id), c.id, currentUser.id, isLiked);
                  fetchBalance(currentUser.id);
                  if (!isLiked) {
                    toast.success('Liked! Locked for 1h');
                  } else {
                    const res = result as { refund_amount?: number } | undefined;
                    if (res?.refund_amount !== undefined) {
                      toast.info(`Unliked! ${res.refund_amount} sat refunded`);
                    }
                  }
                } catch (err) {
                  const msg = (err as Error).message;
                  if (msg.includes('settled')) {
                    toast.error('Cannot unlike after 1h');
                  } else if (msg.includes('402') || msg.includes('Insufficient')) {
                    toast.error('Insufficient balance');
                  } else {
                    toast.warning(msg);
                  }
                }
              }}
            >
              <Heart size={12} fill={isLiked ? 'currentColor' : 'none'} /> {c.likes_count}
            </button>
            <button
              className={`text-xs font-bold hover:text-stone-300 ${replyTarget?.id === String(c.id) ? 'text-orange-400' : 'text-stone-500'}`}
              onClick={() => {
                const isToggleOff = replyTarget?.id === String(c.id);
                setReplyTarget(isToggleOff ? null : { id: String(c.id), handle: `@${c.author.handle}` });
                if (!isToggleOff && !commentDraft.trim()) setCommentDraft(`@${c.author.handle} `);
                setTimeout(() => commentInputRef.current?.focus(), 100);
              }}
            >
              Reply
            </button>
            {canDelete && (
              <button
                className="text-xs font-bold text-stone-500 hover:text-stone-400 flex items-center gap-1"
                onClick={async () => {
                  if (!currentUser || !selectedPost) return;
                  if (!confirm('Delete this comment? You will get 70% refund, 30% penalty.')) return;
                  try {
                    const result = await deleteApiComment(c.id, Number(selectedPost.id), currentUser.id);
                    toast.success(`Refunded ${result.refunded} sat`);
                    fetchBalance(currentUser.id);
                  } catch (err) {
                    toast.warning((err as Error).message);
                  }
                }}
              >
                <Trash2 size={10} />
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  // Submit comment or reply (shared)
  const handleSubmitComment = async () => {
    if (!commentDraft.trim() || !selectedPost || !currentUser) return;
    const parentId = replyTarget ? Number(replyTarget.id) : undefined;
    const cost = parentId ? 1 : 5;  // Reply = 1 sat, Comment = 5 sat
    try {
      await createApiComment(Number(selectedPost.id), currentUser.id, commentDraft.trim(), parentId);
      setCommentDraft('');
      setReplyTarget(null);
      fetchBalance(currentUser.id);
      toast.success(`Comment posted (${cost} sat)`);
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes('402') || msg.includes('Insufficient')) {
        toast.error(`Insufficient balance. Need ${cost} sat.`);
      } else if (msg.includes('429') || msg.includes('Rate limit')) {
        toast.warning('Too many comments. Please wait.');
      } else {
        toast.warning(msg);
      }
    }
  };

  // Submit inline comment from feed
  const handleInlineComment = async () => {
    if (!inlineCommentDraft.trim() || !inlineCommentPost || !currentUser) return;
    try {
      await createApiComment(Number(inlineCommentPost.id), currentUser.id, inlineCommentDraft.trim());
      setInlineCommentDraft('');
      setInlineCommentPost(null);
      fetchBalance(currentUser.id);
      toast.success('Comment posted (5 sat)');
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes('402') || msg.includes('Insufficient')) {
        toast.error('Insufficient balance for comment');
      } else if (msg.includes('429') || msg.includes('Rate limit')) {
        toast.warning('Too many comments. Please wait.');
      } else {
        toast.warning(msg);
      }
    }
  };

  const renderInlineCommentSheet = () => {
    if (!inlineCommentPost) return null;
    const cost = '5 sat';  // Comment cost
    return (
      <div className="fixed inset-0 z-[70] flex flex-col justify-end" onClick={() => setInlineCommentPost(null)}>
        <div className="absolute inset-0 overlay-dim-60" />
        <div
          className="relative bg-stone-950 border-t border-stone-800 rounded-t-2xl p-4 pb-8"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs text-stone-500">Replying to</span>
            <span className="text-xs font-bold text-stone-300">{inlineCommentPost.author.name}</span>
          </div>
          <div className="flex items-center gap-3">
            <input
              autoFocus
              value={inlineCommentDraft}
              onChange={(e) => setInlineCommentDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleInlineComment()}
              placeholder="Add your insight..."
              className="flex-1 bg-stone-900 border border-stone-700 rounded-xl px-4 py-3 text-sm outline-none focus:border-orange-500/60"
            />
            <button className="bg-orange-500 p-3 rounded-xl shrink-0" onClick={handleInlineComment}><Send size={18} /></button>
          </div>
        </div>
      </div>
    );
  };

  // Determine comment input cost label
  const commentCostLabel = () => {
    if (!selectedPost) return '';
    if (replyTarget) return '1 sat';  // Reply to comment
    return '5 sat';  // Comment on post
  };

  const renderPostDetail = () => {
    if (!selectedPost) return null;
    const topLevel = apiComments.filter(c => !c.parent_id);
    const replies = apiComments.filter(c => c.parent_id);
    const isArticle = selectedPost.type === 'Article';

    return (
      <div className="fixed inset-0 z-[60] bg-black overflow-y-auto">
        <div className="p-4 sticky top-0 bg-black/80 backdrop-blur-md border-b border-stone-900 flex items-center justify-between">
          <button onClick={() => { setCurrentView('MAIN'); usePostStore.getState().clearCurrentPost(); }}><ArrowLeft /></button>
          <div className="w-6" />
          <button><MoreHorizontal /></button>
        </div>
        <div className="p-4 pb-28">
          {isArticle ? (
            <div className="mb-8">
              {/* Title */}
              {selectedPost.title && (
                <h1 className="text-2xl font-bold text-white mb-4 leading-tight">
                  {selectedPost.title}
                </h1>
              )}
              
              {/* Author info */}
              <div className="flex items-center gap-3 mb-6 pb-6 border-b border-stone-800">
                <div className="w-12 h-12 rounded-full shrink-0">
                  <img
                    src={getAvatarUrl(selectedPost.author.avatar, selectedPost.author.name)}
                    className="w-full h-full rounded-full object-cover border-2 border-stone-700"
                    onError={(e) => handleAvatarError(e, selectedPost.author.name)}
                  />
                </div>
                <div>
                  <span className="font-bold text-white block">{selectedPost.author.name}</span>
                  <span className="text-stone-500 text-sm">{selectedPost.author.handle} · {selectedPost.timestamp}</span>
                </div>
              </div>
              
              {/* Article content - always render HTML from TipTap editor */}
              <ArticleRenderer content={selectedPost.content} />
              
              {/* Engagement stats - clickable like button */}
              <div className="flex items-center gap-6 mt-8 pt-6 border-t border-stone-800">
                <button
                  className={`flex items-center gap-2 transition-colors ${
                    (likedPosts.has(String(selectedPost.id)) || selectedPost.isLiked)
                      ? selectedPost.likeStatus === 'pending' ? 'text-red-500' : 'text-orange-500'
                      : 'text-stone-400 hover:text-pink-400'
                  }`}
                  onClick={() => handleLikeToggle(selectedPost)}
                >
                  <Heart size={20} fill={(likedPosts.has(String(selectedPost.id)) || selectedPost.isLiked) ? 'currentColor' : 'none'} />
                  <span className="font-medium">{selectedPost.likes}</span>
                </button>
                <div className="flex items-center gap-2 text-stone-400">
                  <MessageCircle size={20} />
                  <span className="font-medium">{selectedPost.comments}</span>
                </div>
              </div>
            </div>
          ) : (
            <PostCard post={selectedPost} />
          )}



          {apiComments.length > 0 && (
            <div className="mt-8 border-t border-stone-900 pt-6">
              <h3 className="text-sm font-bold mb-4 uppercase tracking-wider text-stone-500">
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
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-stone-950 border-t border-stone-900 flex items-center gap-3">
          <div className="flex-1">
            {replyTarget && (
              <div className="flex items-center justify-between mb-2 px-1">
                <span className="text-xs font-bold text-orange-400 uppercase tracking-wide">Replying to {replyTarget.handle}</span>
                <button className="text-xs text-stone-500" onClick={() => setReplyTarget(null)}>Cancel</button>
              </div>
            )}
            <input
              ref={commentInputRef}
              value={commentDraft}
              onChange={(e) => setCommentDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmitComment()}
              placeholder={replyTarget ? `Reply to ${replyTarget.handle}...` : 'Add your insight...'}
              className="w-full bg-stone-900 border border-stone-700 rounded-xl px-4 py-3 text-sm outline-none focus:border-orange-500/60"
            />
          </div>
          <button className="bg-orange-500 p-3 rounded-xl shrink-0" onClick={handleSubmitComment}><Send size={18} /></button>
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
        <div className="p-4 sticky top-0 bg-black/80 backdrop-blur-md border-b border-stone-900 flex items-center justify-between">
          <button onClick={() => { setCurrentView('MAIN'); usePostStore.getState().clearCurrentPost(); }}><ArrowLeft /></button>
          <div className="w-6" />
          <button><MoreHorizontal /></button>
        </div>
        <div className="p-4 bg-orange-500/5 border-b border-orange-500/10 mb-4">
           <div className="bg-orange-500 text-white text-xs font-bold px-2 py-0.5 rounded-full inline-block mb-3 uppercase tracking-tight">Question</div>
           <h2 className="text-xl font-bold mb-4">{selectedPost.content}</h2>
           <div className="flex items-center justify-between">
             <div className="flex items-center gap-2">
               <img src={getAvatarUrl(selectedPost.author.avatar, selectedPost.author.name)} className="w-6 h-6 rounded-full" onError={(e) => handleAvatarError(e, selectedPost.author.name)} />
               <span className="text-xs font-bold">{selectedPost.author.handle}</span>
             </div>
             {selectedPost.bounty ? (
               <div className="text-orange-500 font-bold text-sm uppercase">💰 {selectedPost.bounty.toLocaleString()} sat bounty</div>
             ) : null}
           </div>
        </div>
        <div className="p-4 pb-28">

          <h3 className="text-xs font-bold uppercase text-stone-500 mb-4 tracking-widest">{answers.length} Answers</h3>
          {answers.map(answer => (
            <div key={answer.id} className="bg-stone-900/50 border border-stone-900 rounded-2xl p-4 mb-4">
               <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-full shrink-0">
                    <img
                      src={getAvatarUrl(answer.author.avatar, answer.author.name)}
                      className="w-full h-full rounded-full object-cover border-2 border-stone-700"
                      onError={(e) => handleAvatarError(e, answer.author.name)}
                    />
                  </div>
                  <div>
                    <span className="text-xs font-bold">{answer.author.name}</span>
                    <span className="text-xs text-stone-500 italic block">@{answer.author.handle}</span>
                  </div>
               </div>
               <p className="text-sm text-stone-200 leading-relaxed mb-3 break-words">{answer.content}</p>
               <div className="flex items-center gap-4">
                 <button
                   className={`flex items-center gap-1 text-xs font-bold ${getCommentHeartColor(answer)}`}
                   onClick={async () => {
                     if (!currentUser || !selectedPost) return;
                     try {
                       const result = await toggleLikeComment(Number(selectedPost.id), answer.id, currentUser.id, answer.is_liked);
                       fetchBalance(currentUser.id);
                       if (!answer.is_liked) {
                         toast.success('Liked! Locked for 1h');
                       } else {
                         const res = result as { refund_amount?: number } | undefined;
                         if (res?.refund_amount !== undefined) {
                           toast.info(`Unliked! ${res.refund_amount} sat refunded`);
                         }
                       }
                     } catch (err) {
                       const msg = (err as Error).message;
                       if (msg.includes('settled')) {
                         toast.error('Cannot unlike after 1h');
                       } else if (msg.includes('402') || msg.includes('Insufficient')) {
                         toast.error('Insufficient balance');
                       } else {
                         toast.warning(msg);
                       }
                     }
                   }}
                 >
                   <Heart size={12} fill={answer.is_liked ? 'currentColor' : 'none'} /> {answer.likes_count}
                 </button>
                 <button
                   className={`text-xs font-bold hover:text-stone-300 ${replyTarget?.id === String(answer.id) ? 'text-orange-400' : 'text-stone-500'}`}
                   onClick={() => {
                     const isToggleOff = replyTarget?.id === String(answer.id);
                     setReplyTarget(isToggleOff ? null : { id: String(answer.id), handle: `@${answer.author.handle}` });
                     if (!isToggleOff && !commentDraft.trim()) setCommentDraft(`@${answer.author.handle} `);
                     setTimeout(() => commentInputRef.current?.focus(), 100);
                   }}
                 >
                   Reply
                 </button>
               </div>
               {/* Sub-replies to this answer */}
               {answerReplies.filter(r => r.parent_id === answer.id).length > 0 && (
                 <div className="mt-3 pt-3 border-t border-stone-800">
                   {answerReplies.filter(r => r.parent_id === answer.id).map(r => renderCommentItem(r))}
                 </div>
               )}
            </div>
          ))}
          {answers.length === 0 && (
            <p className="text-stone-600 text-sm text-center py-4">No answers yet. Be the first!</p>
          )}
        </div>
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-stone-950 border-t border-stone-900 flex items-center gap-3">
          <div className="flex-1">
            {replyTarget && (
              <div className="flex items-center justify-between mb-2 px-1">
                <span className="text-xs font-bold text-orange-400 uppercase tracking-wide">Replying to {replyTarget.handle}</span>
                <button className="text-xs text-stone-500" onClick={() => setReplyTarget(null)}>Cancel</button>
              </div>
            )}
            <input
              ref={commentInputRef}
              value={commentDraft}
              onChange={(e) => setCommentDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmitComment()}
              placeholder={replyTarget ? `Reply to ${replyTarget.handle}...` : 'Submit your answer...'}
              className="w-full bg-stone-900 border border-stone-700 rounded-xl px-4 py-3 text-sm outline-none focus:border-orange-500/60"
            />
          </div>
          <button className="bg-orange-500 p-3 rounded-xl shrink-0" onClick={handleSubmitComment}><Send size={18} /></button>
        </div>
      </div>
    );
  };

  // renderTrustDetail removed - trust system simplified

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
        exchange_buy_sat: 'USDT → sat',
        exchange_sell_sat: 'sat → USDT',
        exchange_bonus: 'Exchange Bonus',
      };
      return map[t] || t;
    };

    return (
      <div className="fixed inset-0 z-[60] bg-black overflow-y-auto">
        <div className="p-4 sticky top-0 bg-black/80 backdrop-blur-md border-b border-stone-900 flex items-center gap-4">
          <button onClick={() => setCurrentView('MAIN')}><ArrowLeft /></button>
          <h2 className="text-xl font-bold tracking-tight font-display uppercase">Transactions</h2>
        </div>
        
        <div className="p-4">
          <div className="bg-stone-900 border border-stone-800 p-4 rounded-2xl mb-6">
            <span className="text-stone-500 text-xs font-bold uppercase block mb-1">Balance</span>
            <span className="text-2xl font-bold text-stone-100">{availableBalance.toLocaleString()} <span className="text-orange-500 text-sm">sat</span></span>
          </div>

          <div className="space-y-3">
            {ledgerEntries.length === 0 && (
              <p className="text-stone-600 text-center py-8">No transactions yet</p>
            )}
            {ledgerEntries.map(tx => (
              <div key={tx.id} className="bg-stone-900/50 border border-stone-800 rounded-xl p-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-bold text-stone-200">{tx.note || actionLabel(tx.action_type)}</span>
                  <span className={`text-sm font-bold ${tx.amount > 0 ? 'text-green-500' : 'text-red-400'}`}>
                    {tx.amount > 0 ? '+' : ''}{tx.amount} sat
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-stone-600">{new Date(tx.created_at).toLocaleString()}</span>
                  <span className="text-xs text-stone-600">{tx.balance_after.toLocaleString()} sat</span>
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
        <div className="p-4 sticky top-0 bg-black/80 backdrop-blur-md border-b border-stone-900 flex items-center gap-4">
          <button onClick={() => setCurrentView('MAIN')}><ArrowLeft /></button>
          <h2 className="text-xl font-bold tracking-tight font-display uppercase">Invite Friends</h2>
        </div>
        
        <div className="p-4">
          {/* Reward info */}
          <div className="bg-gradient-to-br from-orange-600/20 to-amber-600/20 border border-orange-500/30 rounded-3xl p-6 mb-6 text-center">
            <Gift className="w-12 h-12 text-orange-500 mx-auto mb-4" />
            <h3 className="text-2xl font-bold text-white mb-2">Referral Reward</h3>
            <p className="text-stone-400 text-sm mb-4">For each friend who signs up</p>
            <div className="bg-stone-900/50 rounded-2xl p-4">
              <span className="text-3xl font-bold text-orange-500">+500</span>
              <span className="text-lg font-bold text-orange-400 ml-2">sat</span>
            </div>
          </div>

          {/* Invite code */}
          <div className="mb-6">
            <label className="text-xs font-bold text-stone-500 uppercase tracking-wide block mb-3">Your Invite Code</label>
            <div className="bg-stone-900 border border-stone-800 rounded-2xl p-4 flex items-center justify-between">
              <span className="text-lg font-bold text-white tracking-wider">{inviteCode}</span>
              <button 
                onClick={() => navigator.clipboard?.writeText(inviteCode)}
                className="p-2 bg-stone-800 rounded-xl active:scale-95"
              >
                <Copy size={18} className="text-orange-500" />
              </button>
            </div>
          </div>

          {/* Invite link */}
          <div className="mb-8">
            <label className="text-xs font-bold text-stone-500 uppercase tracking-wide block mb-3">Invite Link</label>
            <div className="bg-stone-900 border border-stone-800 rounded-2xl p-4">
              <p className="text-sm text-stone-400 truncate mb-3">{inviteLink}</p>
              <button 
                onClick={() => navigator.clipboard?.writeText(inviteLink)}
                className="w-full bg-orange-500 text-white font-bold py-3 rounded-xl text-sm uppercase tracking-tight font-display active:scale-95 flex items-center justify-center gap-2"
              >
                <Share2 size={18} />
                Copy Link
              </button>
            </div>
          </div>

          {/* Stats */}
          <div className="bg-stone-900/50 border border-stone-800 rounded-2xl p-4">
            <h4 className="text-xs font-bold text-stone-500 uppercase tracking-wide mb-4">Referral Stats</h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-2xl font-bold text-white">3</span>
                <span className="text-stone-500 text-xs block">Invited</span>
              </div>
              <div>
                <span className="text-2xl font-bold text-orange-500">1,500</span>
                <span className="text-stone-500 text-xs block">Earned</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderPublishOverlay = () => {
    if (!isPublishing) return null;

    const isPost = publishType === 'Post';
    const isQuestion = publishType === 'Question';
    
    const accentBg = isQuestion ? 'bg-blue-500' : 'bg-orange-500';
    const accentText = isQuestion ? 'text-blue-400' : 'text-orange-500';
    const accentBorder = isQuestion ? 'border-blue-500/30' : 'border-orange-500/30';
    const accentGlow = isQuestion ? 'shadow-blue-500/30' : 'shadow-orange-500/30';
    const freePost = currentUser?.free_posts_remaining && currentUser.free_posts_remaining > 0;

    const resetPublishState = (clearDraft = true) => {
      if (clearDraft) {
        setCurrentDraftId(null);
      }
      setIsPublishing(false);
      setPublishContent('');
      setPublishTitle('');
      setPublishBounty('');
      setPublishType('Post');
      setShowTitleInput(false);
      setShowDraftList(false);
      setPublishPreview(false);
      setPublishImages([]);
    };

    const handlePostImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files?.length) return;
      setIsUploadingImage(true);
      try {
        for (const file of Array.from(files)) {
          if (publishImages.length >= 9) break;
          const compressed = await compressImage(file);
          const result = await api.uploadMedia(compressed, 'post');
          setPublishImages(prev => [...prev, result.url]);
        }
      } catch {
        toast.error('Failed to upload image');
      } finally {
        setIsUploadingImage(false);
        if (publishImageInputRef.current) {
          publishImageInputRef.current.value = '';
        }
      }
    };

    const saveDraft = async () => {
      if (!currentUser || !publishContent.trim()) return;
      
      const draftData = {
        post_type: isQuestion ? 'question' : (showTitleInput ? 'article' : 'note'),
        title: publishTitle || undefined,
        content: publishContent,
        bounty: isQuestion && publishBounty ? parseInt(publishBounty) : undefined,
        has_title: showTitleInput,
      };

      try {
        if (currentDraftId) {
          await api.updateDraft(currentDraftId, currentUser.id, draftData);
        } else {
          const draft = await api.createDraft(currentUser.id, draftData);
          setCurrentDraftId(draft.id);
        }
        toast.success('Draft saved');
      } catch (err) {
        // Draft save failed silently
      }
    };

    const loadDraft = (draft: ApiDraft) => {
      setCurrentDraftId(draft.id);
      setPublishContent(draft.content);
      setPublishTitle(draft.title || '');
      setPublishBounty(draft.bounty?.toString() || '');
      setShowTitleInput(draft.has_title);
      setPublishType(draft.post_type === 'question' ? 'Question' : 'Post');
      setShowDraftList(false);
    };

    const handleDeleteDraft = async (draftId: number) => {
      if (!currentUser) return;
      try {
        await api.deleteDraft(draftId, currentUser.id);
        setDrafts(prev => prev.filter(d => d.id !== draftId));
        if (currentDraftId === draftId) {
          setCurrentDraftId(null);
        }
        toast.success('Draft deleted');
      } catch (err) {
        toast.error('Failed to delete draft');
      }
    };

    const handleClose = async () => {
      if (publishContent.trim() && currentUser) {
        await saveDraft();
      }
      resetPublishState(false);
    };

    const handlePublish = async () => {
      if ((!publishContent.trim() && !publishImages.length) || !currentUser) return;
      
      const hasTitle = showTitleInput && publishTitle.trim();
      
      setIsSubmitting(true);
      try {
        const bounty = isQuestion && publishBounty ? parseInt(publishBounty) : undefined;
        const postType = isQuestion ? 'question' : (hasTitle ? 'article' : 'note');
        
        const newPost = await api.createPost(currentUser.id, {
          content: publishContent || ' ',
          post_type: postType,
          title: hasTitle ? publishTitle : undefined,
          content_format: hasTitle ? 'markdown' : 'plain',
          bounty,
          media_urls: publishImages.length ? publishImages : undefined,
        });
        
        // Delete draft if it exists
        if (currentDraftId) {
          api.deleteDraft(currentDraftId, currentUser.id).catch(() => {});
        }
        resetPublishState();
        toast.success(hasTitle ? 'Article published' : 'Posted');
        setActiveTab('Feed');
        setCurrentView('MAIN');
        usePostStore.setState((state) => ({
          feedPosts: [newPost, ...state.feedPosts],
          posts: [newPost, ...state.posts],
        }));
        fetchFeed(currentUser.id);
        if (currentUser) {
          fetchBalance(currentUser.id);
          fetchLedger(currentUser.id);
        }
      } catch (err) {
        let msg = 'Failed to publish';
        if (err instanceof Error) {
          msg = err.message;
        } else if (typeof err === 'string') {
          msg = err;
        } else if (err && typeof err === 'object' && 'detail' in err) {
          msg = String((err as { detail: unknown }).detail);
        }
        if (msg.includes('Insufficient balance')) {
          toast.warning(msg);
        } else {
          toast.error(msg);
        }
      } finally {
        setIsSubmitting(false);
      }
    };

    const getCostDisplay = () => {
      // All posts are FREE in minimal system
      return `free · ${availableBalance.toLocaleString()} sat available`;
    };

    const canPublish = () => {
      if (!publishContent.trim()) return false;
      if (showTitleInput && !publishTitle.trim()) return false;
      return true;
    };

    return (
      <div className={`fixed inset-0 z-[100] bg-black flex flex-col`}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <button
            onClick={handleClose}
            className="p-2 text-stone-400"
          >
            <X size={24} />
          </button>

          {/* Type toggle */}
          <div className="flex bg-stone-900 rounded-xl p-1 gap-0.5">
            <button
              onClick={() => { setPublishType('Post'); setShowTitleInput(false); }}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold uppercase tracking-tight transition-all duration-200 ${
                isPost ? 'bg-orange-500 text-white' : 'text-stone-500'
              }`}
            >
              Post
            </button>
            <button
              onClick={() => { setPublishType('Question'); setShowTitleInput(false); }}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold uppercase tracking-tight transition-all duration-200 ${
                isQuestion ? 'bg-blue-500 text-white' : 'text-stone-500'
              }`}
            >
              Q&A
            </button>
          </div>

          {/* Drafts button */}
          {drafts.length > 0 && (
            <button
              onClick={() => setShowDraftList(!showDraftList)}
              className="px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-tight text-orange-400 hover:text-orange-300 transition-all"
            >
              Drafts
            </button>
          )}

          <button
            data-testid="publish-button"
            onClick={handlePublish}
            disabled={!canPublish() || isSubmitting}
            className={`px-5 py-2 rounded-xl text-sm font-bold uppercase tracking-tight transition-all duration-200 ${
              canPublish()
                ? `${accentBg} text-white shadow-lg ${accentGlow} active:scale-95`
                : 'bg-stone-800 text-stone-600'
            }`}
          >
            {isSubmitting ? '...' : (isQuestion ? 'Ask' : 'Post')}
          </button>
        </div>

        {/* Accent line */}
        <div className={`h-0.5 ${
          isQuestion
            ? 'bg-gradient-to-r from-blue-500/50 via-blue-500 to-blue-500/50'
            : 'bg-gradient-to-r from-orange-500/50 via-orange-500 to-orange-500/50'
        }`} />

        {/* Draft list modal */}
        {showDraftList && drafts.length > 0 && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center px-6">
            <div className="absolute inset-0 bg-black/80" onClick={() => setShowDraftList(false)} />
            <div className="relative bg-black border border-stone-800 rounded-2xl w-full max-w-sm max-h-[60vh] overflow-hidden">
              <div className="flex items-center justify-between p-4 border-b border-stone-800">
                <span className="text-sm font-bold text-orange-400">Drafts</span>
                <button onClick={() => setShowDraftList(false)} className="text-stone-500 hover:text-white">
                  <X size={18} />
                </button>
              </div>
              <div className="overflow-y-auto max-h-[50vh] p-2">
                {drafts.map(draft => (
                  <div 
                    key={draft.id}
                    className={`flex items-center justify-between py-3 px-3 rounded-xl mb-1 ${
                      currentDraftId === draft.id ? 'bg-orange-500/20 border border-orange-500/30' : 'bg-stone-900 hover:bg-stone-800'
                    }`}
                  >
                    <button
                      onClick={() => loadDraft(draft)}
                      className="flex-1 text-left"
                    >
                      <div className="text-sm text-white truncate">
                        {draft.title || draft.content.slice(0, 50).replace(/<[^>]*>/g, '') || 'Untitled'}
                      </div>
                      <div className="text-xs text-stone-500 mt-0.5">
                        {new Date(draft.updated_at).toLocaleDateString()}
                      </div>
                    </button>
                    <button
                      onClick={() => handleDeleteDraft(draft.id)}
                      className="p-2 text-stone-500 hover:text-red-400 ml-2"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Editor */}
        <div className="flex-1 px-4 pt-4 overflow-auto flex flex-col min-h-0">
          <div className="flex items-start gap-3 mb-3">
            <img
              src={getAvatarUrl(currentMe.avatar, currentMe.name)}
              className={`w-10 h-10 rounded-full border-2 ${
                isQuestion ? 'border-blue-500/50' : 'border-orange-500/50'
              } object-cover flex-shrink-0`}
              onError={(e) => handleAvatarError(e, currentMe.name)}
            />
            <div className="flex-1 min-w-0">
              <span className="text-sm font-bold text-stone-300 block">{currentMe.name}</span>
              <span className="text-xs text-stone-500 font-medium">{getCostDisplay()}</span>
            </div>
          </div>

          {isPost && !showTitleInput && (
            <button
              onClick={() => setShowTitleInput(true)}
              className="mb-3 self-start px-3 py-1.5 text-xs text-stone-600 hover:text-orange-400 border border-dashed border-stone-800 hover:border-orange-500/40 rounded-md transition-colors"
            >
              + Write an article instead
            </button>
          )}

          {showTitleInput ? (
            <ArticleEditor
              title={publishTitle}
              content={publishContent}
              onTitleChange={setPublishTitle}
              onContentChange={setPublishContent}
              placeholder="Write your article..."
              onRemoveTitle={() => {
                setShowTitleInput(false);
                setPublishTitle('');
              }}
              onImageUpload={async (file) => {
                try {
                  const compressed = await compressImage(file);
                  const result = await api.uploadMedia(compressed, 'post');
                  return result.url;
                } catch {
                  toast.error('Failed to upload image');
                  return null;
                }
              }}
            />
          ) : (
            <textarea
              data-testid="post-content"
              autoFocus
              value={publishContent}
              onChange={(e) => setPublishContent(e.target.value)}
              maxLength={isQuestion ? 2000 : 500}
              className={`w-full flex-1 bg-transparent border-none outline-none text-lg leading-relaxed resize-none ${
                isQuestion ? 'placeholder:text-blue-400/30' : 'placeholder:text-orange-500/30'
              }`}
              placeholder={isQuestion ? 'What do you need to know?' : "What's the signal?"}
            />
          )}

          {/* Image attachments preview */}
          {!showTitleInput && publishImages.length > 0 && (
            <div className="py-3 flex flex-wrap gap-2">
              {publishImages.map((url, i) => (
                <div key={url} className="relative w-20 h-20 rounded-lg overflow-hidden bg-stone-800">
                  <img src={url} alt="" className="w-full h-full object-cover" />
                  <button
                    onClick={() => setPublishImages(prev => prev.filter((_, idx) => idx !== i))}
                    className="absolute top-0.5 right-0.5 w-5 h-5 bg-black/70 rounded-full flex items-center justify-center"
                  >
                    <X size={12} className="text-white" />
                  </button>
                </div>
              ))}
              {isUploadingImage && (
                <div className="w-20 h-20 rounded-lg bg-stone-800 flex items-center justify-center">
                  <div className="w-5 h-5 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Bottom toolbar */}
        {!showTitleInput && (
          <div className="px-4 pt-3 pb-8 border-t border-stone-800/50">
            <div className="flex items-center gap-2 flex-wrap">
              {publishImages.length < 9 && (
                <button
                  onClick={() => publishImageInputRef.current?.click()}
                  disabled={isUploadingImage}
                  className={`flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors ${
                    isUploadingImage
                      ? 'text-stone-600 cursor-not-allowed border border-dashed border-stone-800'
                      : `text-stone-500 border border-dashed border-stone-700 ${
                          isQuestion ? 'hover:text-blue-400 hover:border-blue-500/50' : 'hover:text-orange-400 hover:border-orange-500/50'
                        }`
                  }`}
                >
                  <Image size={16} />
                  {isUploadingImage ? 'Uploading...' : 'Add photo'}
                </button>
              )}

              <div className="flex-1" />

              <span className="text-xs text-stone-600">
                {publishContent.length}/{isQuestion ? 2000 : 500}
              </span>
            </div>

            {isQuestion && (
              <div className={`mt-3 flex items-center justify-between p-4 bg-blue-500/10 border ${accentBorder} rounded-2xl`}>
                <span className="text-sm font-bold text-blue-400">Bounty (optional)</span>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={publishBounty}
                    onChange={(e) => setPublishBounty(e.target.value)}
                    placeholder="0"
                    className="w-20 bg-transparent border-none outline-none text-right text-xl font-bold text-white"
                  />
                  <span className="text-xs font-bold uppercase text-blue-400">sat</span>
                </div>
              </div>
            )}
          </div>
        )}

        <input
          ref={publishImageInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          multiple
          className="hidden"
          onChange={handlePostImageSelect}
        />
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
              senderName: m.sender?.name,
              senderAvatar: m.sender?.avatar,
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
        // Reaction toggle failed
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
      if (type === 'camera') {
        toast.info('Camera requires native app — use Album on web');
        return;
      }
      chatImageInputRef.current?.click();
    };

    const handleChatImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !selectedChat || !currentUser) return;
      setIsUploadingChatImage(true);
      try {
        const compressed = await compressImage(file);
        const result = await api.uploadMedia(compressed, 'chat');
        const responses = await api.sendMessage(
          Number(selectedChat.id),
          currentUser.id,
          '',
          undefined,
          result.url,
        );
        if (responses.length > 0) {
          const msg = responses[0];
          setChatMessages(prev => [...prev, {
            id: msg.id,
            senderId: msg.sender_id,
            senderName: msg.sender?.name,
            senderAvatar: msg.sender?.avatar,
            content: msg.content,
            mediaUrl: msg.media_url ? fixUrl(msg.media_url) : undefined,
            messageType: msg.message_type,
            status: msg.status,
            replyTo: null,
          }]);
        }
        fetchSessions(currentUser.id);
      } catch {
        toast.error('Failed to send image');
      } finally {
        setIsUploadingChatImage(false);
        if (chatImageInputRef.current) {
          chatImageInputRef.current.value = '';
        }
      }
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
        toast.error('Failed to load group info');
      } finally {
        setIsLoadingGroupDetail(false);
      }
    };

    return (
      <div className="fixed inset-0 z-[60] bg-black flex flex-col">
        {/* Header */}
        <div className="p-4 bg-black/80 backdrop-blur-md border-b border-stone-900 flex items-center gap-4">
          <button onClick={() => { setCurrentView('MAIN'); setSelectedMessageId(null); setReplyingTo(null); }}><ArrowLeft /></button>
          <button
            className="flex items-center gap-3"
            onClick={isGroup ? handleOpenGroupInfo : handleOpenProfile}
          >
            {isGroup ? (
              <div className="relative w-10 h-10">
                <img src={getAvatarUrl(selectedChat.participants[0]?.avatar, selectedChat.participants[0]?.name || 'User')} className="w-7 h-7 rounded-full border border-stone-800 absolute top-0 left-0" onError={(e) => handleAvatarError(e, selectedChat.participants[0]?.name || 'User')} />
                <img src={getAvatarUrl(selectedChat.participants[1]?.avatar, selectedChat.participants[1]?.name || 'User')} className="w-7 h-7 rounded-full border border-stone-800 absolute bottom-0 right-0" onError={(e) => handleAvatarError(e, selectedChat.participants[1]?.name || 'User')} />
              </div>
            ) : (
              <img src={getAvatarUrl(chatPartner?.avatar, chatPartner?.name || 'User')} className="w-10 h-10 rounded-full border border-stone-800 object-cover" onError={(e) => handleAvatarError(e, chatPartner?.name || 'User')} />
            )}
            <div className="flex flex-col items-start">
              <span className="text-sm font-bold">{isGroup ? (selectedChat.name || 'Group Chat') : chatPartner?.name}</span>
              {isGroup && <span className="text-xs text-stone-500">{selectedChat.participants.length} members</span>}
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
            <div className="text-center text-stone-600 py-8">
              No messages yet. Say hi! 👋
            </div>
          )}
          {/* Render all messages in chronological order with WeChat-style grouping */}
          {chatMessages.map((msg, idx) => {
            const isMe = msg.senderId === currentUser?.id || msg.senderId === currentMe.id;
            const isPending = msg.status === 'pending';
            const isSystem = msg.messageType === 'system';
            const isSelected = selectedMessageId === msg.id;
            
            // Previous and next message for grouping logic
            const prevMsg = idx > 0 ? chatMessages[idx - 1] : null;
            const nextMsg = idx < chatMessages.length - 1 ? chatMessages[idx + 1] : null;
            
            // Time gap detection (WeChat style: show timestamp if gap > 5 minutes)
            const msgTime = msg.createdAt ? new Date(msg.createdAt) : null;
            const prevTime = prevMsg?.createdAt ? new Date(prevMsg.createdAt) : null;
            const showTimestamp = !prevMsg || (msgTime && prevTime && (msgTime.getTime() - prevTime.getTime() > 5 * 60 * 1000));
            
            // Format timestamp like WeChat
            const formatChatTime = (date: Date) => {
              const now = new Date();
              const isToday = date.toDateString() === now.toDateString();
              const yesterday = new Date(now);
              yesterday.setDate(yesterday.getDate() - 1);
              const isYesterday = date.toDateString() === yesterday.toDateString();
              
              const timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
              if (isToday) return timeStr;
              if (isYesterday) return `Yesterday ${timeStr}`;
              return `${date.getMonth() + 1}/${date.getDate()} ${timeStr}`;
            };
            
            // Message grouping: same sender within 2 minutes = same group
            const isSameSenderAsPrev = prevMsg && prevMsg.senderId === msg.senderId && prevMsg.messageType !== 'system';
            const isSameSenderAsNext = nextMsg && nextMsg.senderId === msg.senderId && nextMsg.messageType !== 'system';
            const isWithinGroupTime = prevTime && msgTime && (msgTime.getTime() - prevTime.getTime() < 2 * 60 * 1000);
            const isNextWithinGroupTime = nextMsg?.createdAt && msgTime && (new Date(nextMsg.createdAt).getTime() - msgTime.getTime() < 2 * 60 * 1000);
            
            const isFirstInGroup = !isSameSenderAsPrev || !isWithinGroupTime || showTimestamp;
            const isLastInGroup = !isSameSenderAsNext || !isNextWithinGroupTime;

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
                    <span className="text-xs text-red-400 flex items-center gap-1">
                      <X size={10} /> Not sent
                    </span>
                  </div>
                </div>
              );
            }

            // Normal text message
            // For group chats, use message sender info; for 1:1 chats, use chatPartner
            const msgSenderName = isGroup ? (msg.senderName || 'Unknown') : (chatPartner?.name || 'User');
            const msgSenderAvatar = isGroup ? msg.senderAvatar : chatPartner?.avatar;
            
            return (
              <div key={msg.id}>
                {/* WeChat-style centered timestamp */}
                {showTimestamp && msgTime && (
                  <div className="flex justify-center my-3">
                    <span className="text-xs text-stone-500 bg-stone-900/50 px-2 py-0.5 rounded">
                      {formatChatTime(msgTime)}
                    </span>
                  </div>
                )}
                
                <div 
                  ref={el => { messageRefs.current[String(msg.id)] = el; }} 
                  className={`flex items-start gap-2 ${isMe ? 'justify-end' : 'justify-start'} ${isFirstInGroup ? 'mt-3' : 'mt-1'} relative transition-colors duration-500 ${highlightedMsgId === msg.id ? 'bg-orange-500/15 rounded-xl' : ''}`}
                >
                  {/* Avatar: show on first message in group, placeholder for others */}
                  {!isMe && (
                    <div className="w-8 flex-shrink-0 pt-0.5">
                      {isFirstInGroup ? (
                        <button onClick={handleOpenProfile}>
                          <img src={getAvatarUrl(msgSenderAvatar, msgSenderName)} className="w-8 h-8 rounded-full object-cover" onError={(e) => handleAvatarError(e, msgSenderName)} />
                        </button>
                      ) : null}
                    </div>
                  )}
                  
                  <div className={`flex flex-col gap-0.5 max-w-[70%] ${isMe ? 'items-end' : 'items-start'}`}>
                    {/* Show sender name in group chats, only on first message in group */}
                    {isGroup && !isMe && isFirstInGroup && (
                      <span className="text-xs text-stone-500 mb-0.5">{msgSenderName}</span>
                    )}
                    {/* Reply preview - click to scroll to original */}
                    {msg.replyTo && (
                      <button
                        onClick={() => scrollToMessage(msg.replyTo!.id)}
                        className="text-xs text-stone-500 bg-stone-900/50 px-2 py-1 rounded-lg border-l-2 border-orange-500 text-left cursor-pointer hover:bg-stone-800/60 transition-colors max-w-full"
                      >
                        <span className="text-orange-400 font-medium">{msg.replyTo.sender_name}</span>
                        <span className="ml-1 line-clamp-1">↩ {msg.replyTo.content}</span>
                      </button>
                    )}
                    <button
                      className={`text-sm break-words text-left select-none ${
                        msg.mediaUrl
                          ? 'rounded-2xl overflow-hidden' + (isMe ? ' rounded-br-sm' : ' rounded-bl-sm')
                          : (isMe
                              ? 'px-3 py-2 bg-orange-600 text-white rounded-2xl rounded-br-sm'
                              : 'px-3 py-2 bg-stone-800 text-stone-100 rounded-2xl rounded-bl-sm')
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
                      {msg.mediaUrl ? (
                        <img
                          src={msg.mediaUrl}
                          alt=""
                          className="max-w-full max-h-60 object-cover rounded-2xl"
                          loading="lazy"
                          onClick={(e) => {
                            e.stopPropagation();
                            setChatLightboxSrc(msg.mediaUrl!);
                          }}
                        />
                      ) : (
                        msg.content
                      )}
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
                              hasMyReaction ? 'bg-orange-500/30 border border-orange-500/50' : 'bg-stone-800 border border-transparent'
                            }`}
                            onClick={(e) => handleReactionBadgeClick(e, msg.id, emoji)}
                            onMouseDown={() => handleReactionBadgeLongPressStart(msg.id, emoji)}
                            onMouseUp={handleReactionBadgeLongPressEnd}
                            onMouseLeave={handleReactionBadgeLongPressEnd}
                            onTouchStart={() => handleReactionBadgeLongPressStart(msg.id, emoji)}
                            onTouchEnd={handleReactionBadgeLongPressEnd}
                          >
                            <span>{emoji}</span>
                            {reactors.length > 1 && <span className="text-stone-400 min-w-[0.75rem] text-center">{reactors.length}</span>}
                          </button>
                        );
                      })}
                      
                      {/* Reactors popup on long press */}
                      {showReactorsFor?.messageId === msg.id && (
                        <>
                          <div className="fixed inset-0 z-40" onClick={() => setShowReactorsFor(null)} />
                          <div className="absolute bottom-full mb-2 left-0 bg-stone-900 border border-stone-700 rounded-xl p-3 shadow-xl z-50 min-w-[160px]">
                            <div className="text-sm font-bold mb-2 flex items-center gap-2">
                              <span className="text-lg">{showReactorsFor.emoji}</span>
                              <span className="text-stone-400">Reactions</span>
                            </div>
                            <div className="space-y-2 max-h-40 overflow-y-auto">
                              {msg.reactions
                                .filter(r => r.emoji === showReactorsFor.emoji)
                                .map((r, idx) => (
                                  <div key={`${r.user_id}-${idx}`} className="flex items-center gap-2">
                                    <div className="w-6 h-6 rounded-full bg-stone-700 flex items-center justify-center text-xs font-bold">
                                      {r.user_name?.charAt(0)?.toUpperCase() || '?'}
                                    </div>
                                    <span className="text-sm text-stone-300">{r.user_name}</span>
                                    {currentUser && Number(r.user_id) === Number(currentUser.id) && (
                                      <span className="text-xs text-orange-400">(you)</span>
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

                {/* Message action menu - bottom sheet style */}
                {isSelected && menuPosition && (
                  <>
                    <div className="fixed inset-0 z-40 bg-black/40" onClick={(e) => { e.stopPropagation(); setSelectedMessageId(null); setMenuPosition(null); }} />
                    <div
                      className="fixed z-50 bottom-0 left-0 right-0 bg-stone-900 rounded-t-2xl shadow-2xl overflow-hidden safe-bottom-nav"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {/* Drag handle */}
                      <div className="flex justify-center pt-2.5 pb-1">
                        <div className="w-9 h-1 rounded-full bg-stone-700" />
                      </div>
                      {/* Emoji reactions row */}
                      <div className="px-4 py-2.5 flex items-center justify-around border-b border-stone-800/60">
                        {defaultReactions.slice(emojiPage * 5, emojiPage * 5 + 5).map(emoji => (
                          <button
                            key={emoji}
                            className="text-2xl active:scale-90 transition-transform p-1.5"
                            onClick={() => handleReaction(emoji)}
                          >
                            {emoji}
                          </button>
                        ))}
                        <button
                          className="text-stone-500 active:text-stone-300 p-1.5 text-lg font-bold"
                          onClick={() => setEmojiPage(p => (p + 1) % 2)}
                        >
                          ···
                        </button>
                      </div>
                      {/* Action buttons */}
                      <div className="py-1">
                        <button className="w-full px-5 py-3 text-left text-[13px] font-medium text-stone-200 active:bg-stone-800 flex items-center gap-3" onClick={() => handleMessageAction('reply')}>
                          <Reply size={18} className="text-orange-500" /> Reply
                        </button>
                        <button className="w-full px-5 py-3 text-left text-[13px] font-medium text-stone-200 active:bg-stone-800 flex items-center gap-3" onClick={() => handleMessageAction('forward')}>
                          <Forward size={18} className="text-orange-500" /> Forward
                        </button>
                        <button className="w-full px-5 py-3 text-left text-[13px] font-medium text-stone-200 active:bg-stone-800 flex items-center gap-3" onClick={() => handleMessageAction('copy')}>
                          <Copy size={18} className="text-orange-500" /> Copy
                        </button>
                        {isMe && canRetreat(msg) && (
                          <button className="w-full px-5 py-3 text-left text-[13px] font-medium text-stone-200 active:bg-stone-800 flex items-center gap-3" onClick={() => handleMessageAction('retreat')}>
                            <Undo2 size={18} className="text-amber-400" /> Retreat
                          </button>
                        )}
                        <button className="w-full px-5 py-3 text-left text-[13px] font-medium text-red-400 active:bg-stone-800 flex items-center gap-3" onClick={() => handleMessageAction('delete')}>
                          <Trash2 size={18} /> Delete for me
                        </button>
                      </div>
                    </div>
                  </>
                )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Reply preview bar */}
        {replyingTo && (
          <div className="px-4 py-2 bg-stone-900 border-t border-stone-800 flex items-center gap-3">
            <div className="flex-1 text-sm text-stone-400 truncate">
              <span className="text-orange-400">↩ Replying:</span> {replyingTo.content.slice(0, 50)}{replyingTo.content.length > 50 ? '...' : ''}
            </div>
            <button onClick={() => setReplyingTo(null)} className="text-stone-500 hover:text-stone-300">
              <X size={16} />
            </button>
          </div>
        )}

        {/* Attachment picker */}
        {showAttachmentPicker && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setShowAttachmentPicker(false)} />
            <div className="absolute bottom-24 right-16 bg-stone-900 border border-stone-800 rounded-xl shadow-xl overflow-hidden z-20">
              <button 
                className="w-full px-4 py-3 text-left text-sm text-stone-200 hover:bg-stone-800 flex items-center gap-3"
                onClick={() => handleAttachment('camera')}
              >
                <Camera size={18} className="text-orange-400" /> Camera
              </button>
              <button 
                className="w-full px-4 py-3 text-left text-sm text-stone-200 hover:bg-stone-800 flex items-center gap-3"
                onClick={() => handleAttachment('album')}
              >
                <Image size={18} className="text-orange-400" /> Album
              </button>
            </div>
          </>
        )}

        {/* Hidden file input for chat images */}
        <input
          ref={chatImageInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          onChange={handleChatImageSelect}
        />

        {/* Emoji picker */}
        {showEmojiPicker && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setShowEmojiPicker(false)} />
            <div className="absolute bottom-24 right-4 bg-stone-900 border border-stone-800 rounded-xl shadow-xl p-3 z-20">
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

        {/* Upload indicator */}
        {isUploadingChatImage && (
          <div className="px-4 py-2 bg-stone-900 border-t border-stone-800 flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-stone-400">Uploading image...</span>
          </div>
        )}

        {/* Input */}
        {selectedChat && (removedFromSessions.has(Number(selectedChat.id)) || chatSessions.find(s => Number(s.id) === Number(selectedChat.id))?.userHasLeft) ? (
          <div className="p-4 bg-black border-t border-stone-900 safe-bottom-nav">
            <div className="bg-stone-900 rounded-xl px-4 py-3 text-center text-stone-500 text-sm">
              You were removed from this group
            </div>
          </div>
        ) : (
          <div className="p-4 bg-black border-t border-stone-900 flex items-center gap-3 safe-bottom-nav">
            <div className="flex-1 bg-stone-900 rounded-xl px-4 py-3 flex items-center">
              <input 
                value={chatMessageInput}
                onChange={(e) => setChatMessageInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                placeholder={replyingTo ? 'Reply...' : 'Message...'} 
                className="bg-transparent border-none outline-none text-sm w-full" 
              />
            </div>
            <button 
              className="p-2 text-stone-400 hover:text-orange-400 transition-colors"
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
                className="p-2 text-stone-400 hover:text-orange-400 transition-colors"
                onClick={(e) => { e.stopPropagation(); setShowAttachmentPicker(prev => !prev); setShowEmojiPicker(false); }}
              >
                <Plus size={22} />
              </button>
            )}
          </div>
        )}

        {chatLightboxSrc && (
          <ImageLightbox src={chatLightboxSrc} onClose={() => setChatLightboxSrc(null)} />
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
        <div className="p-4 bg-black/80 backdrop-blur-md border-b border-stone-900 flex items-center gap-4">
          <button onClick={() => { setCurrentView('MAIN'); setInvitePreview(null); setInviteCodeInput(''); }}><ArrowLeft /></button>
          <span className="font-bold">Join Group</span>
        </div>

        <div className="flex-1 p-4 flex flex-col">
          {/* Input */}
          <div className="space-y-3">
            <label className="text-sm text-stone-400">Enter invite code</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={inviteCodeInput}
                onChange={(e) => setInviteCodeInput(e.target.value)}
                placeholder="e.g. abc123xyz"
                className="flex-1 bg-stone-900 border border-stone-800 rounded-xl px-4 py-3"
              />
              <button
                onClick={handlePreview}
                className="px-4 bg-stone-800 rounded-xl"
              >
                Preview
              </button>
            </div>
          </div>

          {/* Preview */}
          {invitePreview && (
            <div className="mt-6 bg-stone-900/50 rounded-2xl p-6 flex flex-col items-center gap-4">
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center">
                {invitePreview.avatar ? (
                  <img src={invitePreview.avatar} className="w-20 h-20 rounded-full object-cover" />
                ) : (
                  <Users className="w-10 h-10 text-white" />
                )}
              </div>
              <h2 className="text-xl font-bold">{invitePreview.group_name || 'Unnamed Group'}</h2>
              <p className="text-stone-500">{invitePreview.member_count} members</p>
              {invitePreview.description && (
                <p className="text-stone-400 text-sm text-center">{invitePreview.description}</p>
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
              className="w-full py-4 bg-stone-900 rounded-xl flex items-center justify-center gap-2 text-stone-400"
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
        <div className="p-4 bg-black border-b border-stone-900 flex items-center gap-4">
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
              <div className="bg-stone-900/60 rounded-2xl p-4">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm font-medium text-stone-400 uppercase tracking-wider">
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
                          src={getAvatarUrl(member.user.avatar, member.user.name)}
                          className="w-14 h-14 rounded-xl object-cover border-2 border-stone-800 group-hover:border-orange-500/50 transition-colors"
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
                      <span className="text-xs text-stone-500 truncate w-full text-center">
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
                      <div className="w-14 h-14 rounded-xl border-2 border-dashed border-stone-700 group-hover:border-orange-500/50 flex items-center justify-center mb-1 transition-colors">
                        <Plus className="w-6 h-6 text-stone-600 group-hover:text-orange-500 transition-colors" />
                      </div>
                      <span className="text-xs text-stone-600">Add</span>
                    </button>
                  )}
                  {/* Remove button (admin only) */}
                  {isAdmin && groupDetail.members.length > 1 && (
                    <button
                      onClick={() => setShowMemberActions(-1)}
                      className="flex flex-col items-center w-16 group"
                    >
                      <div className="w-14 h-14 rounded-xl border-2 border-dashed border-stone-700 group-hover:border-red-500/50 flex items-center justify-center mb-1 transition-colors">
                        <UserMinus className="w-6 h-6 text-stone-600 group-hover:text-red-500 transition-colors" />
                      </div>
                      <span className="text-xs text-stone-600">Remove</span>
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
              <div className="bg-stone-900/60 rounded-2xl overflow-hidden">
                {/* Group Name */}
                <button
                  onClick={() => {
                    if (isAdmin) {
                      setEditGroupName(groupDetail.name || '');
                      setIsEditingGroup(true);
                    }
                  }}
                  className="w-full px-4 py-4 flex items-center justify-between hover:bg-stone-800/50 transition-colors"
                >
                  <span className="text-stone-300">Group Name</span>
                  <div className="flex items-center gap-2">
                    <span className="text-stone-500 text-sm max-w-[180px] truncate">{groupDetail.name || 'Unnamed'}</span>
                    {isAdmin && <ArrowLeft className="w-4 h-4 text-stone-600 rotate-180" />}
                  </div>
                </button>

                <div className="h-px bg-stone-800 mx-4" />

                {/* Announcement */}
                <button
                  onClick={() => {
                    if (isAdmin) {
                      setEditGroupDescription(groupDetail.description || '');
                      setIsEditingGroup(true);
                    }
                  }}
                  className="w-full px-4 py-4 flex items-center justify-between hover:bg-stone-800/50 transition-colors"
                >
                  <span className="text-stone-300">Announcement</span>
                  <div className="flex items-center gap-2">
                    <span className="text-stone-500 text-sm max-w-[180px] truncate">{groupDetail.description || 'None'}</span>
                    <ArrowLeft className="w-4 h-4 text-stone-600 rotate-180" />
                  </div>
                </button>

                <div className="h-px bg-stone-800 mx-4" />

                {/* Invite via Link */}
                <button
                  onClick={handleCreateInviteLink}
                  className="w-full px-4 py-4 flex items-center justify-between hover:bg-stone-800/50 transition-colors"
                >
                  <span className="text-stone-300">Invite via Link</span>
                  <div className="flex items-center gap-2">
                    <Link className="w-4 h-4 text-orange-500" />
                  </div>
                </button>

                {/* Admin Settings */}
                {isAdmin && (
                  <>
                    <div className="h-px bg-stone-800 mx-4" />
                    <button
                      onClick={() => setSettingsMenu('who_can_send')}
                      className="w-full px-4 py-4 flex items-center justify-between hover:bg-stone-800/50 transition-colors"
                    >
                      <span className="text-stone-300">Who can send</span>
                      <div className="flex items-center gap-2">
                        <span className="text-orange-500 text-sm">
                          {groupDetail.who_can_send === 'all' ? 'Everyone' : 'Admins Only'}
                        </span>
                        <ArrowLeft className="w-4 h-4 text-stone-600 rotate-180" />
                      </div>
                    </button>

                    <div className="h-px bg-stone-800 mx-4" />
                    <button
                      onClick={() => setSettingsMenu('who_can_add')}
                      className="w-full px-4 py-4 flex items-center justify-between hover:bg-stone-800/50 transition-colors"
                    >
                      <span className="text-stone-300">Who can add members</span>
                      <div className="flex items-center gap-2">
                        <span className="text-orange-500 text-sm">
                          {groupDetail.who_can_add === 'all' ? 'Everyone' : 'Admins Only'}
                        </span>
                        <ArrowLeft className="w-4 h-4 text-stone-600 rotate-180" />
                      </div>
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Danger Zone */}
            <div className="px-4 mt-6">
              <div className="bg-stone-900/60 rounded-2xl overflow-hidden">
                <button
                  onClick={handleLeaveGroup}
                  className="w-full px-4 py-4 flex items-center justify-center gap-2 hover:bg-red-500/10 transition-colors"
                >
                  <LogOut className="w-5 h-5 text-red-500" />
                  <span className="text-red-500 font-medium">Leave Group</span>
                </button>
                {isOwner && (
                  <>
                    <div className="h-px bg-stone-800 mx-4" />
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
            <div className="fixed inset-0 z-[70] overlay-dim-60" onClick={() => setSettingsMenu(null)} />
            <div className="fixed bottom-0 left-0 right-0 z-[70] bg-stone-900 rounded-t-3xl p-4 space-y-2">
              <div className="w-12 h-1 bg-stone-700 rounded-full mx-auto mb-4" />
              <p className="text-center text-stone-400 text-sm mb-4">
                {settingsMenu === 'who_can_send' ? 'Who can send messages?' : 'Who can add members?'}
              </p>
              <button
                onClick={() => handleSettingChange(settingsMenu, 'all')}
                className={`w-full py-4 rounded-xl text-center font-medium transition-colors ${
                  groupDetail[settingsMenu] === 'all' 
                    ? 'bg-orange-500 text-white' 
                    : 'bg-stone-800 text-stone-300 hover:bg-stone-700'
                }`}
              >
                Everyone
              </button>
              <button
                onClick={() => handleSettingChange(settingsMenu, 'admins_only')}
                className={`w-full py-4 rounded-xl text-center font-medium transition-colors ${
                  groupDetail[settingsMenu] === 'admins_only' 
                    ? 'bg-orange-500 text-white' 
                    : 'bg-stone-800 text-stone-300 hover:bg-stone-700'
                }`}
              >
                Admins Only
              </button>
              <button
                onClick={() => setSettingsMenu(null)}
                className="w-full py-4 text-stone-500 text-center"
              >
                Cancel
              </button>
            </div>
          </>
        )}

        {/* Edit Group Modal */}
        {isEditingGroup && (
          <>
            <div className="fixed inset-0 z-[70] overlay-dim-60" onClick={() => setIsEditingGroup(false)} />
            <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-[70] bg-stone-900 rounded-2xl p-5 space-y-4 max-w-sm mx-auto">
              <h3 className="font-bold text-lg text-center">Edit Group</h3>
              <div className="space-y-3">
                <input
                  type="text"
                  value={editGroupName}
                  onChange={(e) => setEditGroupName(e.target.value)}
                  placeholder="Group name"
                  className="w-full bg-stone-800 border border-stone-700 rounded-xl px-4 py-3 focus:border-orange-500 focus:outline-none transition-colors"
                  autoFocus
                />
                <textarea
                  value={editGroupDescription}
                  onChange={(e) => setEditGroupDescription(e.target.value)}
                  placeholder="Announcement (optional)"
                  rows={3}
                  className="w-full bg-stone-800 border border-stone-700 rounded-xl px-4 py-3 resize-none focus:border-orange-500 focus:outline-none transition-colors"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button 
                  onClick={() => setIsEditingGroup(false)} 
                  className="flex-1 py-3 bg-stone-800 hover:bg-stone-700 rounded-xl transition-colors"
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
            <div className="fixed inset-0 z-[70] overlay-dim-60" onClick={() => { setShowAddMembersModal(false); setSelectedNewMembers(new Set()); }} />
            <div className="fixed bottom-0 left-0 right-0 z-[70] bg-stone-900 rounded-t-3xl max-h-[80vh] flex flex-col">
              <div className="p-4 border-b border-stone-800 flex items-center justify-between">
                <span className="font-bold text-lg">Add Members</span>
                <button 
                  onClick={() => { setShowAddMembersModal(false); setSelectedNewMembers(new Set()); }}
                  className="p-2 hover:bg-stone-800 rounded-full transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-4">
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-500" />
                  <input
                    type="text"
                    value={addMemberSearch}
                    onChange={async (e) => {
                      setAddMemberSearch(e.target.value);
                      try {
                        const query = e.target.value.trim();
                        const results = query
                          ? await api.searchUsers(query)
                          : await api.listUsers();
                        const existingIds = new Set(groupDetail.members.map(m => m.user.id));
                        setAddMemberResults(results.filter((u: any) => !existingIds.has(u.id)));
                      } catch (error) {
                        // Search failed silently
                      }
                    }}
                    placeholder="Search users..."
                    className="w-full bg-stone-800 border border-stone-700 rounded-xl pl-12 pr-4 py-3 focus:border-orange-500 focus:outline-none transition-colors"
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
                    className={`w-full p-3 rounded-xl flex items-center gap-3 ${selectedNewMembers.has(Number(user.id)) ? 'bg-orange-500/20 border border-orange-500' : 'bg-stone-800'}`}
                  >
                    <img src={getAvatarUrl(user.avatar, user.name)} className="w-10 h-10 rounded-full" onError={(e) => handleAvatarError(e, user.name)} />
                    <div className="flex-1 text-left">
                      <p className="font-medium">{user.name}</p>
                      <p className="text-stone-500 text-sm">@{user.handle}</p>
                    </div>
                    {selectedNewMembers.has(Number(user.id)) && <Check className="w-5 h-5 text-orange-500" />}
                  </button>
                ))}
              </div>
              {selectedNewMembers.size > 0 && (
                <div className="p-4 border-t border-stone-800">
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
            <div className="w-full bg-stone-900 rounded-t-3xl max-h-[60vh] flex flex-col">
              <div className="p-4 border-b border-stone-800 flex items-center justify-between">
                <span className="font-bold">Remove Member</span>
                <button onClick={() => setShowMemberActions(null)}>
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto divide-y divide-stone-800">
                {groupDetail.members
                  .filter(m => m.user.id !== currentUser.id && (isOwner || m.role === 'member'))
                  .map((member) => (
                    <button
                      key={member.user.id}
                      onClick={() => handleRemoveMember(member.user.id)}
                      className="w-full p-4 flex items-center gap-3 hover:bg-stone-800"
                    >
                      <img
                        src={getAvatarUrl(member.user.avatar, member.user.name)}
                        className="w-10 h-10 rounded-full"
                      />
                      <div className="flex-1 text-left">
                        <p className="font-medium">{member.user.name}</p>
                        <p className="text-stone-500 text-sm">@{member.user.handle}</p>
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
        <div className="flex flex-col items-center p-6 border-b border-stone-900">
          <img src={getAvatarUrl(selectedUser.avatar, selectedUser.name)} className="w-24 h-24 rounded-full border-2 border-orange-500 p-1 object-cover mb-4" onError={(e) => handleAvatarError(e, selectedUser.name)} />
          <h2 className="text-2xl font-bold tracking-tight font-display uppercase mb-1">{selectedUser.name}</h2>
          <span className="text-stone-500 text-xs font-medium mb-4">{selectedUser.handle}</span>
          
          <div className="flex gap-4 mt-4 w-full">
            <button 
              onClick={handleFollowToggle}
              className={`flex-1 font-bold py-3 rounded-xl text-sm uppercase tracking-tight font-display ${
                isFollowingProfile
                  ? 'bg-stone-800 text-stone-300 border border-stone-700'
                  : 'bg-white text-black'
              }`}
            >
              {isFollowingProfile ? 'Following ✓' : 'Follow'}
            </button>
            <button 
              className={`flex-1 font-bold py-3 rounded-xl text-sm uppercase tracking-tight font-display border ${
                canMessage
                  ? 'bg-orange-500 text-white border-orange-500'
                  : 'bg-stone-900 text-stone-500 border-stone-800'
              }`}
              onClick={handleStartChat}
              disabled={!canMessage}
            >
              {getMessageButtonText()}
            </button>
          </div>
        </div>
        
        <div className="p-4">
          <h3 className="text-xs font-bold text-stone-500 uppercase tracking-wide mb-4">Activity</h3>
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
      <div className="p-4 sticky top-0 bg-black/85 backdrop-blur-md border-b border-stone-900 flex items-center gap-4">
        <button onClick={() => setCurrentView('MAIN')} aria-label="Go back"><ArrowLeft /></button>
        <h2 className="text-lg font-bold uppercase tracking-wide font-display">Settings</h2>
      </div>
      <div className="p-4 space-y-3">
        {/* Theme Toggle */}
        <button
          onClick={toggleTheme}
          className="w-full flex items-center justify-between p-4 bg-stone-900/50 border border-stone-800 rounded-2xl active:bg-stone-900 transition-colors"
        >
          <div className="flex items-center gap-3">
            {isDark ? <Moon size={20} className="text-orange-500" /> : <Sun size={20} className="text-orange-500" />}
            <div className="text-left">
              <span className="text-sm font-bold text-stone-200 block">Appearance</span>
              <span className="text-xs text-stone-500">{isDark ? 'Dark mode' : 'Light mode'}</span>
            </div>
          </div>
          <div className={`w-11 h-6 rounded-full p-0.5 transition-colors duration-200 ${isDark ? 'bg-orange-500' : 'bg-stone-600'}`}>
            <div className={`w-5 h-5 rounded-full shadow transition-transform duration-200 ${isDark ? 'translate-x-5' : 'translate-x-0'}`} style={{ backgroundColor: '#fff' }} />
          </div>
        </button>

        {[
          { label: 'Account', sublabel: 'Manage your account details' },
          { label: 'Privacy', sublabel: 'Control who can see your content' },
          { label: 'Notifications', sublabel: 'Push and in-app notifications' },
          { label: 'Language', sublabel: 'English' },
          { label: 'About', sublabel: 'Version 0.1.0' },
        ].map((item, idx) => (
          <button
            key={idx}
            className="w-full flex items-center justify-between p-4 bg-stone-900/50 border border-stone-800 rounded-2xl active:bg-stone-900 transition-colors"
          >
            <div className="text-left">
              <span className="text-sm font-bold text-stone-200 block">{item.label}</span>
              <span className="text-xs text-stone-500">{item.sublabel}</span>
            </div>
            <ArrowLeft className="rotate-180 text-stone-600" size={16} />
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
    <div className="h-dvh flex flex-col overflow-hidden select-none app-shell">
      {renderHeader()}
      <main
        ref={mainContentRef}
        className="flex-1 overflow-y-auto max-w-md mx-auto w-full"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {renderContent()}
      </main>
      
      {/* Sub-Views Logic */}
      {currentView === 'SEARCH' && renderSearch()}
      {currentView === 'POST_DETAIL' && renderPostDetail()}
      {currentView === 'QA_DETAIL' && renderQADetail()}
      {currentView === 'TRANSACTIONS' && renderTransactions()}
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
      {currentView === 'DEPOSIT' && <DepositView onBack={() => setCurrentView('MAIN')} />}
      {currentView === 'WITHDRAW' && <WithdrawView onBack={() => setCurrentView('MAIN')} />}
      {currentView === 'EXCHANGE' && <ExchangeView onBack={() => setCurrentView('MAIN')} />}
      
      {/* Inline Comment Sheet */}
      {renderInlineCommentSheet()}

      {/* Challenge Modal removed in minimal system */}

      {/* Like Stake Modal */}
      <LikeStakeModal
        isOpen={showLikeModal}
        onClose={() => setShowLikeModal(false)}
        onConfirm={handleLikeConfirm}
        stakeAmount={LIKE_STAKE}
        userBalance={availableBalance}
      />

      {/* Boost Modal removed in minimal system */}
      
      {/* Modals */}
      {renderPublishOverlay()}
      {renderBottomNav()}
      <ToastContainer />
    </div>
  );
};

export default App;
