import { isElement, textLength } from './dom';
import {
	CONSENT_NAME,
	CONSENT_TOOL_SELECTOR,
	EXCLUDED_SELECTOR,
	HEADER_FOOTER_SELECTOR,
	ICON_FONT_SELECTOR,
	SECTIONING_SELECTOR
} from './selectors';

// Above this, a fixed or consent-named element is the page's own scrolling
// container, not an overlay.
const MAX_OVERLAY_TEXT_SHARE: number = 0.5;

// Computed styles are the main cost on large pages, so only containers pay it.
const OVERLAY_CONTAINER_TAGS: ReadonlySet<string> = new Set([
	'DIV',
	'SECTION',
	'ASIDE',
	'HEADER',
	'FOOTER',
	'NAV',
	'FORM',
	'DIALOG'
]);

function isFixedOrSticky(element: Element, view: Window | null): boolean {
	if (
		view === null ||
		!(
			OVERLAY_CONTAINER_TAGS.has(element.tagName) ||
			element.tagName.includes('-')
		)
	) {
		return false;
	}

	const { position }: CSSStyleDeclaration = view.getComputedStyle(element);

	return position === 'fixed' || position === 'sticky';
}

function hasConsentName(element: Element): boolean {
	const className: string | null = element.getAttribute('class');

	return (
		(element.id !== '' || className !== null) &&
		CONSENT_NAME.test(`${element.id} ${className ?? ''}`)
	);
}

function skipSubtree(walker: TreeWalker): Node | null {
	for (;;) {
		const sibling: Node | null = walker.nextSibling();

		if (sibling !== null) {
			return sibling;
		}

		if (walker.parentNode() === null) {
			return null;
		}
	}
}

export function findExcludedElements(root: Element): Set<Element> {
	const document: Document = root.ownerDocument;
	const view: Window | null = document.defaultView;
	const maxOverlayLength: number = textLength(root) * MAX_OVERLAY_TEXT_SHARE;

	const excluded: Set<Element> = new Set([
		...root.querySelectorAll(EXCLUDED_SELECTOR),
		...root.querySelectorAll(CONSENT_TOOL_SELECTOR),
		...root.querySelectorAll(ICON_FONT_SELECTOR)
	]);

	for (const element of root.querySelectorAll(HEADER_FOOTER_SELECTOR)) {
		if (!element.parentElement?.closest(SECTIONING_SELECTOR)) {
			excluded.add(element);
		}
	}

	const walker: TreeWalker = document.createTreeWalker(
		root,
		NodeFilter.SHOW_ELEMENT
	);
	let node: Node | null = walker.nextNode();

	while (node !== null) {
		if (
			isElement(node) &&
			(excluded.has(node) ||
				((hasConsentName(node) || isFixedOrSticky(node, view)) &&
					textLength(node) <= maxOverlayLength))
		) {
			excluded.add(node);
			node = skipSubtree(walker);

			continue;
		}

		node = walker.nextNode();
	}

	return excluded;
}
