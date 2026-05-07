/**
 * TipTap HTML → react-pdf renderer (v1.7 — story 1.2.1).
 *
 * @react-pdf/renderer doesn't accept HTML strings directly — it
 * needs `<Text>` / `<View>` components. TipTap's StarterKit (used
 * by 1.8.1's Quote Content Block Manager) produces a small,
 * predictable subset of HTML that we walk with a regex tokenizer
 * and emit native react-pdf primitives.
 *
 * Supported tags (matches what FeatureRichTextEditor's StarterKit
 * + Link extensions emit):
 *   Block: <p>, <h2>, <h3>, <ul>, <ol>, <li>
 *   Inline: <strong>, <em>, <br>, <a>
 *
 * Anything else falls back to plain text. Good enough for v1.7;
 * v1.8.2 (image upload) extends with <img> handling.
 */

import { Image, Text, View, type Style } from '@react-pdf/renderer';
import { Fragment, type ReactNode } from 'react';

interface BlockNode {
    tag: 'p' | 'h2' | 'h3' | 'ul' | 'ol' | 'li';
    inner: string;
    children?: BlockNode[];
}

interface Props {
    html: string | null | undefined;
    style?: Style;
    /** Base text size in pt. Headings scale up; small bodies scale down. */
    fontSize?: number;
    /** Default text colour. */
    color?: string;
}

/* ──────────────────────────────────────────────────────────────────
 * Public component
 * ────────────────────────────────────────────────────────────────── */

export function TipTapHtmlPdf({ html, style, fontSize = 9, color = '#334155' }: Props) {
    if (!html || !html.trim()) return null;
    /**
     * v1.7 (1.8.2) — split on <img> so images render as @react-pdf
     * <Image> while the surrounding HTML still goes through the
     * block parser. Handles the TipTap image extension's output:
     *   <p>Some text…</p>
     *   <img src="https://…" alt="…" />
     *   <p>More text…</p>
     */
    const segments = html.split(/(<img[^>]*\/?>)/i);
    const out: ReactNode[] = [];

    /**
     * v1.7 round-7 — index-based walk (was a .map) so we can
     * "consume" the next text segment when an image is floated
     * left/right. A floated image renders in a flex-row View
     * alongside the immediately-following paragraph(s) — that's how
     * we get Word-style text-wrap on the PDF, since @react-pdf has
     * no native float / text-wrap support.
     */
    for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];

        if (/^<img/i.test(seg)) {
            const imgNode = renderImageSeg(seg, i, fontSize, color);
            if (!imgNode) continue;

            // Float-row branch: image is left/right aligned with width <100%
            if (imgNode.kind === 'float') {
                const nextSeg = segments[i + 1] ?? '';
                const nextBlocks = parseBlocks(nextSeg);
                // Only group when there's actually following text to wrap
                if (nextBlocks.length > 0) {
                    i++; // consume the next segment
                    out.push(
                        <View
                            key={`flow-${i}`}
                            style={{
                                width: '100%',
                                marginVertical: 8,
                                flexDirection: imgNode.align === 'right' ? 'row-reverse' : 'row',
                                gap: 14,
                            }}
                        >
                            <Image
                                src={imgNode.src}
                                style={{ width: imgNode.width, maxHeight: 360, objectFit: 'contain' }}
                            />
                            <View style={{ flex: 1 }}>
                                {nextBlocks.map((b, j) => renderBlock(b, j, fontSize, color))}
                            </View>
                        </View>,
                    );
                    continue;
                }
                // No following text — fall through to block render
            }

            // Block-level image (centered, full-width, or float w/ no follower)
            if (imgNode.kind === 'placeholder') {
                out.push(imgNode.element);
                continue;
            }
            const alignItems =
                imgNode.align === 'left'  ? 'flex-start' :
                imgNode.align === 'right' ? 'flex-end'   :
                                            'center';
            out.push(
                <View key={`img-${i}`} style={{ width: '100%', marginVertical: 8, alignItems }}>
                    <Image
                        src={imgNode.src}
                        style={{ width: imgNode.width, maxWidth: '100%', maxHeight: 360, objectFit: 'contain' }}
                    />
                </View>,
            );
            continue;
        }

        const blocks = parseBlocks(seg);
        if (blocks.length === 0) continue;
        out.push(
            <Fragment key={`seg-${i}`}>
                {blocks.map((b, j) => renderBlock(b, j, fontSize, color))}
            </Fragment>,
        );
    }

    return <View style={style}>{out}</View>;
}

/**
 * v1.7 round-7 — parse one <img> segment into a tagged union the
 * caller branches on. Returns null for missing src.
 *   - 'placeholder' for unsupported formats (SVG / WebP / GIF)
 *   - 'float' for left/right alignment with width < 100%
 *   - 'block' for centered, full-width, or no-alignment images
 */
