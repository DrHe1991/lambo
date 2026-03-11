import React from 'react';
import { Post } from '../types';
import { Heart, MessageSquare, ShieldAlert, Cpu, FileText, TrendingUp } from 'lucide-react';
import { getTrustRingClass, getTrustTier } from '../trustTheme';

interface PostCardProps {
  post: Post;
  onClick?: (post: Post) => void;
  onUserClick?: (userId: string) => void;
  onChallenge?: (post: Post) => void;
  onLike?: (post: Post) => void;
  onComment?: (post: Post) => void;
  isLiked?: boolean;
  likeCost?: number;  // Dynamic like cost from API
}

export const PostCard: React.FC<PostCardProps> = ({ post, onClick, onUserClick, onChallenge, onLike, onComment, isLiked, likeCost }) => {
  const trustTier = getTrustTier(post.author.trustScore);
  const isOrangeTier = trustTier === 'orange';

  return (
    <div 
      data-testid={`post-card-${post.id}`}
      className="border rounded-2xl p-4 mb-3 active:scale-[0.98] transition-transform duration-100 bg-zinc-900 border-zinc-800"
      onClick={() => onClick?.(post)}
    >
      <div className="flex items-start gap-3 mb-3">
        <button
          className={`w-10 h-10 rounded-full p-[2px] ${getTrustRingClass(post.author.trustScore)} shrink-0 ${
            isOrangeTier ? 'shadow-[0_0_14px_rgba(249,115,22,0.45)]' : ''
          }`}
          onClick={(e) => { e.stopPropagation(); onUserClick?.(post.author.id); }}
          aria-label={`View ${post.author.name} profile`}
        >
          <img 
            src={post.author.avatar || `https://i.pravatar.cc/150?u=${encodeURIComponent(post.author.name)}`} 
            className="w-full h-full rounded-full object-cover border border-zinc-900"
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
              onClick={(e) => { e.stopPropagation(); onUserClick?.(post.author.id); }}
            >
              {post.author.name}
            </span>
            {post.isAI && (
              <div className="flex items-center gap-1 bg-purple-500/10 border border-purple-500/30 text-purple-400 px-1.5 py-0.5 rounded text-[10px] font-bold">
                <Cpu size={10} /> AI
              </div>
            )}
            {post.likes > 10 && (
              <div className="flex items-center gap-1 bg-green-500/15 border border-green-400/50 text-green-300 px-1.5 py-0.5 rounded text-[10px] font-bold">
                <TrendingUp size={10} /> Hot
              </div>
            )}
          </div>
          <span className="text-zinc-500 text-xs">{post.author.handle} · {post.timestamp}</span>
        </div>
      </div>

      {post.type === 'Article' && (
        <div className="mb-2">
          <span className="inline-flex items-center gap-1 bg-purple-500/20 text-purple-400 text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-tight">
            <FileText size={10} /> Article
          </span>
        </div>
      )}

      {post.type === 'Question' && (
        <div className="mb-2">
          <span className="bg-orange-500 text-white text-[10px] font-black px-2 py-0.5 rounded mr-2 uppercase tracking-tight">
            Question
          </span>
          {post.bounty && (
            <span className="text-orange-400 text-xs font-bold">
              💰 {post.bounty.toLocaleString()} sats bounty
            </span>
          )}
        </div>
      )}

      {post.type === 'Article' && post.title && (
        <h3 className="text-lg font-bold text-white mb-2">{post.title}</h3>
      )}

      <p className="text-zinc-200 text-sm leading-relaxed mb-4 whitespace-pre-wrap">
        {post.type === 'Article' && post.content.length > 200 
          ? `${post.content.slice(0, 200).trim()}...`
          : post.content
        }
      </p>

      {post.type === 'Article' && post.content.length > 200 && (
        <button 
          className="text-purple-400 text-sm font-medium hover:text-purple-300 mb-3"
          onClick={(e) => { e.stopPropagation(); onClick?.(post); }}
        >
          Read more →
        </button>
      )}

      <div className="flex items-center justify-between pt-2 border-t border-zinc-800/50">
        <div className="flex items-center gap-4">
          <button 
            data-testid={`like-button-${post.id}`}
            className={`flex items-center gap-1.5 transition-colors ${isLiked ? 'text-pink-500' : 'text-zinc-400 hover:text-pink-400'}`}
            onClick={(e) => { e.stopPropagation(); onLike?.(post); }}
          >
            <Heart size={18} className={isLiked ? 'fill-current' : ''} />
            <span className="text-xs font-medium">{post.likes}</span>
            {!isLiked && likeCost && (
              <span className="text-[10px] text-zinc-500 ml-1">({likeCost} sat)</span>
            )}
          </button>
          <button
            className="flex items-center gap-1.5 text-zinc-400 hover:text-blue-400 transition-colors"
            onClick={(e) => { e.stopPropagation(); onComment ? onComment(post) : onClick?.(post); }}
          >
            <MessageSquare size={18} />
            <span className="text-xs font-medium">{post.comments}</span>
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button 
            data-testid={`report-button-${post.id}`}
            className="flex items-center gap-1 text-zinc-600 hover:text-red-500 transition-colors"
            onClick={(e) => { e.stopPropagation(); onChallenge?.(post); }}
          >
            <ShieldAlert size={16} />
            <span className="text-[10px] font-bold uppercase tracking-wider">Report</span>
          </button>
        </div>
      </div>
    </div>
  );
};
