import { Probot, ProbotOctokit } from 'probot'
import { RequestError } from '@octokit/request-error'
import { RestEndpointMethodTypes } from '@octokit/plugin-rest-endpoint-methods'
import { readFileSync } from 'fs'
import { join } from 'path'
import { ChangeLog } from './model/ChangeLog'

class Repo {
  constructor(
    private octokit: InstanceType<typeof ProbotOctokit>,
    private owner: string,
    public name: string
  ) {}

  public async getChangeLogContent(ref: string): Promise<string> {
    const { data } = await this.octokit.repos.getContent({
      path: 'CHANGELOG.md',
      owner: this.owner,
      repo: this.name,
      ref
    })
    // narrow type to content-file; `data` could be other types like a directory listing
    if (!('content' in data)) {
      throw new Error('CHANGELOG is not a file!')
    }
    return Buffer.from(data.content, 'base64').toString()
  }

  public async getDefaultBranch(): Promise<string> {
    const repoParams: RestEndpointMethodTypes['repos']['get']['parameters'] = {
      owner: this.owner,
      repo: this.name
    }
    const repo = await this.octokit.repos.get(repoParams)
    return repo.data.default_branch
  }

  public async createPullRequest(origin: string) {
    const mainRef = await this.octokit.rest.git.getRef({
      repo: this.name,
      owner: this.owner,
      ref: `heads/${origin}`
    })
    const branchName = 'smartbear/changebot/add-changelog'
    const createBranchParams: RestEndpointMethodTypes['git']['createRef']['parameters'] =
      {
        ref: `refs/heads/${branchName}`,
        sha: mainRef.data.object.sha,
        owner: this.owner,
        repo: this.name
      }
    await this.octokit.rest.git.createRef(createBranchParams)

    const createFileParams: RestEndpointMethodTypes['repos']['createOrUpdateFileContents']['parameters'] =
      {
        owner: this.owner,
        repo: this.name,
        branch: branchName,
        path: 'CHANGELOG.md',
        message: 'A new and shiny changelog',
        content: readFileSync(join(__dirname, 'CHANGELOG.md')).toString(
          'base64'
        )
      }
    await this.octokit.repos.createOrUpdateFileContents(createFileParams)

    const prParameters: RestEndpointMethodTypes['pulls']['create']['parameters'] =
      {
        owner: this.owner,
        repo: this.name,
        title: 'Keep A ChangeLog!',
        head: branchName,
        base: origin,
        body: "You don't currently have a CHANGELOG.md file, this PR fixes that!"
      }

    await this.octokit.pulls.create(prParameters)
  }
}

export = (app: Probot): void => {
  app.log.info('Starting up...')

  app.onAny(async (context) => {
    app.log.info(`${context.name} event received`)
  })

  app.on('installation.created', async (context) => {
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

        const allComments: any[] = await context.octokit.paginate(
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

        const hasPreviousComment: boolean = allComments.some((comment) => {
          return (
            comment.body === commentToAdd &&
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
