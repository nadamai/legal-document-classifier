const VIEWPORT_WIDTH: number = 1280;
const VIEWPORT_HEIGHT: number = 800;

// Each page gets its own iframe, so styles and layout never leak between tests.
export async function renderPage<T>(
	html: string,
	use: (document: Document) => T | Promise<T>
): Promise<T> {
	const frame: HTMLIFrameElement = document.createElement('iframe');

	frame.style.width = `${VIEWPORT_WIDTH}px`;
	frame.style.height = `${VIEWPORT_HEIGHT}px`;
	frame.srcdoc = html;

	const loaded: Promise<void> = new Promise((resolve: () => void): void => {
		frame.addEventListener('load', (): void => resolve(), { once: true });
	});

	document.body.append(frame);
	await loaded;

	try {
		const page: Document | null = frame.contentDocument;

		if (page === null) {
			throw new Error('The test page has no document');
		}

		return await use(page);
	} finally {
		frame.remove();
	}
}
