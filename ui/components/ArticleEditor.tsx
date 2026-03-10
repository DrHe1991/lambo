import React from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Underline from '@tiptap/extension-underline';
import Placeholder from '@tiptap/extension-placeholder';
import { Bold, Italic, Underline as UnderlineIcon, Link as LinkIcon, Heading1, Heading2, List, ListOrdered, Quote, Undo, Redo } from 'lucide-react';

interface ArticleEditorProps {
  title: string;
  content: string;
  onTitleChange: (title: string) => void;
  onContentChange: (content: string) => void;
  showPreview?: boolean;
  onTogglePreview?: () => void;
  placeholder?: string;
  accentColor?: string;
}

export const ArticleEditor: React.FC<ArticleEditorProps> = ({
  title,
  content,
  onTitleChange,
  onContentChange,
  placeholder = 'Write your article...',
  accentColor = 'orange',
}) => {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: 'text-orange-400 underline cursor-pointer' },
      }),
      Underline,
      Placeholder.configure({
        placeholder,
        emptyEditorClass: 'is-editor-empty',
      }),
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
  });

  const addLink = () => {
    const url = window.prompt('Enter URL:');
    if (url && editor) {
      editor.chain().focus().setLink({ href: url }).run();
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
          : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'
      } ${disabled ? 'opacity-30 cursor-not-allowed' : ''}`}
    >
      {children}
    </button>
  );

  const isOrange = accentColor === 'orange';
  const borderClass = isOrange ? 'border-orange-500/30 focus-within:border-orange-500/60' : 'border-zinc-700';

  return (
    <div className="flex flex-col gap-3">
      {/* Title input */}
      <input
        type="text"
        value={title}
        onChange={(e) => onTitleChange(e.target.value)}
        placeholder="Article title"
        className={`w-full bg-zinc-900/50 border rounded-xl px-4 py-3 text-lg font-bold outline-none placeholder:text-zinc-600 ${borderClass}`}
        maxLength={200}
      />

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 p-2 bg-zinc-900/50 rounded-xl border border-zinc-800">
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

        <div className="w-px h-5 bg-zinc-700 mx-1" />
        
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

        <div className="w-px h-5 bg-zinc-700 mx-1" />
        
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

        <div className="w-px h-5 bg-zinc-700 mx-1" />
        
        <ToolbarButton
          onClick={addLink}
          isActive={editor?.isActive('link') ?? false}
          title="Add Link"
        >
          <LinkIcon size={16} />
        </ToolbarButton>

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
      <div className={`bg-zinc-900/30 border rounded-xl p-4 ${borderClass}`}>
        <EditorContent 
          editor={editor} 
          className="prose prose-invert prose-sm max-w-none 
            prose-headings:text-white prose-headings:font-bold prose-headings:mt-4 prose-headings:mb-2
            prose-h1:text-2xl prose-h2:text-xl prose-h3:text-lg
            prose-p:text-zinc-300 prose-p:my-2
            prose-strong:text-orange-400 
            prose-em:text-zinc-200
            prose-a:text-orange-400 prose-a:no-underline hover:prose-a:underline
            prose-blockquote:border-l-orange-500 prose-blockquote:bg-zinc-800/50 prose-blockquote:py-1 prose-blockquote:px-4 prose-blockquote:rounded-r-lg prose-blockquote:text-zinc-400 prose-blockquote:not-italic
            prose-ul:text-zinc-300 prose-ol:text-zinc-300
            prose-li:my-0.5
            [&_.is-editor-empty:first-child::before]:text-zinc-600 [&_.is-editor-empty:first-child::before]:content-[attr(data-placeholder)] [&_.is-editor-empty:first-child::before]:float-left [&_.is-editor-empty:first-child::before]:h-0 [&_.is-editor-empty:first-child::before]:pointer-events-none
          "
        />
      </div>

      {/* Character count */}
      <div className="flex items-center justify-between text-xs text-zinc-500">
        <span>{editor?.storage.characterCount?.characters?.() ?? content.length} characters</span>
        {(editor?.storage.characterCount?.characters?.() ?? content.length) < 100 && (
          <span className="text-orange-400">Minimum 100 characters for articles</span>
        )}
      </div>
    </div>
  );
};

export default ArticleEditor;
