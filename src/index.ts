import { Probot } from 'probot'
import { ChangeLog } from './model/ChangeLog'
import { Repo } from './Repo'
import { RequestError } from '@octokit/request-error'

export = (app: Probot): void => {
  app.log.info('Starting up...')

  app.on('installation.created', async (context) => {
    app.log.info(`${context.name} event received`)
    const owner = context.payload.installation.account.login
    for (const repository of context.payload.repositories || []) {
      const repo = new Repo(context.octokit, owner, repository.name)
      const defaultBranch = await repo.getDefaultBranch()

      if (await repo.hasChangeLogOn(defaultBranch)) {
        app.log.info('CHANGELOG.md exists, scanning for fixed issues')
        await commentOnIssues(repo, defaultBranch, defaultBranch)
      } else {
        app.log.info('CHANGELOG missing, creating PR')
        await repo.createPullRequest(defaultBranch)
      }
    }
  })

  interface PushPayload {
    repository: { default_branch: string }
    ref: string
    commits: { added: string[]; modified: string[]; removed: string[] }[]
  }

  class Push {
    constructor(private readonly payload: PushPayload) {}

    get isToDefaultBranch(): boolean {
      return this.ref == `refs/heads/${this.payload.repository.default_branch}`
    }

    get ref(): string {
      return this.payload.ref
    }

    get defaultBranch(): string {
      return this.payload.repository.default_branch
    }

    get touchesChangelog(): boolean {
      for (const commit of this.payload.commits) {
        for (const file of [...commit.added, ...commit.modified]) {
          if (file === 'CHANGELOG.md') {
            return true
          }
        }
      }
      return false
    }
  }

  app.on('push', async (context) => {
    app.log.info(`${context.name} event received`)
    const push = new Push(context.payload)

    if (!push.isToDefaultBranch) {
      app.log.info(`Ignoring push to non-default ref ${push.ref}`)
      return
    }

    // TODO: handle if there are pages of commits - https://github.com/SmartBear/changelog-bot/issues/17
    if (!push.touchesChangelog) {
      app.log.info(`Ignoring push that does not touch CHANGELOG.md`)
      return
    }
    const repo = Repo.fromContext(context)
    await commentOnIssues(repo, context.payload.after, push.defaultBranch)
  })

  async function commentOnIssues(
    repo: Repo,
    revision: string,
    defaultBranch: string
  ) {
    const content = await repo.getChangeLogContent(revision)
    const changeLog = await ChangeLog.parse(content)
    const currentUser = await repo.getCurrentUser()
    // Comment on issues
    for (const release of changeLog.releases) {
      // Do not add comments for unreleased issues (yet)
      if (release.name.toLowerCase().includes('unreleased')) {
        continue
      }
      for (const issue of release.issues) {
        let allComments: any[]
        try {
          allComments = await repo.getCommentsForIssue(issue)
        } catch (err) {
          if (err instanceof RequestError && err.status == 404) {
            app.log.info(
              `Issue #${issue.number} was mentioned in the changelog (release ${release.name}) but could not be found.`
            )
            continue
          }
          throw err
        }

        // TODO: make this more robust - it doesn't work if the release header contains a date - https://github.com/SmartBear/changelog-bot/issues/18
        // copy/pasted from the web 🤞
        const anchor = release.name
          .trim()
          .toLowerCase()
          .replace(/\./g, '')
          .replace(/[^\w\- ]+/g, ' ')
          .replace(/\s+/g, '-')
          .replace(/-+$/, '')
        const releaseUrl = `https://github.com/${repo.owner}/${repo.name}/blob/${defaultBranch}/CHANGELOG.md#${anchor}`

        const commentToAdd = `This was released in [${release.name}](${releaseUrl})`

        const hasPreviousComment = allComments.some((comment) => {
          return (
            comment.body === commentToAdd &&
            comment.user?.login === `${currentUser}[bot]`
          )
        })

        if (hasPreviousComment) {
          app.log.debug(
            `Not commenting on issue ${issue.number} since it already has a comment about this release`
          )
          continue
        }

        await repo.createIssueComment(issue, commentToAdd)
      }
    }
  }
}
