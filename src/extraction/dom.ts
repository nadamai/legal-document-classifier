import { NON_RENDERED_SELECTOR } from './selectors';

const ELEMENT_NODE: number = 1;
const TEXT_NODE: number = 3;

export function isElement(node: Node): node is Element {
	return node.nodeType === ELEMENT_NODE;
}

export function isText(node: Node): node is Text {
	return node.nodeType === TEXT_NODE;
}

export function renderedText(element: Element): string {
	return 'innerText' in element && typeof element.innerText === 'string'
		? element.innerText
		: (element.textContent ?? '');
}

export function isRendered(element: Element): boolean {
	return (
		element.ownerDocument.defaultView === null || element.checkVisibility()
	);
}

// textContent minus scripts and styles: unlike innerText, it needs no layout.
export function textLength(element: Element): number {
	let length: number = element.textContent?.length ?? 0;

	for (const hidden of element.querySelectorAll(NON_RENDERED_SELECTOR)) {
		length -= hidden.textContent?.length ?? 0;
	}

	return Math.max(0, length);
}

export function isInside(
	element: Element,
	excluded: ReadonlySet<Element>,
	root: Element
): boolean {
	for (
		let current: Element | null = element;
		current !== null;
		current = current.parentElement
	) {
		if (excluded.has(current)) {
			return true;
		}

		if (current === root) {
			return false;
		}
	}

	return false;
}
