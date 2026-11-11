import type { Page } from '../../../src/types/Page';

// Hand-written for these tests. Never paste text from real sites here.
export const ENGLISH_PRIVACY_POLICY: Page = {
	title: 'Privacy Policy | Example Store',
	h1: ['Privacy Policy'],
	h2: [
		'Who we are',
		'What personal data we collect',
		'How we use your data',
		'Your rights',
		'Contact'
	],
	content: [
		'Privacy Policy',
		'Last updated: 1 March 2026.',
		'Who we are',
		'Example Store Ltd is the controller of your personal data. This policy explains how we collect, use and protect the information you give us when you use our website and services.',
		'What personal data we collect',
		'We collect your name, email address, delivery address and payment details when you place an order. We may also collect information about your device and how you use the website, such as your IP address and the pages you visit.',
		'How we use your data',
		'We use your personal data to process orders, to provide customer support and, with your consent, to send you marketing messages. We will not sell your personal data to any third party. We may share it with service providers who process it on our behalf, and only as described in this policy.',
		'Your rights',
		'You have the right to access, correct or delete your personal data, to restrict or object to its processing, and to data portability. You may withdraw your consent at any time. You also have the right to lodge a complaint with a supervisory authority.',
		'Contact',
		'If you have any questions about this privacy policy, please contact us at the address below.'
	].join('\n')
};

export const ENGLISH_PRODUCT_PAGE: Page = {
	title: 'Trail Running Shoes – Example Store',
	h1: ['Trail Running Shoes'],
	h2: ['Description', 'Reviews', 'You may also like'],
	content: [
		'Trail Running Shoes',
		'Lightweight shoes with a grippy sole for muddy paths and rocky climbs.',
		'Add to cart',
		'Description',
		'A breathable mesh upper keeps your feet cool, and the cushioned midsole softens every landing. Available in blue, black and orange.',
		'Reviews',
		'Great shoes, comfortable from the first run.',
		'Fit is a little narrow, so order half a size up.',
		'You may also like',
		'Running socks, three pack',
		'Hydration vest'
	].join('\n')
};

export const POLISH_TERMS: Page = {
	title: 'Regulamin sklepu internetowego',
	h1: ['Regulamin sklepu internetowego'],
	h2: [
		'Postanowienia ogólne',
		'Zawarcie umowy',
		'Prawo odstąpienia od umowy',
		'Reklamacje'
	],
	content: [
		'Regulamin sklepu internetowego',
		'Postanowienia ogólne',
		'Niniejszy regulamin określa zasady korzystania ze sklepu internetowego, zawierania umów sprzedaży oraz prawa i obowiązki sprzedawcy i klienta.',
		'Zawarcie umowy',
		'Umowa sprzedaży zostaje zawarta z chwilą potwierdzenia zamówienia przez sprzedawcę. Klient jest zobowiązany do podania prawdziwych danych.',
		'Prawo odstąpienia od umowy',
		'Konsument ma prawo odstąpić od umowy w terminie czternastu dni bez podania przyczyny. Sprzedawca zwraca wszystkie otrzymane płatności.',
		'Reklamacje',
		'Reklamację można złożyć drogą elektroniczną. Sprzedawca rozpatruje reklamację w terminie czternastu dni od dnia jej otrzymania.'
	].join('\n')
};

export const POLISH_PRODUCT_PAGE: Page = {
	title: 'Kurtka przeciwdeszczowa – sklep',
	h1: ['Kurtka przeciwdeszczowa'],
	h2: ['Opis', 'Opinie'],
	content: [
		'Kurtka przeciwdeszczowa',
		'Lekka kurtka z kapturem, idealna na wiosenne spacery i wycieczki w góry.',
		'Dodaj do koszyka',
		'Opis',
		'Materiał nie przepuszcza wody, a wentylowane plecy zapewniają komfort. Dostępne kolory: zielony, granatowy i czerwony.',
		'Opinie',
		'Świetna kurtka, polecam.',
		'Rozmiar zgodny z tabelą.'
	].join('\n')
};

export const FEATURE_SNAPSHOT_PAGES: Readonly<Record<string, Page>> = {
	tokens: {
		title: 'Terms & Conditions™',
		h1: ['Terms of Service'],
		h2: ['§ 2. Liability', 'Your rights'],
		content:
			'§2 sec. 3 applies. We don’t sell data!\nTerms of service, terms of service.\nFull-width ２０２６ and №5 stay apart.'
	},
	empty: { content: '', title: '', h1: [], h2: [] },
	numbersOnly: { content: '1 2 3\n2026', title: '404' }
};
