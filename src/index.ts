import { Probot } from 'probot'
import { RequestError } from '@octokit/request-error'
import { RestEndpointMethodTypes } from '@octokit/plugin-rest-endpoint-methods'
import { ChangeLog } from './model/ChangeLog'
import { Repo } from './Repo'

export = (app: Probot): void => {
  app.log.info('Starting up...')

  app.on('installation.created', async (context) => {
    app.log.info(`${context.name} event received`)
    const owner = context.payload.installation.account.login
    for (const repository of context.payload.repositories) {
      const repo = new Repo(context.octokit, owner, repository.name)

      const defaultBranch = await repo.getDefaultBranch()

      try {
        await repo.getChangeLogContent(defaultBranch)
        app.log.info('CHANGELOG.md exists, nothing to do')
        // TODO: could run a full scan here? https://github.com/SmartBear/changelog-bot/issues/16
      } catch (err) {
        if (!(err instanceof RequestError)) {
          throw err
        }
        // create an issue if CHANGELOG.md cannot be found
        if (err.status == 404) {
          app.log.info('CHANGELOG missing, creating PR')
          await repo.createPullRequest(defaultBranch)
        }
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

    get touchesChangelog(): boolean {
      for (const commit of this.payload.commits) {
        for (const file of [
          ...commit.added,
          ...commit.modified,
          ...commit.removed
        ]) {
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

    // 1. Read the body of the changelog file
    // --------------------------------------

    const owner: string =
      context.payload.organization?.login ||
      context.payload.repository.owner.login ||
      ''
    const revision: string = context.payload.after
    const currentUser = await context.octokit.apps.getAuthenticated()
    const repo = new Repo(
      context.octokit,
      owner,
      context.payload.repository.name
    )

    // TODO: handle when there's no changelog file in the repo - do nothing - https://github.com/SmartBear/changelog-bot/issues/15
    const content = await repo.getChangeLogContent(revision)

    // 2. Parse it, to relate releases to issues
    // -----------------------------------------
    const changeLog = await ChangeLog.parse(content)

    // 3. Comment on issues
    // --------------------
    for (const release of changeLog.releases) {
      // Do not add comments for unreleased issues (yet)
      if (release.name.toLowerCase().includes('unreleased')) {
        continue
      }
      for (const issue of release.issues) {
        const request: RestEndpointMethodTypes['issues']['listComments']['parameters'] =
          {
            owner,
            repo: repo.name,
            issue_number: issue.number
          }

        const allComments = await context.octokit.paginate(
          context.octokit.issues.listComments,
          request,
          ({ data }) => data
        )

        // TODO: make this more robust - it doesn't work if the release header contains a date - https://github.com/SmartBear/changelog-bot/issues/18
        // copy/pasted from the web 🤞
        const anchor = release.name
          .trim()
          .toLowerCase()
          .replace(/\./g, '')
          .replace(/[^\w\- ]+/g, ' ')
          .replace(/\s+/g, '-')
          .replace(/-+$/, '')
        const releaseUrl = `https://github.com/${owner}/${repo.name}/blob/${revision}/CHANGELOG.md#${anchor}`

        const commentToAdd = `This was released in [${release.name}](${releaseUrl})`

        const hasPreviousComment = allComments.some((comment) => {
          return (
            comment.body === commentToAdd &&
            comment.user &&
            comment.user.login === `${currentUser.data.name}[bot]`
          )
        })

        if (hasPreviousComment) {
          app.log.debug(
            `Not commenting on issue ${issue.number} since it already has a comment about this release`
          )
          continue
        }

        const issueComment: RestEndpointMethodTypes['issues']['createComment']['parameters'] =
          {
            owner,
            repo: repo.name,
            issue_number: issue.number,
            body: commentToAdd
          }
        await context.octokit.issues.createComment(issueComment)
      }
    }
  })
}
