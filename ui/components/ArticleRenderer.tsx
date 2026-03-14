import React from 'react';

interface ArticleRendererProps {
  content: string;
  className?: string;
}

export const ArticleRenderer: React.FC<ArticleRendererProps> = ({
  content,
  className = '',
}) => {
  return (
    <div 
      className={`article-content prose prose-invert prose-sm max-w-none
        prose-headings:text-white prose-headings:font-bold
        prose-h1:text-2xl prose-h1:mt-6 prose-h1:mb-3
        prose-h2:text-xl prose-h2:mt-5 prose-h2:mb-2
        prose-h3:text-lg prose-h3:mt-4 prose-h3:mb-2
        prose-p:text-zinc-300 prose-p:leading-relaxed prose-p:mb-4
        prose-a:text-orange-400 prose-a:no-underline hover:prose-a:underline
        prose-strong:text-white prose-strong:font-bold
        prose-em:text-zinc-200 prose-em:italic
        prose-ul:text-zinc-300 prose-ul:mb-4 prose-ul:space-y-1
        prose-ol:text-zinc-300 prose-ol:mb-4 prose-ol:space-y-1
        prose-li:text-zinc-300
        prose-blockquote:border-l-4 prose-blockquote:border-orange-500/50 prose-blockquote:pl-4 prose-blockquote:py-1 prose-blockquote:text-zinc-400 prose-blockquote:italic prose-blockquote:bg-zinc-900/30 prose-blockquote:rounded-r-lg prose-blockquote:not-italic
        prose-code:bg-zinc-800 prose-code:text-orange-300 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm
        prose-pre:bg-zinc-900 prose-pre:rounded-xl prose-pre:overflow-x-auto
        prose-hr:border-zinc-800
        ${className}`}
      dangerouslySetInnerHTML={{ __html: content }}
    />
  );
};

export default ArticleRenderer;
