'use client';

/**
 * TipTap-based rich-text editor for v1.5 Feature Tracking +
 * v1.7 Quote Content Block Manager.
 *
 * Supports: headings (H2 / H3), bold, italic, bullet list, numbered
 * list, links. v1.7 adds an optional inline-image insert button —
 * pass `imageStoragePathPrefix` to enable; without it the button is
 * hidden (feature-tracking still uploads images via the separate
 * <FeatureImageUploader>).
 *
 * Image upload flow when enabled:
 *   - Click image button → file picker
 *   - On file pick → upload to firebase storage at
 *     {imageStoragePathPrefix}/{timestamp}-{rand}-{name}
 *   - Insert <img src={downloadUrl}> at cursor
 *   - tiptap-pdf.tsx renders <img> as @react-pdf <Image> at PDF render
 */

import { useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import { mergeAttributes } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Link from '@tiptap/extension-link';
import ImageExt from '@tiptap/extension-image';
import { useStorage } from '@/firebase/provider';
import { uploadFileToStorage } from '@/firebase/storage';
import { useToast } from '@/hooks/use-toast';
import {
    Bold,
    Italic,
    List,
    ListOrdered,
    Heading2,
    Heading3,
    ImagePlus,
    Link as LinkIcon,
    Loader2,
    Undo,
    Redo,
    AlignLeft,
    AlignCenter,
    AlignRight,
    Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * v1.7 round-5 — extends the default TipTap Image extension with
 * `width` (CSS string like "50%" or "240px") and `align`
 * (`left` | `center` | `right`) attributes. Both serialise to the
 * <img> tag as `data-width` + `data-align` (consumed by tiptap-pdf.tsx
 * for PDF rendering) AND inline `style` (so the editor itself shows
 * the correct visual size + alignment, no CSS dependency). Default
 * is full-width, centered.
 */
const ResizableImage = ImageExt.extend({
    addAttributes() {
        return {
            ...this.parent?.(),
            width: {
                default: '100%',
                parseHTML: el => {
                    const dataW = el.getAttribute('data-width');
                    if (dataW) return dataW;
                    const styleM = (el.getAttribute('style') || '').match(/width:\s*([^;]+)/i);
                    return styleM ? styleM[1].trim() : '100%';
                },
                renderHTML: attrs => attrs.width ? { 'data-width': attrs.width } : {},
            },
            align: {
                default: 'center',
                parseHTML: el => {
                    const dataA = el.getAttribute('data-align');
                    if (dataA) return dataA;
                    return 'center';
                },
                renderHTML: attrs => attrs.align ? { 'data-align': attrs.align } : {},
            },
        };
    },
    renderHTML({ HTMLAttributes, node }) {
        const w = node.attrs.width || '100%';
        const align = node.attrs.align || 'center';
        const styleParts = [`width: ${w}`, 'max-width: 100%'];

        /**
         * v1.7 round-7 — left/right alignment now uses CSS `float` so
         * paragraphs that follow the image visually wrap around it
         * (Word-style). Center alignment keeps the block-level
         * treatment. Width 100% always falls back to block-level (a
         * full-width image can't have text wrap around it).
         */
        if ((align === 'left' || align === 'right') && w !== '100%') {
            styleParts.push(`float: ${align}`);
            styleParts.push(align === 'left' ? 'margin: 4px 14px 8px 0' : 'margin: 4px 0 8px 14px');
        } else {
            styleParts.push('display: block');
            if (align === 'center') styleParts.push('margin-left: auto', 'margin-right: auto');
            else styleParts.push('margin: 8px 0');
        }
        return [
            'img',
            mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
                style: styleParts.join('; '),
            }),
        ];
    },
});

interface FeatureRichTextEditorProps {
    value: string;
    onChange: (html: string) => void;
    placeholder?: string;
    minHeight?: string;
    /** v1.7 (1.8.2) — when set, the toolbar shows an Insert Image
     *  button. Uploaded files land under
     *  {imageStoragePathPrefix}/{timestamped-filename}. Omit to keep
     *  the editor text-only (feature tracking uses this). */
    imageStoragePathPrefix?: string;
}

