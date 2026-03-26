import React, { useEffect, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Underline from '@tiptap/extension-underline';
import Placeholder from '@tiptap/extension-placeholder';
import CharacterCount from '@tiptap/extension-character-count';
import TiptapImage from '@tiptap/extension-image';
import { Bold, Italic, Underline as UnderlineIcon, Link as LinkIcon, Heading1, Heading2, List, ListOrdered, Quote, Undo, Redo, X, Image as ImageIcon } from 'lucide-react';

interface ArticleEditorProps {
  title: string;
  content: string;
  onTitleChange: (title: string) => void;
  onContentChange: (content: string) => void;
  placeholder?: string;
  editorKey?: number;
  onRemoveTitle?: () => void;
  onImageUpload?: (file: File) => Promise<string | null>;
}

export const ArticleEditor: React.FC<ArticleEditorProps> = ({
  title,
  content,
  onTitleChange,
  onContentChange,
  placeholder = 'Write your article...',
  editorKey = 0,
  onRemoveTitle,
  onImageUpload,
}) => {
  const imageInputRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        bulletList: { keepMarks: true, keepAttributes: false },
        orderedList: { keepMarks: true, keepAttributes: false },
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: { class: 'text-orange-400 underline cursor-pointer' },
      }),
      Underline,
      TiptapImage.configure({
        HTMLAttributes: { class: 'rounded-xl max-w-full h-auto my-3' },
      }),
      Placeholder.configure({
        placeholder,
        emptyEditorClass: 'is-editor-empty',
      }),
      CharacterCount,
    ],
    content: content || '',
    onUpdate: ({ editor }) => {
      onContentChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: 'outline-none min-h-[250px] px-1',
      },
    },
  }, [editorKey]);

  useEffect(() => {
    if (editor && content === '' && editor.getHTML() !== '<p></p>') {
      editor.commands.clearContent();
    }
  }, [content, editor]);

  const addLink = () => {
    if (!editor) return;

    const previousUrl = editor.getAttributes('link').href;
    const url = window.prompt('Enter URL:', previousUrl || 'https://');

    if (url === null) return;

    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }

    // Validate URL to prevent XSS via javascript: or data: URIs
    let sanitizedUrl: string;
    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) return;
      sanitizedUrl = parsed.href;
    } catch {
      // If not a valid URL, prefix with https://
      sanitizedUrl = `https://${url}`;
    }

    const { from, to } = editor.state.selection;
    if (from === to) {
      // Use TipTap's setLink API instead of raw HTML insertion
      editor.chain().focus()
        .insertContent(sanitizedUrl)
        .setTextSelection({ from, to: from + sanitizedUrl.length })
        .setLink({ href: sanitizedUrl })
        .run();
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({ href: sanitizedUrl }).run();
    }
  };

  const handleImageInsert = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editor || !onImageUpload) return;
    const url = await onImageUpload(file);
    if (url) {
      editor.chain().focus().setImage({ src: url }).run();
    }
    if (imageInputRef.current) {
      imageInputRef.current.value = '';
    }
  };

  const ToolbarButton = ({ 
    onClick, 
    isActive = false, 
    disabled = false,
    children,
    title,
  }: { 
    onClick: () => void; 
    isActive?: boolean; 
    disabled?: boolean;
    children: React.ReactNode;
    title: string;
  }) => (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`p-2 rounded-lg transition-colors ${
        isActive 
          ? 'bg-orange-500/20 text-orange-400' 
          : 'text-stone-400 hover:bg-stone-800 hover:text-white'
      } ${disabled ? 'opacity-30 cursor-not-allowed' : ''}`}
    >
      {children}
    </button>
  );

  const charCount = editor?.storage.characterCount?.characters() ?? 0;

  return (
    <div className="flex flex-col gap-3">
      {/* Title input with remove button */}
      <div className="relative">
        <input
          type="text"
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="Article title"
          className="w-full bg-stone-900/50 border border-orange-500/30 focus-within:border-orange-500/60 rounded-xl px-4 py-3 pr-10 text-lg font-bold outline-none placeholder:text-stone-600"
          maxLength={200}
        />
        {onRemoveTitle && (
          <button
            type="button"
            onClick={onRemoveTitle}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-stone-500 hover:text-orange-400 transition-colors"
            title="Remove title"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 p-2 bg-stone-900/50 rounded-xl border border-stone-800">
        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleBold().run()}
          isActive={editor?.isActive('bold') ?? false}
          title="Bold"
        >
          <Bold size={16} />
        </ToolbarButton>
        
        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleItalic().run()}
          isActive={editor?.isActive('italic') ?? false}
          title="Italic"
        >
          <Italic size={16} />
        </ToolbarButton>
        
        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleUnderline().run()}
          isActive={editor?.isActive('underline') ?? false}
          title="Underline"
        >
          <UnderlineIcon size={16} />
        </ToolbarButton>

        <div className="w-px h-5 bg-stone-700 mx-1" />
        
        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}
          isActive={editor?.isActive('heading', { level: 1 }) ?? false}
          title="Heading 1"
        >
          <Heading1 size={16} />
        </ToolbarButton>
        
        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
          isActive={editor?.isActive('heading', { level: 2 }) ?? false}
          title="Heading 2"
        >
          <Heading2 size={16} />
        </ToolbarButton>

        <div className="w-px h-5 bg-stone-700 mx-1" />
        
        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
          isActive={editor?.isActive('bulletList') ?? false}
          title="Bullet List"
        >
          <List size={16} />
        </ToolbarButton>
        
        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
          isActive={editor?.isActive('orderedList') ?? false}
          title="Numbered List"
        >
          <ListOrdered size={16} />
        </ToolbarButton>
        
        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleBlockquote().run()}
          isActive={editor?.isActive('blockquote') ?? false}
          title="Quote"
        >
          <Quote size={16} />
        </ToolbarButton>

        <div className="w-px h-5 bg-stone-700 mx-1" />
        
        <ToolbarButton
          onClick={addLink}
          isActive={editor?.isActive('link') ?? false}
          title="Add Link"
        >
          <LinkIcon size={16} />
        </ToolbarButton>

        {onImageUpload && (
          <ToolbarButton
            onClick={() => imageInputRef.current?.click()}
            title="Insert Image"
          >
            <ImageIcon size={16} />
          </ToolbarButton>
        )}

        <input
          ref={imageInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          onChange={handleImageInsert}
        />

        <div className="flex-1" />
        
        <ToolbarButton
          onClick={() => editor?.chain().focus().undo().run()}
          disabled={!editor?.can().undo()}
          title="Undo"
        >
          <Undo size={16} />
        </ToolbarButton>
        
        <ToolbarButton
          onClick={() => editor?.chain().focus().redo().run()}
          disabled={!editor?.can().redo()}
          title="Redo"
        >
          <Redo size={16} />
        </ToolbarButton>
      </div>

      {/* WYSIWYG Editor */}
      <div className="bg-stone-900/30 border border-orange-500/30 focus-within:border-orange-500/60 rounded-xl p-4">
        <EditorContent 
          editor={editor} 
          className="prose prose-invert max-w-none 
            [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:text-white [&_h1]:mt-4 [&_h1]:mb-2
            [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-white [&_h2]:mt-3 [&_h2]:mb-2
            [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:text-white [&_h3]:mt-2 [&_h3]:mb-1
            [&_p]:text-stone-300 [&_p]:my-2 [&_p]:text-base
            [&_strong]:text-orange-400 
            [&_em]:text-stone-200
            [&_a]:text-orange-400 [&_a]:underline
            [&_blockquote]:border-l-2 [&_blockquote]:border-orange-500 [&_blockquote]:bg-stone-800/50 [&_blockquote]:py-2 [&_blockquote]:px-4 [&_blockquote]:rounded-r-lg [&_blockquote]:text-stone-400 [&_blockquote]:my-3
            [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:my-2 [&_ul]:text-stone-300
            [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:my-2 [&_ol]:text-stone-300
            [&_li]:my-1 [&_li]:text-stone-300 [&_li_p]:my-0
            [&_img]:rounded-xl [&_img]:max-w-full [&_img]:h-auto [&_img]:my-3
            [&_.is-editor-empty:first-child::before]:text-stone-600 [&_.is-editor-empty:first-child::before]:content-[attr(data-placeholder)] [&_.is-editor-empty:first-child::before]:float-left [&_.is-editor-empty:first-child::before]:h-0 [&_.is-editor-empty:first-child::before]:pointer-events-none
          "
        />
      </div>

      {/* Character count */}
      <div className="flex items-center justify-between text-xs text-stone-500">
        <span>{charCount} characters</span>
      </div>
    </div>
  );
};

export default ArticleEditor;
