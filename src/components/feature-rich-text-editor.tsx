'use client';

/**
 * TipTap-based rich-text editor for v1.5 Feature Tracking.
 *
 * Supports: headings (H2 / H3), bold, italic, bullet list, numbered list,
 * links. Stored as HTML string on the feature doc's `description` field.
 * Read-only rendering is handled by <FeatureDescriptionView>.
 */

import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Link from '@tiptap/extension-link';
import {
    Bold,
    Italic,
    List,
    ListOrdered,
    Heading2,
    Heading3,
    Link as LinkIcon,
    Undo,
    Redo,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface FeatureRichTextEditorProps {
    value: string;
    onChange: (html: string) => void;
    placeholder?: string;
    minHeight?: string;
}

export function FeatureRichTextEditor({
    value,
    onChange,
    placeholder = 'Describe the feature. What is it? Why does it matter? Who benefits?',
    minHeight = '200px',
}: FeatureRichTextEditorProps) {
    const editor = useEditor({
        extensions: [
            StarterKit.configure({
                heading: { levels: [2, 3] },
            }),
            Placeholder.configure({ placeholder }),
            Link.configure({
                openOnClick: false,
                HTMLAttributes: { class: 'text-blue-600 underline' },
            }),
        ],
        content: value,
        onUpdate: ({ editor }) => onChange(editor.getHTML()),
        immediatelyRender: false,
        editorProps: {
            attributes: {
                class: cn(
                    'prose prose-sm max-w-none p-3 focus:outline-none',
                    '[&_h2]:text-base [&_h2]:font-bold [&_h2]:mt-2 [&_h2]:mb-1',
                    '[&_h3]:text-sm [&_h3]:font-bold [&_h3]:mt-1.5 [&_h3]:mb-1',
                    '[&_p]:text-sm [&_p]:my-1',
                    '[&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-1 [&_ul_li]:text-sm',
                    '[&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-1 [&_ol_li]:text-sm',
                    '[&_a]:text-blue-600 [&_a]:underline',
                ),
            },
        },
    });

    if (!editor) {
        return (
            <div
                className="rounded-md border bg-slate-50 animate-pulse"
                style={{ minHeight }}
            />
        );
    }

    return (
        <div className="rounded-md border bg-white overflow-hidden">
            <EditorToolbar editor={editor} />
            <div style={{ minHeight }} className="overflow-auto">
                <EditorContent editor={editor} />
            </div>
        </div>
    );
}

function EditorToolbar({ editor }: { editor: Editor }) {
    const btn = (
        active: boolean,
        onClick: () => void,
        title: string,
        icon: React.ReactNode,
    ) => (
        <button
            type="button"
            onClick={onClick}
            title={title}
            className={cn(
                'h-7 w-7 rounded-md flex items-center justify-center transition-colors',
                active
                    ? 'bg-blue-100 text-blue-700'
                    : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800',
            )}
        >
            {icon}
        </button>
    );

    function insertLink() {
        const previous = editor.getAttributes('link').href;
        const url = window.prompt('URL', previous || 'https://');
        if (url == null) return;
        if (url === '') {
            editor.chain().focus().extendMarkRange('link').unsetLink().run();
            return;
        }
        editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    }

    return (
        <div className="flex items-center gap-0.5 border-b bg-slate-50/60 px-2 py-1">
            {btn(
                editor.isActive('heading', { level: 2 }),
                () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
                'Heading 2',
                <Heading2 className="h-3.5 w-3.5" />,
            )}
            {btn(
                editor.isActive('heading', { level: 3 }),
                () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
                'Heading 3',
                <Heading3 className="h-3.5 w-3.5" />,
            )}
            <div className="w-px h-4 bg-slate-200 mx-1" />
            {btn(
                editor.isActive('bold'),
                () => editor.chain().focus().toggleBold().run(),
                'Bold',
                <Bold className="h-3.5 w-3.5" />,
            )}
            {btn(
                editor.isActive('italic'),
                () => editor.chain().focus().toggleItalic().run(),
                'Italic',
                <Italic className="h-3.5 w-3.5" />,
            )}
            <div className="w-px h-4 bg-slate-200 mx-1" />
            {btn(
                editor.isActive('bulletList'),
                () => editor.chain().focus().toggleBulletList().run(),
                'Bullet list',
                <List className="h-3.5 w-3.5" />,
            )}
            {btn(
                editor.isActive('orderedList'),
                () => editor.chain().focus().toggleOrderedList().run(),
                'Numbered list',
                <ListOrdered className="h-3.5 w-3.5" />,
            )}
            {btn(
                editor.isActive('link'),
                insertLink,
                'Add / edit link',
                <LinkIcon className="h-3.5 w-3.5" />,
            )}
            <div className="flex-1" />
            {btn(
                false,
                () => editor.chain().focus().undo().run(),
                'Undo',
                <Undo className="h-3.5 w-3.5" />,
            )}
            {btn(
                false,
                () => editor.chain().focus().redo().run(),
                'Redo',
                <Redo className="h-3.5 w-3.5" />,
            )}
        </div>
    );
}

/**
 * Read-only rendering of a feature's description. Used by the detail
 * sheet in stage 5. Reuses TipTap's prose styling so the output matches
 * the editor view byte-for-byte.
 */
export function FeatureDescriptionView({ html }: { html: string }) {
    if (!html || html.trim() === '' || html === '<p></p>') {
        return <p className="text-xs text-slate-400 italic">No description.</p>;
    }
    return (
        <div
            className={cn(
                'prose prose-sm max-w-none',
                '[&_h2]:text-base [&_h2]:font-bold [&_h2]:mt-3 [&_h2]:mb-1.5',
                '[&_h3]:text-sm [&_h3]:font-bold [&_h3]:mt-2 [&_h3]:mb-1',
                '[&_p]:text-sm [&_p]:my-1.5',
                '[&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-1.5 [&_ul_li]:text-sm',
                '[&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-1.5 [&_ol_li]:text-sm',
                '[&_a]:text-blue-600 [&_a]:underline',
            )}
            dangerouslySetInnerHTML={{ __html: html }}
        />
    );
}
