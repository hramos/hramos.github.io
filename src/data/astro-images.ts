// Captures shown in the gallery at the top of /astro.
//
// To add one: drop the file in src/assets/astro/ and add an entry here with a
// matching `file`. Entries whose file is missing are skipped, so the gallery
// never renders a broken image, and the whole gallery is omitted while this
// list is empty.
export interface AstroCapture {
	/** Filename under src/assets/astro/, e.g. 'm42-orion.jpg'. */
	file: string
	/** Target name, used as the caption headline and in the alt text. */
	target: string
	/** Total integration time, e.g. '8h 20m'. */
	integration?: string
	/** Filters used, e.g. 'Hα, OIII, SII'. */
	filters?: string
	/** When it was captured, e.g. 'January 2022'. */
	captured?: string
}

export const ASTRO_GALLERY: AstroCapture[] = []