type ImgSeg =
    | { kind: 'placeholder'; element: ReactNode }
    | { kind: 'float';       src: string; width: string; align: 'left' | 'right' }
    | { kind: 'block';       src: string; width: string; align: 'left' | 'center' | 'right' };

function renderImageSeg(seg: string, i: number, _fontSize: number, _color: string): ImgSeg | null {
    const srcMatch = seg.match(/src=(?:"([^"]+)"|'([^']+)')/i);
    const rawSrc = srcMatch ? (srcMatch[1] ?? srcMatch[2]) : null;
    if (!rawSrc) return null;

    /**
     * v1.7 round-8 — HTML-entity-decode the src URL. TipTap correctly
     * escapes `&` to `&amp;` when serialising the editor to HTML, which
     * is the right thing for HTML rendering (the browser decodes it
     * back). But the PDF parser was extracting the raw attribute value
     * with the literal `&amp;` still in it, then passing that to
     * `@react-pdf <Image>` — which then fetched the URL with
     * `?alt=media&amp;token=…` (a query param literally named
     * "amp;token") instead of `?alt=media&token=…`. Firebase Storage
     * rejected the malformed request, the fetch failed silently, and
     * the image rendered as nothing on the PDF. This was the actual
     * root cause of every "image visible in editor, missing from PDF"
     * report from rounds 5-8.
     */
    const src = rawSrc
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");

    // Unsupported-format placeholder (round-6).
    const lower = src.toLowerCase();
    const isUnsupported =
        /\.svg(\?|$)/.test(lower) ||
        /\.webp(\?|$)/.test(lower) ||
        /\.gif(\?|$)/.test(lower) ||
        lower.startsWith('data:image/svg') ||
        lower.startsWith('data:image/webp') ||
        lower.startsWith('data:image/gif');
    if (isUnsupported) {
        if (typeof console !== 'undefined') {
            console.warn('[tiptap-pdf] Image format not supported by @react-pdf:', src);
        }
        return {
            kind: 'placeholder',
            element: (
                <View
                    key={`img-${i}`}
                    style={{
                        width: '100%',
                        marginVertical: 8,
                        padding: 12,
                        borderWidth: 1,
                        borderColor: '#fde68a',
                        backgroundColor: '#fffbeb',
                        borderRadius: 4,
                    }}
                >
                    <Text style={{ fontSize: 8, fontWeight: 'bold', color: '#92400e', marginBottom: 2 }}>
                        Image cannot render on PDF
                    </Text>
                    <Text style={{ fontSize: 7, color: '#92400e' }}>
                        The customer PDF supports JPG and PNG only. Replace this image with a JPG / PNG to make it appear on the customer&apos;s quote.
                    </Text>
                </View>
            ),
        };
    }

    const widthMatch = seg.match(/data-width=(?:"([^"]+)"|'([^']+)')/i);
    const alignMatch = seg.match(/data-align=(?:"([^"]+)"|'([^']+)')/i);
    const width = (widthMatch ? (widthMatch[1] ?? widthMatch[2]) : '') || '100%';
    const alignRaw = ((alignMatch ? (alignMatch[1] ?? alignMatch[2]) : '') || 'center').toLowerCase();
    const align: 'left' | 'center' | 'right' =
        alignRaw === 'left' ? 'left' : alignRaw === 'right' ? 'right' : 'center';

    if (typeof console !== 'undefined') {
        console.info('[tiptap-pdf] rendering image:', { src, width, align });
    }

    // Float-row mode: left/right alignment with width < 100%
    if ((align === 'left' || align === 'right') && width !== '100%') {
        return { kind: 'float', src, width, align };
    }
    return { kind: 'block', src, width, align };
}

/* ──────────────────────────────────────────────────────────────────
 * Block parser — splits top-level into <p>, <h2>, <h3>, <ul>, <ol>
 * Lists get an inner pass that pulls out <li> children.
 * ────────────────────────────────────────────────────────────────── */

const BLOCK_RE = /<(p|h2|h3|ul|ol)\b[^>]*>([\s\S]*?)<\/\1>/gi;
const LI_RE = /<li\b[^>]*>([\s\S]*?)<\/li>/gi;

function parseBlocks(html: string): BlockNode[] {
    const out: BlockNode[] = [];
    let m: RegExpExecArray | null;
    BLOCK_RE.lastIndex = 0;
    while ((m = BLOCK_RE.exec(html)) !== null) {
        const tag = m[1].toLowerCase() as BlockNode['tag'];
        const inner = m[2];
        if (tag === 'ul' || tag === 'ol') {
            const items: BlockNode[] = [];
            let li: RegExpExecArray | null;
            LI_RE.lastIndex = 0;
            while ((li = LI_RE.exec(inner)) !== null) {
                items.push({ tag: 'li', inner: li[1] });
            }
            out.push({ tag, inner, children: items });
        } else {
            out.push({ tag, inner });
        }
    }
    return out;
}

