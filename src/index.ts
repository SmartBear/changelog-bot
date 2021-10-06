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
        // TODO: could run a full scan here?
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

  app.on('push', async (context) => {
    app.log.info(`${context.name} event received`)
    if (
      context.payload.ref !==
      `refs/heads/${context.payload.repository.default_branch}`
    ) {
      app.log.info(`Ignoring push to non-default-branch ${context.payload.ref}`)
      return
    }

    // STEPS:

    // 0. Ignore a push that doesn't update the CHANGELOG
    // TODO: handle if there are pages of commits
    if (!pushIncludesChangesToChangeLog(context.payload.commits)) {
      return
    }

    function pushIncludesChangesToChangeLog(
      commits: { added: string[]; modified: string[]; removed: string[] }[]
    ) {
      for (const commit of commits) {
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

    // 1. Read the body of the changelog file
    // --------------------------------------

    const owner: string =
      context.payload.organization?.login ||
      context.payload.repository.owner.login ||
      ''
    const ref: string = context.payload.after
    const currentUser = await context.octokit.apps.getAuthenticated()
    const repo = new Repo(
      context.octokit,
      owner,
      context.payload.repository.name
    )

    // TODO: handle when there's no changelog file in the repo - do nothing
    const content = await repo.getChangeLogContent(ref)

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

        // TODO: make this more robust - it doesn't work if the release header contains a date
        // copy/pasted from the web 🤞
        const anchor = release.name
          .trim()
          .toLowerCase()
          .replace(/\./g, '')
          .replace(/[^\w\- ]+/g, ' ')
          .replace(/\s+/g, '-')
          .replace(/-+$/, '')
        const releaseUrl = `https://github.com/${owner}/${repo.name}/blob/${ref}/CHANGELOG.md#${anchor}`

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