export function FeatureRichTextEditor({
    value,
    onChange,
    placeholder = 'Describe the feature. What is it? Why does it matter? Who benefits?',
    minHeight = '200px',
    imageStoragePathPrefix,
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
            ResizableImage.configure({
                inline: false,
                HTMLAttributes: { class: 'rounded-md my-2' },
            }),
        ],
        content: value,
        onUpdate: ({ editor }) => onChange(editor.getHTML()),
        immediatelyRender: false,
        editorProps: {
            attributes: {
                class: cn(
                    'prose prose-sm max-w-none p-3 focus:outline-none',
                    // v1.7 round-7 — flow-root contains floated images
                    // so they don't bleed out of the editor box.
                    '[display:flow-root]',
                    '[&_h2]:text-base [&_h2]:font-bold [&_h2]:mt-2 [&_h2]:mb-1',
                    '[&_h3]:text-sm [&_h3]:font-bold [&_h3]:mt-1.5 [&_h3]:mb-1',
                    '[&_p]:text-sm [&_p]:my-1',
                    '[&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-1 [&_ul_li]:text-sm',
                    '[&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-1 [&_ol_li]:text-sm',
                    '[&_a]:text-blue-600 [&_a]:underline',
                    '[&_img]:rounded-md',
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
            <EditorToolbar editor={editor} imageStoragePathPrefix={imageStoragePathPrefix} />
            <div style={{ minHeight }} className="overflow-auto">
                <EditorContent editor={editor} />
            </div>
        </div>
    );
}

function EditorToolbar({ editor, imageStoragePathPrefix }: { editor: Editor; imageStoragePathPrefix?: string }) {
    const storage = useStorage();
    const { toast } = useToast();
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    /** v1.7 round-7 — separate ref for the contextual "replace image"
     *  picker so it doesn't collide with the standard "insert image"
     *  picker (both are mounted simultaneously now). */
    const imageReplaceInputRef = useRef<HTMLInputElement | null>(null);
    const [uploading, setUploading] = useState<boolean>(false);

    /** v1.7 round-5 — re-render the toolbar whenever the selection /
     *  active node changes, so the contextual image controls (size +
     *  align + remove) appear/disappear correctly. */
    const [, forceTick] = useState(0);
    useEffect(() => {
        const onUpdate = () => forceTick(t => t + 1);
        editor.on('selectionUpdate', onUpdate);
        editor.on('transaction', onUpdate);
        return () => {
            editor.off('selectionUpdate', onUpdate);
            editor.off('transaction', onUpdate);
        };
    }, [editor]);

    const btn = (
        active: boolean,
        onClick: () => void,
        title: string,
        icon: React.ReactNode,
        disabled?: boolean,
    ) => (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            title={title}
            className={cn(
                'h-7 w-7 rounded-md flex items-center justify-center transition-colors',
                active
                    ? 'bg-blue-100 text-blue-700'
                    : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800',
                disabled && 'opacity-50 cursor-not-allowed',
            )}
        >
            {icon}
        </button>
    );

    /** v1.7 round-5 — small text-pill button for the image size picker
     *  (25% / 50% / 75% / 100%). Active when the current image's
     *  width attr matches. */
    const sizePill = (label: string, value: string, currentWidth: string) => (
        <button
            type="button"
            onClick={() => editor.chain().focus().updateAttributes('image', { width: value }).run()}
            title={`Resize to ${label}`}
            className={cn(
                'h-7 px-2 rounded-md text-[10px] font-bold uppercase tracking-wider transition-colors',
                currentWidth === value
                    ? 'bg-blue-100 text-blue-700'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-800',
            )}
        >
            {label}
        </button>
    );

    const imageActive = editor.isActive('image');
    const imageAttrs = imageActive ? editor.getAttributes('image') : null;
    const currentWidth = (imageAttrs?.width as string | undefined) ?? '100%';
    const currentAlign = (imageAttrs?.align as string | undefined) ?? 'center';

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

    async function handleImagePick(e: React.ChangeEvent<HTMLInputElement>, replace = false) {
        const file = e.target.files?.[0];
        e.target.value = ''; // allow re-pick
        if (!file || !imageStoragePathPrefix) return;
        /**
         * v1.7 round-6 — restrict uploads to JPG/PNG only. @react-pdf's
         * <Image> component supports JPEG and PNG (with alpha) but does
         * NOT support SVG, WebP, or GIF. If a user uploads an SVG it
         * shows fine in the editor but renders as nothing on the PDF
         * (which was the round-5 bug — image showed in editor, missing
         * from PDF). Blocking unsupported formats at upload time is
         * cleaner than rendering an empty image silently downstream.
         */
        const SUPPORTED = ['image/jpeg', 'image/jpg', 'image/png'];
        if (!SUPPORTED.includes(file.type)) {
            toast({
                variant: 'destructive',
                title: 'Unsupported image format',
                description: `Use JPG or PNG (got ${file.type || 'unknown'}). SVG / WebP / GIF do not render in the customer PDF.`,
            });
            return;
        }
        setUploading(true);
        try {
            const path = `${imageStoragePathPrefix}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${file.name}`;
            const url = await uploadFileToStorage(storage, file, path);
            // v1.7 round-5: preserve current width + align if replacing.
            const prior = replace ? editor.getAttributes('image') : {};
            if (replace) editor.chain().focus().deleteSelection().run();
            editor.chain().focus().setImage({
                src: url,
                alt: file.name,
                ...(prior?.width ? { width: prior.width } : {}),
                ...(prior?.align ? { align: prior.align } : {}),
            } as any).run();
            toast({ title: replace ? 'Image replaced' : 'Image inserted' });
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Upload failed', description: e?.message ?? 'See console.' });
            console.error('[tiptap-image]', e);
        } finally {
            setUploading(false);
        }
    }

    /**
     * v1.7 round-7 — toolbar always shows the standard text controls
     * (H2/H3/Bold/Italic/lists/link/insert-image/undo/redo). When an
     * image is selected, a SECOND row appears below it with the
     * image-specific controls (size / align / replace / remove).
     * Earlier round-5 swapped the toolbar entirely on image-selected,
     * which hid the text formatting controls — that was wrong. */
    return (
        <>
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
            {imageStoragePathPrefix ? (
                <>
                    {btn(
                        false,
                        () => fileInputRef.current?.click(),
                        'Insert image',
                        uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />,
                        uploading,
                    )}
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/jpeg,image/jpg,image/png"
                        onChange={handleImagePick}
                        className="hidden"
                    />
                </>
            ) : null}
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

        {/* v1.7 round-7 — second toolbar row, only when an image is
            selected. Image controls (size / align / replace / remove)
            without hiding the standard text controls above. */}
        {imageActive && (
            <div className="flex items-center gap-1 border-b bg-blue-50/40 px-2 py-1">
                <span className="text-[10px] font-black uppercase tracking-widest text-blue-700 mr-2">
                    Image
                </span>
                <span className="text-[10px] uppercase tracking-wider text-slate-500 mr-1">Size</span>
                {sizePill('25%', '25%', currentWidth)}
                {sizePill('50%', '50%', currentWidth)}
                {sizePill('75%', '75%', currentWidth)}
                {sizePill('100%', '100%', currentWidth)}
                <div className="w-px h-4 bg-slate-200 mx-1" />
                <span className="text-[10px] uppercase tracking-wider text-slate-500 mr-1">Align</span>
                {btn(
                    currentAlign === 'left',
                    () => editor.chain().focus().updateAttributes('image', { align: 'left' }).run(),
                    'Align left — text wraps to the right',
                    <AlignLeft className="h-3.5 w-3.5" />,
                )}
                {btn(
                    currentAlign === 'center',
                    () => editor.chain().focus().updateAttributes('image', { align: 'center' }).run(),
                    'Center (no wrap)',
                    <AlignCenter className="h-3.5 w-3.5" />,
                )}
                {btn(
                    currentAlign === 'right',
                    () => editor.chain().focus().updateAttributes('image', { align: 'right' }).run(),
                    'Align right — text wraps to the left',
                    <AlignRight className="h-3.5 w-3.5" />,
                )}
                <div className="w-px h-4 bg-slate-200 mx-1" />
                {imageStoragePathPrefix ? (
                    <>
                        {btn(
                            false,
                            () => imageReplaceInputRef.current?.click(),
                            'Replace image',
                            uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />,
                            uploading,
                        )}
                        <input
                            ref={imageReplaceInputRef}
                            type="file"
                            accept="image/jpeg,image/jpg,image/png"
                            onChange={(e) => handleImagePick(e, true)}
                            className="hidden"
                        />
                    </>
                ) : null}
                <div className="flex-1" />
                <button
                    type="button"
                    onClick={() => editor.chain().focus().deleteSelection().run()}
                    title="Remove image"
                    className="h-7 px-2 rounded-md flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-red-600 hover:bg-red-50 transition-colors"
                >
                    <Trash2 className="h-3.5 w-3.5" />
                    Remove
                </button>
            </div>
        )}
        </>
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
                '[&_img]:rounded-md [&_img]:max-w-full [&_img]:my-2',
            )}
            dangerouslySetInnerHTML={{ __html: html }}
        />
    );
}
