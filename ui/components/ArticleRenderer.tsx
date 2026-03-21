import React from 'react';
import DOMPurify from 'dompurify';

interface ArticleRendererProps {
  content: string;
  className?: string;
}

export const ArticleRenderer: React.FC<ArticleRendererProps> = ({
  content,
  className = '',
}) => {
  const sanitizedContent = DOMPurify.sanitize(content, {
    ALLOWED_TAGS: [
      'h1', 'h2', 'h3', 'p', 'br', 'strong', 'em', 'u', 'a',
      'ul', 'ol', 'li', 'blockquote', 'code', 'pre', 'hr',
    ],
    ALLOWED_ATTR: ['href', 'target', 'rel', 'class'],
  });

  return (
    <div
      className={`article-content prose prose-invert prose-sm max-w-none
        prose-headings:text-white prose-headings:font-bold
        prose-h1:text-2xl prose-h1:mt-6 prose-h1:mb-3
        prose-h2:text-xl prose-h2:mt-5 prose-h2:mb-2
        prose-h3:text-lg prose-h3:mt-4 prose-h3:mb-2
        prose-p:text-stone-300 prose-p:leading-relaxed prose-p:mb-4
        prose-a:text-orange-400 prose-a:no-underline hover:prose-a:underline
        prose-strong:text-white prose-strong:font-bold
        prose-em:text-stone-200 prose-em:italic
        prose-ul:text-stone-300 prose-ul:mb-4 prose-ul:space-y-1
        prose-ol:text-stone-300 prose-ol:mb-4 prose-ol:space-y-1
        prose-li:text-stone-300
        prose-blockquote:border-l-4 prose-blockquote:border-orange-500/50 prose-blockquote:pl-4 prose-blockquote:py-1 prose-blockquote:text-stone-400 prose-blockquote:italic prose-blockquote:bg-stone-900/30 prose-blockquote:rounded-r-lg prose-blockquote:not-italic
        prose-code:bg-stone-800 prose-code:text-orange-300 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm
        prose-pre:bg-stone-900 prose-pre:rounded-xl prose-pre:overflow-x-auto
        prose-hr:border-stone-800
        ${className}`}
      dangerouslySetInnerHTML={{ __html: sanitizedContent }}
    />
  );
};

export default ArticleRenderer;
