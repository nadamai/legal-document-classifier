export const EXCLUDED_SELECTOR: string = [
	'nav',
	'aside',
	'dialog',
	'[role="banner"]',
	'[role="navigation"]',
	'[role="contentinfo"]',
	'[role="complementary"]',
	'[role="dialog"]',
	'[role="alertdialog"]',
	'[aria-modal="true"]'
].join(', ');

export const CONSENT_TOOL_SELECTOR: string = [
	'#onetrust-consent-sdk',
	'#onetrust-banner-sdk',
	'#CybotCookiebotDialog',
	'#didomi-host',
	'#usercentrics-root',
	'#cookie-law-info-bar',
	'#iubenda-cs-banner',
	'#BorlabsCookieBox',
	'#cmplz-cookiebanner-container',
	'#truste-consent-track',
	'#moove_gdpr_cookie_info_bar',
	'.qc-cmp2-container',
	'.cky-consent-container',
	'.osano-cm-window',
	'.cc-window',
	'.klaro'
].join(', ');

// Names banners only, so a cookie policy's own `cookie-table` stays.
export const CONSENT_NAME: RegExp =
	/(?:^|[\s_-])(?:cookies?|consent|gdpr|rodo)[-_]?(?:banner|bar|notice|popup|modal|dialog|overlay|box|wall|alert|law)(?:$|[\s_-])/i;

export const HEADER_FOOTER_SELECTOR: string = 'header, footer';

export const SECTIONING_SELECTOR: string = 'article, aside, main, nav, section';

export const MAIN_SELECTOR: string = 'main, [role="main"]';

// Ligature icon fonts: their icon names (`subject_black`) are real text.
export const ICON_FONT_SELECTOR: string =
	'[class*="material-icons"], [class*="material-symbols"]';

export const NON_RENDERED_SELECTOR: string =
	'script, style, noscript, template, svg';
