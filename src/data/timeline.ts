// Roles behind the /about timeline. `dates` is the absolute range shown next to
// a role; it is left empty where the range has not been confirmed, and the
// timeline falls back to `duration` (taken from the prose this list replaced)
// so an entry is never left with no chronology at all.
export interface TimelineEntry {
	company: string
	href?: string
	role: string
	dates?: string
	duration?: string
	detail: string
}

export const CURRENT_ROLE: TimelineEntry = {
	company: 'Wallfacer Technologies',
	href: 'https://wallfacer.ai/',
	role: 'Founder and CEO',
	detail:
		"AI employees that follow your team's process. You assign recurring work and Wallfacer carries it through the steps, checks, and corrections your handbook spells out, whether that is engineering, support, finance ops, or cloud ops. Each AI employee gets a prepared computer with the repo, services, and tools its role needs, and acts as its own user in the systems it touches.",
}

export const PAST_ROLES: TimelineEntry[] = [
	{
		company: 'Groupthink',
		href: 'https://groupthink.com',
		role: 'Founding engineer',
		detail:
			'Built real-time AI collaboration tools in React and React Native, and shaped the mobile and client architecture.',
	},
	{
		company: 'Meta',
		role: 'Senior Software Engineer, React Native',
		duration: 'about a decade',
		detail:
			'Led strategy for the New Architecture open source rollout: shaped the public roadmap, maintained the CI/CD pipeline, built core integrations, and kept internal systems aligned with open source releases. Authored much of the documentation and worked with the community to drive adoption.',
	},
	{
		company: 'Parse',
		role: 'Founding engineer (acquired by Meta)',
		detail:
			'Led community engagement, shaped the developer advocacy roadmap, and contributed to both frontend and platform tooling. Managed the Developer Advocacy team, gave talks worldwide, and helped guide the product through shutdown and open-sourcing.',
	},
	{
		company: 'Polsense',
		role: 'iOS engineer',
		duration: '2 years',
		detail:
			"Built iOS apps in Objective-C for Puerto Rico's largest bank, starting just after the App Store launched. It was the early days of mobile, and I went deep on iOS before most companies took it seriously.",
	},
	{
		company: 'Evertec',
		role: 'Systems architect',
		duration: '4 years',
		detail:
			'Designed and maintained high-availability systems in a regulated environment for the financial services provider behind the largest bank in Puerto Rico. A strong foundation in reliability and scale.',
	},
	{
		company: 'University of Puerto Rico',
		role: 'BS, Computer Engineering',
		detail:
			"Also managed the physics department's high-performance computing lab, which grounded my love for Unix systems and infrastructure.",
	},
]
