import React from 'react';
import { createPortal } from 'react-dom';
import { Post } from '../types';
import { Heart, MessageSquare, Cpu, TrendingUp, MoreHorizontal, Trash2, Flag } from 'lucide-react';
import { Badge } from './ui/Badge';
import ImageGrid from './ImageGrid';

interface PostCardProps {
  post: Post;
  onClick?: (post: Post) => void;
  onUserClick?: (userId: string) => void;
  onChallenge?: (post: Post) => void;
  onLike?: (post: Post) => void;
  onComment?: (post: Post) => void;
  onDelete?: (post: Post) => void;
  isLiked?: boolean;
  likeCost?: number;
  isOwnPost?: boolean;
  hideMenu?: boolean;
  menuOpen?: boolean;
  onMenuToggle?: (postId: number | string | null) => void;
}

function getHeartColor(isLiked: boolean, likeStatus?: 'pending' | 'settled' | null): string {
  if (!isLiked) {
    return 'text-stone-400 hover:text-pink-400';
  }
  if (likeStatus === 'pending') {
    return 'text-rose-500';
  }
  return 'text-orange-500';
}

export const PostCard: React.FC<PostCardProps> = ({ post, onClick, onUserClick, onChallenge, onLike, onComment, onDelete, isLiked, likeCost, isOwnPost, hideMenu, menuOpen, onMenuToggle }) => {
  const [isExpanded, setIsExpanded] = React.useState(false);
  const [isShaking, setIsShaking] = React.useState(false);
  const showMenu = menuOpen ?? false;
  const setShowMenu = (open: boolean) => onMenuToggle?.(open ? post.id : null);
  const menuBtnRef = React.useRef<HTMLButtonElement>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!showMenu) return;
    const dismiss = () => setShowMenu(false);
    const onTapOutside = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (menuRef.current?.contains(target)) return;
      if (menuBtnRef.current?.contains(target)) return;
      dismiss();
    };
    window.addEventListener('scroll', dismiss, { capture: true, passive: true });
    document.addEventListener('mousedown', onTapOutside);
    document.addEventListener('touchstart', onTapOutside, { passive: true });
    return () => {
      window.removeEventListener('scroll', dismiss, { capture: true });
      document.removeEventListener('mousedown', onTapOutside);
      document.removeEventListener('touchstart', onTapOutside);
    };
  }, [showMenu]);
  const contentText = post.content.trim();
  const articlePreview = contentText.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  const shouldClampContent = post.type !== 'Article' && (
    contentText.length > 140 || contentText.split('\n').length > 3
  );

  return (
    <div
      data-testid={`post-card-${post.id}`}
      className="border border-stone-800 rounded-2xl p-3 mb-2.5 active:scale-[0.98] transition-all duration-100 bg-stone-900 post-card"
      onClick={() => { if (showMenu) { setShowMenu(false); return; } onClick?.(post); }}
    >
      <div className="flex items-start gap-3 mb-2.5">
        <button
          className="w-10 h-10 rounded-full shrink-0"
          onClick={(e) => { e.stopPropagation(); onUserClick?.(String(post.author.id)); }}
          aria-label={`View ${post.author.name} profile`}
        >
          <img
            src={post.author.avatar || `https://i.pravatar.cc/150?u=${encodeURIComponent(post.author.name)}`}
            className="w-full h-full rounded-full object-cover border-2 border-stone-700"
            alt={post.author.name}
            onError={(e) => {
              (e.target as HTMLImageElement).src = `https://i.pravatar.cc/150?u=${encodeURIComponent(post.author.name)}`;
            }}
          />
        </button>
        <div className="flex-1 overflow-hidden">
          <div className="flex items-center gap-2">
            <span
              className="font-bold text-sm truncate max-w-[120px]"
              onClick={(e) => { e.stopPropagation(); onUserClick?.(String(post.author.id)); }}
            >
              {post.author.name}
            </span>
            {post.isAI && (
              <Badge variant="purple" className="text-xs py-0">
                <Cpu size={10} /> AI
              </Badge>
            )}
            {post.likes > 10 && (
              <Badge variant="green" className="text-xs py-0">
                <TrendingUp size={10} /> Hot
              </Badge>
            )}
          </div>
          <span className="text-stone-500 text-xs">{post.author.handle} · {post.timestamp}</span>
        </div>
        {!hideMenu && (
          <div className="relative shrink-0">
            <button
              ref={menuBtnRef}
              className={`p-1.5 -mr-1.5 -mt-0.5 rounded-full hover:bg-stone-800/60 transition-colors ${showMenu ? 'text-orange-500' : 'text-stone-500'}`}
              onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }}
            >
              <MoreHorizontal size={18} />
            </button>
            {showMenu && createPortal(
                <div
                  ref={menuRef}
                  className="fixed bg-stone-900 border border-stone-700 rounded-xl shadow-2xl overflow-hidden min-w-[200px] z-[56]"
                  style={{
                    top: (menuBtnRef.current?.getBoundingClientRect().bottom ?? 0) + 4,
                    right: window.innerWidth - (menuBtnRef.current?.getBoundingClientRect().right ?? 0),
                  }}
                >
                  {isOwnPost && onDelete && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setShowMenu(false); onDelete(post); }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-orange-400 hover:bg-stone-800 transition-colors text-sm font-bold"
                    >
                      <Trash2 size={16} /> Delete
                    </button>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); setShowMenu(false); onChallenge?.(post); }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-stone-300 hover:bg-stone-800 transition-colors text-sm"
                  >
                    <Flag size={16} /> Report
                  </button>
                </div>,
              document.body
            )}
          </div>
        )}
      </div>

      {post.type === 'Question' && (
        <div className="mb-1.5">
          <span className="bg-orange-500 text-white text-xs font-bold px-2 py-0.5 rounded-full mr-2 uppercase tracking-tight">
            Question
          </span>
          {post.bounty && (
            <span className="text-orange-400 text-xs font-bold tabular-nums">
              {post.bounty.toLocaleString()} sats bounty
            </span>
          )}
        </div>
      )}

      {post.type === 'Article' && post.title && (
        <h3 className="text-lg font-bold text-white mb-1.5 font-body">{post.title}</h3>
      )}

      {post.type === 'Article' ? (
        <>
          <p className="text-stone-200 text-sm leading-relaxed mb-3">
            {articlePreview.length > 150 ? `${articlePreview.slice(0, 150).trim()}...` : articlePreview}
          </p>
          <button
            className="text-orange-400 text-sm font-medium hover:text-orange-300 transition-colors mb-2.5"
            onClick={(e) => { e.stopPropagation(); onClick?.(post); }}
          >
            Read full article →
          </button>
        </>
      ) : (
        <>
          <p
            className={`text-stone-200 text-sm leading-relaxed mb-2 whitespace-pre-wrap break-words ${
              shouldClampContent && !isExpanded ? 'line-clamp-4' : ''
            }`}
          >
            {contentText}
          </p>
          {shouldClampContent && (
            <button
              className="text-stone-500 text-xs font-medium hover:text-stone-300 transition-colors mb-2.5"
              onClick={(e) => {
                e.stopPropagation();
                setIsExpanded((prev) => !prev);
              }}
            >
              {isExpanded ? 'Show less' : 'Show more'}
            </button>
          )}
        </>
      )}

      {post.mediaUrls && post.mediaUrls.length > 0 && (
        <div className="mb-2" onClick={(e) => e.stopPropagation()}>
          <ImageGrid urls={post.mediaUrls} />
        </div>
      )}

      <div className="flex items-center justify-between pt-1.5 border-t border-stone-800/50">
        <div className="flex items-center gap-4">
          <button
            data-testid={`like-button-${post.id}`}
            className={`flex items-center gap-1.5 transition-colors ${getHeartColor(isLiked || false, post.likeStatus)}`}
            onClick={(e) => {
              e.stopPropagation();
              if (isLiked && post.likeStatus === 'settled') {
                setIsShaking(true);
                setTimeout(() => setIsShaking(false), 400);
                return;
              }
              onLike?.(post);
            }}
          >
            <Heart size={18} className={`${isLiked ? 'fill-current' : ''} ${isLiked && !isShaking ? 'animate-heart-pop' : ''} ${isShaking ? 'animate-shake' : ''}`} />
            <span className="text-xs font-medium">{post.likes}</span>
            {!isLiked && likeCost && (
              <span className="text-xs text-stone-500 ml-1">({likeCost} sat)</span>
            )}
          </button>
          <button
            className="flex items-center gap-1.5 text-stone-400 hover:text-blue-400 transition-colors"
            onClick={(e) => { e.stopPropagation(); onComment ? onComment(post) : onClick?.(post); }}
          >
            <MessageSquare size={18} />
            <span className="text-xs font-medium">{post.comments}</span>
          </button>
        </div>
        <div />
      </div>
    </div>
  );
};
