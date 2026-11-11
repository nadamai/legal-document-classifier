import { isElement, isInside, isRendered, isText } from './dom';
import {
	COLLAPSED_SELECTOR,
	COLLAPSED_TRIGGER_SELECTOR,
	NON_RENDERED_SELECTOR,
	POPUP_SELECTOR
} from './selectors';

// Hidden text has no layout, so line breaks come from the tag names.
const BLOCK_TAGS: ReadonlySet<string> = new Set([
	'ADDRESS',
	'ARTICLE',
	'ASIDE',
	'BLOCKQUOTE',
	'BR',
	'DD',
	'DETAILS',
	'DIV',
	'DL',
	'DT',
	'FIGCAPTION',
	'FIGURE',
	'FOOTER',
	'FORM',
	'H1',
	'H2',
	'H3',
	'H4',
	'H5',
	'H6',
	'HEADER',
	'HR',
	'LI',
	'MAIN',
	'NAV',
	'OL',
	'P',
	'PRE',
	'SECTION',
	'SUMMARY',
	'TABLE',
	'TR',
	'UL'
]);

const CELL_TAGS: ReadonlySet<string> = new Set(['TD', 'TH']);

function isPopupTrigger(trigger: Element): boolean {
	const popup: string | null = trigger.getAttribute('aria-haspopup');

	return popup !== null && popup !== 'false';
}

function controlledPanels(
	root: Element,
	excluded: ReadonlySet<Element>
): Element[] {
	const document: Document = root.ownerDocument;
	const panels: Element[] = [];

	for (const trigger of root.querySelectorAll(COLLAPSED_TRIGGER_SELECTOR)) {
		if (isPopupTrigger(trigger) || isInside(trigger, excluded, root)) {
			continue;
		}

		for (const id of trigger.getAttribute('aria-controls')?.split(/\s+/) ??
			[]) {
			const panel: Element | null =
				id === '' ? null : document.getElementById(id);

			if (
				panel !== null &&
				root.contains(panel) &&
				!isRendered(panel) &&
				!panel.matches(POPUP_SELECTOR)
			) {
				panels.push(panel);
			}
		}
	}

	return panels;
}

/**
 * Content the markup marks as collapsed: closed `<details>`,
 * `hidden="until-found"` and accordion panels named by a collapsed button's
 * `aria-controls`. Only the outermost of nested ones, none that are excluded.
 */
export function findCollapsedElements(
	root: Element,
	excluded: ReadonlySet<Element>
): Set<Element> {
	const candidates: Set<Element> = new Set([
		...root.querySelectorAll(COLLAPSED_SELECTOR),
		...controlledPanels(root, excluded)
	]);
	const collapsed: Set<Element> = new Set();

	for (const element of candidates) {
		if (
			!isInside(element, excluded, root) &&
			(element.parentElement === null ||
				!isInside(element.parentElement, candidates, root))
		) {
			collapsed.add(element);
		}
	}

	return collapsed;
}

/** The text of a collapsed element, one line per block, as innerText would. */
export function collapsedText(
	element: Element,
	excluded: ReadonlySet<Element>
): string {
	const parts: string[] = [];

	const read = (node: Node): void => {
		if (isText(node)) {
			parts.push(node.data.replace(/\s+/g, ' '));

			return;
		}

		if (
			!isElement(node) ||
			excluded.has(node) ||
			node.matches(NON_RENDERED_SELECTOR)
		) {
			return;
		}

		const separator: string = BLOCK_TAGS.has(node.tagName)
			? '\n'
			: CELL_TAGS.has(node.tagName)
				? ' '
				: '';

		parts.push(separator);

		for (const child of node.childNodes) {
			read(child);
		}

		parts.push(separator);
	};

	read(element);

	return parts.join('');
}
