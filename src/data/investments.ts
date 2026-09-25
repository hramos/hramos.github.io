// Companies listed on /angel. `year` is the year of the investment and is
// rendered only when set; the existing copy only dated the angel round as a
// whole (2021–2022), so per-company years are left for Héctor to fill in.
export interface Investment {
	name: string
	href: string
	description: string
	year?: string
	note?: string
}

export const ANGEL_INVESTMENTS: Investment[] = [
	{
		name: 'Homeroom',
		href: 'https://livehomeroom.com',
		description:
			'Rent-by-the-room housing, matching tenants with a place and roommates at the same time.',
		note: 'YC W22 · acquired by Bungalow',
	},
	{
		name: 'Nabis',
		href: 'https://nabis.com',
		description:
			'Licensed wholesale distribution and logistics for the California cannabis market.',
	},
	{
		name: 'ObviouslyAI',
		href: 'https://obviously.ai',
		description:
			'No-code machine learning: build and deploy predictive models from tabular data without writing code.',
	},
	{
		name: 'OlaClick',
		href: 'https://olaclick.com',
		description:
			'Online ordering and point of sale for restaurants across Latin America.',
	},
	{
		name: 'Pipe',
		href: 'https://pipe.com',
		description:
			'Capital platform that turns recurring revenue into upfront funding.',
	},
]

export const PRIVATE_INVESTMENTS: Investment[] = [
	{
		name: 'SpaceX',
		href: 'https://spacex.com',
		description:
			'Launch vehicles, spacecraft, and the Starlink satellite internet constellation.',
		note: 'via SPV',
	},
]
