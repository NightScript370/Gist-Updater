require('dotenv').config()

const { Toolkit } = require('actions-toolkit')
const { GistBox, MAX_LENGTH } = require('gist-box')

const capitalize = str => str.slice(0, 1).toUpperCase() + str.slice(1)

const serializers = {
	IssueCommentEvent: item => `🗣 (${item.created_at}) Commented on #${item.payload.issue.number} in ${item.repo.name}`,
	IssuesEvent: item => `❗️ (${item.created_at}) ${capitalize(item.payload.action)} issue #${item.payload.issue.number} in ${item.repo.name}`,
	ForkEvent: item => `🍴 (${item.created_at}) Forked ${item.repo.name}`,
	GollumEvent: item => `📜 (${item.created_at}) Updated ${item.repo.name}'s Wiki`,
	ReleaseEvent: item => `📣 (${item.created_at}) ${item.payload.prerelease == true ? 'Pre-Released' : 'Released'} ${item.repo.name} ${item.payload.release.tag_name}`,
	PullRequestEvent: item => {
		let emote;
		let action;
		let timeStamp = item.created_at;

		if (item.payload.pull_request.merged) {
			emote = '🎉';
			action = 'Merged';
		} else {
			emote = (item.payload.action === 'opened' ? '💪' : '❌');
			action = capitalize(item.payload.action)
		}

		if (!timeStamp.startsWith('('))
			timeStamp = '(' + timeStamp;

		if (!timeStamp.endsWith(')'))
			timeStamp += ')';

		return [emote, timeStamp, action, `PR #${item.payload.pull_request.number} in ${item.repo.name}`].join(' ');
	}
}

Toolkit.run(
	async tools => {
		const { GIST_ID, GH_USERNAME, GH_PAT } = process.env

		// Get the user's public events
		tools.log.debug(`Getting activity for ${GH_USERNAME}`)
		const events = await tools.github.activity.listPublicEventsForUser({ username: GH_USERNAME, per_page: 100 })
		tools.log.debug(`Activity for ${GH_USERNAME}, ${events.data.length} events found.`)

		const content = events.data
			.filter(event => serializers.hasOwnProperty(event.type))             // Filter out any boring activity
			.slice(0, 15)                                                        // We only have 15 lines to work with
			.map(item => serializers[item.type](item))                           // Call the serializer to construct a string
			.map(str => str.length <= 95 ? str : str.slice(0, 95 - 3) + '...')   // Truncate if necessary
			.join('\n')                                                          // Join items to one string

		const box = new GistBox({ id: GIST_ID, token: GH_PAT })
		try {
			tools.log.debug(`Updating Gist ${GIST_ID}`)
			let currentGist = await box.get()
			
			if (currentGist !== content) {
				await box.update({ content })
				tools.exit.success('Gist updated!')
			} else {
				tools.exit.success('No need for updated Gist!')
			}
		} catch (err) {
			tools.log.debug('Error getting or update the Gist:')
			return tools.exit.failure(err)
		}
	},
	{ event: 'schedule', secrets: ['GITHUB_TOKEN', 'GH_PAT', 'GH_USERNAME', 'GIST_ID'] }
)