/* ──────────────────────────────────────────────────────────────────
 * Inline renderer — walks <strong>, <em>, <br>, <a> + raw text.
 * Emits <Text> nodes with style overrides; outer caller wraps in a
 * block-level <Text>.
 * ────────────────────────────────────────────────────────────────── */

interface InlineToken {
    kind: 'text' | 'br';
    text?: string;
    bold?: boolean;
    italic?: boolean;
}

const INLINE_PARSERS: { re: RegExp; transform: (m: RegExpExecArray) => InlineToken[] }[] = [
    {
        re: /<br\s*\/?>/i,
        transform: () => [{ kind: 'br' }],
    },
];

/** Tokenize one block's inner HTML into a flat list of styled spans. */
function tokenizeInline(html: string): InlineToken[] {
    const tokens: InlineToken[] = [];
    let cursor = 0;
    const TAG = /<(\/)?(strong|b|em|i|a|br)(?:\s[^>]*)?\/?>/gi;
    const stack: { bold: boolean; italic: boolean }[] = [{ bold: false, italic: false }];
    let m: RegExpExecArray | null;
    TAG.lastIndex = 0;
    while ((m = TAG.exec(html)) !== null) {
        // Flush plain text up to this tag
        if (m.index > cursor) {
            const text = decodeHtml(html.slice(cursor, m.index));
            if (text) tokens.push({ kind: 'text', text, ...stack[stack.length - 1] });
        }
        const isClose = !!m[1];
        const tagName = m[2].toLowerCase();
        if (tagName === 'br') {
            tokens.push({ kind: 'br' });
        } else if (tagName === 'a') {
            // Links render as plain text in v1.7 (no @react-pdf Link primitive
            // wired here yet — we skip the href, keep the visible text).
            // No state change.
        } else {
            const top = stack[stack.length - 1];
            if (isClose) {
                if (stack.length > 1) stack.pop();
            } else {
                stack.push({
                    bold: top.bold || tagName === 'strong' || tagName === 'b',
                    italic: top.italic || tagName === 'em' || tagName === 'i',
                });
            }
        }
        cursor = m.index + m[0].length;
    }
    if (cursor < html.length) {
        const text = decodeHtml(html.slice(cursor));
        if (text) tokens.push({ kind: 'text', text, ...stack[stack.length - 1] });
    }
    return tokens;
}

function decodeHtml(s: string): string {
    return s
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
}

function renderInline(html: string, baseStyle: Style): ReactNode {
    const tokens = tokenizeInline(html);
    if (tokens.length === 0) return null;
    return tokens.map((t, i) => {
        if (t.kind === 'br') return <Text key={i}>{'\n'}</Text>;
        const style: Style = { ...baseStyle };
        if (t.bold) style.fontWeight = 'bold';
        if (t.italic) style.fontStyle = 'italic';
        return <Text key={i} style={style}>{t.text}</Text>;
    });
}

/* ──────────────────────────────────────────────────────────────────
 * Block renderer — emits the right react-pdf primitive per tag.
 * ────────────────────────────────────────────────────────────────── */

function renderBlock(b: BlockNode, key: number, fontSize: number, color: string): ReactNode {
    switch (b.tag) {
        case 'h2':
            return (
                <Text key={key} style={{ fontSize: fontSize + 3, fontWeight: 'bold', color, marginTop: 6, marginBottom: 4 }}>
                    {renderInline(b.inner, { fontSize: fontSize + 3, fontWeight: 'bold', color })}
                </Text>
            );
        case 'h3':
            return (
                <Text key={key} style={{ fontSize: fontSize + 1, fontWeight: 'bold', color, marginTop: 4, marginBottom: 3 }}>
                    {renderInline(b.inner, { fontSize: fontSize + 1, fontWeight: 'bold', color })}
                </Text>
            );
        case 'p':
            return (
                <Text key={key} style={{ fontSize, color, lineHeight: 1.5, marginBottom: 4 }}>
                    {renderInline(b.inner, { fontSize, color })}
                </Text>
            );
        case 'ul':
        case 'ol':
            return (
                <View key={key} style={{ marginBottom: 4 }}>
                    {(b.children ?? []).map((li, i) => (
                        <View key={i} style={{ flexDirection: 'row', marginBottom: 2 }}>
                            <Text style={{ fontSize, color, width: 12 }}>
                                {b.tag === 'ul' ? '•' : `${i + 1}.`}
                            </Text>
                            <Text style={{ fontSize, color, lineHeight: 1.5, flex: 1 }}>
                                {renderInline(li.inner, { fontSize, color })}
                            </Text>
                        </View>
                    ))}
                </View>
            );
        default:
            return <Fragment key={key} />;
    }
}
