import type { Page } from '../types/Page';
import {
	isElement,
	isInside,
	isRendered,
	isText,
	renderedText,
	textLength
} from './dom';
import { findExcludedElements } from './findExcludedElements';
import {
	MAIN_SELECTOR,
	NON_RENDERED_SELECTOR,
	SIDEBAR_SELECTOR
} from './selectors';

const MIN_MAIN_TEXT_SHARE: number = 0.25;

const MIN_CONTENT_LENGTH: number = 200;

// Icon fonts draw their icons from Unicode's private-use areas.
const PRIVATE_USE: RegExp =
	/[\u{E000}-\u{F8FF}\u{F0000}-\u{FFFFD}\u{100000}-\u{10FFFD}]/gu;

function normalizeLine(text: string): string {
	return text.replace(PRIVATE_USE, '').replace(/\s+/g, ' ').trim();
}

function normalizeText(text: string): string {
	return text
		.split(/\r?\n/)
		.map(normalizeLine)
		.filter((line: string): boolean => line !== '')
		.join('\n');
}

function findRoot(body: HTMLElement): Element {
	const mains: NodeListOf<Element> = body.querySelectorAll(MAIN_SELECTOR);
	const [main] = mains;

	return mains.length === 1 &&
		main !== undefined &&
		textLength(main) >= textLength(body) * MIN_MAIN_TEXT_SHARE
		? main
		: body;
}

function ancestorsOf(
	excluded: ReadonlySet<Element>,
	root: Element
): Set<Element> {
	const ancestors: Set<Element> = new Set();

	for (const element of excluded) {
		for (
			let parent: Element | null = element.parentElement;
			parent !== null && !ancestors.has(parent);
			parent = parent.parentElement
		) {
			ancestors.add(parent);

			if (parent === root) {
				break;
			}
		}
	}

	return ancestors;
}

function collectText(root: Element, excluded: ReadonlySet<Element>): string {
	const ancestors: Set<Element> = ancestorsOf(excluded, root);
	const parts: string[] = [];

	const collect = (element: Element): void => {
		if (
			excluded.has(element) ||
			element.matches(NON_RENDERED_SELECTOR) ||
			!isRendered(element)
		) {
			return;
		}

		if (!ancestors.has(element)) {
			parts.push(renderedText(element));

			return;
		}

		for (const child of element.childNodes) {
			if (isElement(child)) {
				collect(child);
			} else if (isText(child)) {
				parts.push(child.data);
			}
		}
	};

	collect(root);

	return normalizeText(parts.join('\n'));
}

function collectHeadings(
	root: Element,
	tag: string,
	excluded: ReadonlySet<Element>
): string[] {
	const headings: string[] = [];

	for (const heading of root.querySelectorAll(tag)) {
		if (isInside(heading, excluded, root) || !isRendered(heading)) {
			continue;
		}

		const text: string = normalizeLine(renderedText(heading));

		if (text !== '') {
			headings.push(text);
		}
	}

	return headings;
}

// Measured by visible text, because hidden menus inflate textContent.
function largestSidebar(
	root: Element,
	excluded: ReadonlySet<Element>
): Element | null {
	let largest: Element | null = null;
	let largestLength: number = MIN_CONTENT_LENGTH - 1;

	for (const sidebar of root.querySelectorAll(SIDEBAR_SELECTOR)) {
		if (!excluded.has(sidebar) || !isRendered(sidebar)) {
			continue;
		}

		const length: number = normalizeText(renderedText(sidebar)).length;

		if (length > largestLength) {
			largest = sidebar;
			largestLength = length;
		}
	}

	return largest;
}

function readPage(
	root: Element,
	excluded: ReadonlySet<Element>,
	title: string
): Page {
	return {
		content: collectText(root, excluded),
		title,
		h1: collectHeadings(root, 'h1', excluded),
		h2: collectHeadings(root, 'h2', excluded)
	};
}

/** Needs a rendered page in a browser. Never modifies it. */
export function extractPage(document: Document): Page {
	const title: string = normalizeLine(document.title);
	const body: HTMLElement | null = document.body;

	if (body === null) {
		return { content: '', title, h1: [], h2: [] };
	}

	const root: Element = findRoot(body);
	const excluded: Set<Element> = findExcludedElements(root);
	const page: Page = readPage(root, excluded, title);

	if (page.content.length >= MIN_CONTENT_LENGTH) {
		return page;
	}

	// Headers, footers and navs never qualify: on near-empty pages they hold a
	// newsletter's consent text, which reads like a privacy policy.
	const sidebar: Element | null = largestSidebar(root, excluded);

	if (sidebar === null) {
		return page;
	}

	// The first pass skipped the sidebar's subtree, so only that needs checking.
	const withSidebar: Set<Element> = new Set([
		...[...excluded].filter(
			(element: Element): boolean => !sidebar.contains(element)
		),
		...findExcludedElements(root, sidebar)
	]);

	return readPage(root, withSidebar, title);
}
