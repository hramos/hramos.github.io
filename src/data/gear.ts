// Gear inventory rendered by src/pages/gear.astro
//
// To add something, drop an object into the right category's `items` array:
//
//   { name: 'Mac Studio', note: 'M4 Max, 64GB', icon: 'desktop-tower', url: 'https://…' }
//
// `icon` is a Material Design Icons name without the `mdi:` prefix — browse them
// at https://icon-sets.iconify.design/mdi/. `note` and `url` are optional.
// Categories with no items are skipped, so you can leave stubs in place.

export interface GearItem {
	name: string
	note?: string
	url?: string
	icon: string
}

export interface GearCategory {
	name: string
	slug: string
	blurb?: string
	items: GearItem[]
}

export const GEAR_CATEGORIES: GearCategory[] = [
	{
		name: 'Workspace',
		slug: 'workspace',
		blurb: 'The desk I spend most of my day at.',
		items: [],
	},
	{
		name: 'Observatory',
		slug: 'observatory',
		blurb:
			'A backyard rig outside Scottsdale for deep-sky imaging. More on how I got here, plus the images themselves, on the astrophotography page.',
		items: [
			{
				name: 'William Optics ZenithStar 73iii',
				note: 'Doublet apo refractor, 430mm f/5.9',
				icon: 'telescope',
			},
			{
				name: 'William Optics Flat 73A',
				note: 'Field flattener for the ZS73iii',
				icon: 'image-filter-center-focus',
			},
			{
				name: 'iOptron GEM45',
				note: 'German equatorial mount',
				icon: 'cog',
			},
			{
				name: 'ZWO ASI294MM Pro',
				note: 'Cooled monochrome imaging camera',
				icon: 'camera-iris',
			},
			{
				name: 'ZWO narrowband filters',
				note: 'Hα, OIII and SII — how I cut through light pollution',
				icon: 'image-filter-black-white',
			},
			{
				name: 'ZWO EFW',
				note: '8-position filter wheel, 1.25" / 31mm',
				icon: 'filter',
			},
			{
				name: 'William Optics UniGuide 50',
				note: 'Guide scope',
				icon: 'binoculars',
			},
			{
				name: 'ZWO ASI120MM Mini',
				note: 'Guide camera',
				icon: 'camera',
			},
			{
				name: 'ZWO EAF',
				note: 'Electronic autofocuser',
				icon: 'focus-field',
			},
			{
				name: 'ZWO ASIAIR',
				note: 'Runs the whole session — mount, camera, filters, focus',
				icon: 'chip',
			},
			{
				name: 'PixInsight',
				note: 'Calibration, stacking and processing',
				icon: 'star-four-points',
				url: 'https://pixinsight.com/',
			},
		],
	},
	{
		name: 'Home lab',
		slug: 'home-lab',
		blurb: 'Systems I keep running around the house for fun.',
		items: [
			{
				name: 'Rooftop ADS-B receiver',
				note: 'Feeds a live map of everything flying overhead',
				icon: 'radio-tower',
			},
		],
	},
	{
		name: 'Coffee',
		slug: 'coffee',
		blurb:
			'I have been making coffee the same way for well over a decade. I wrote up the inverted method back in 2011 and never found a reason to change it.',
		items: [
			{
				name: 'AeroPress',
				note: 'Inverted method, fine grind, 175°F',
				icon: 'coffee-maker',
				url: '/blog/aeropress',
			},
			{
				name: 'Stovetop kettle',
				note: 'Metal, for at home',
				icon: 'kettle',
			},
			{
				name: 'Electric kettle',
				note: 'Faster, for the office',
				icon: 'kettle',
			},
		],
	},
	{
		name: 'Everyday carry',
		slug: 'edc',
		items: [],
	},
	{
		name: 'Travel',
		slug: 'travel',
		items: [],
	},
	{
		name: 'Software',
		slug: 'software',
		blurb: 'Apps and services I pay for and would miss.',
		items: [],
	},
	{
		name: 'Wanted',
		slug: 'wanted',
		blurb: 'On the list, not yet on the desk.',
		items: [],
	},
	{
		name: 'Archived',
		slug: 'archived',
		blurb: 'Served me well, no longer in rotation.',
		items: [],
	},
]