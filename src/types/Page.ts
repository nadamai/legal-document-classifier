export type Page = Readonly<{
	content: string;
	title?: string;
	h1?: readonly string[];
	h2?: readonly string[];
}>;
