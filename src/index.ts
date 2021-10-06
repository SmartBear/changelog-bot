import { Probot, ProbotOctokit } from 'probot'
import { RequestError } from '@octokit/request-error'
import { RestEndpointMethodTypes } from '@octokit/plugin-rest-endpoint-methods'
import { ChangeLog } from './model/ChangeLog'

class Repo {
  constructor(
    private octokit: InstanceType<typeof ProbotOctokit>,
    private owner: string,
    public name: string
  ) {
  }

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

  public async createPullRequest(ref: string) {
    const mainRef = await this.octokit.rest.git.getRef({
      repo: this.name,
      owner: this.owner,
      ref
    })
    const branchName = "add-changelog";
    const createBranchParams: RestEndpointMethodTypes['git']['createRef']['parameters'] =
      {
        ref: `refs/heads/${branchName}`,
        sha: mainRef.data.object.sha,
        owner: this.owner,
        repo: this.name,
      }
    await this.octokit.rest.git.createRef(createBranchParams)

    const createFileParams: RestEndpointMethodTypes['repos']['createOrUpdateFileContents']['parameters'] =
      {
        owner: this.owner,
        repo: this.name,
        branch: branchName,
        path: "CHANGELOG.md",
        message: "A new and shiny changelog",
        content: Buffer.from("CHANGELOG.md").toString('base64')
      }
    this.octokit.repos.createOrUpdateFileContents(createFileParams)

    const prParameters: RestEndpointMethodTypes['pulls']['create']['parameters'] =
      {
        owner: this.owner,
        repo: this.name,
        title: "A changelog pr",
        head: branchName,
        base: ref,
        body: "the body of the pr"
      }

    this.octokit.pulls.create(prParameters);
  }
}

export = (app: Probot): void => {
  app.log.info('Starting up...')

  app.on('push', async (context) => {
    if (
      context.payload.ref !==
      `refs/heads/${context.payload.repository.default_branch}`
    ) {
      app.log.info(`Ignoring push to non-default-branch ${context.payload.ref}`)
      return
    }

    // STEPS:

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
    let content = ''
    try {
      content = await repo.getChangeLogContent(ref)
    } catch (err) {
      if (!(err instanceof RequestError)) {
        throw err
      }
      // create an issue if CHANGELOG.md cannot be found
      if (err.status == 404) {
        app.log.info("CHANGELOG missing, creating PR")
        await repo.createPullRequest(`refs/heads/${context.payload.repository.default_branch}`)
        // const req: RestEndpointMethodTypes['issues']['listForRepo']['parameters'] =
        //   {
        //     repo: repo.name,
        //     owner,
        //     creator: `${currentUser.data.name}[bot]`
        //   }
        //
        // const allIssues: any[] = await context.octokit.paginate(
        //   context.octokit.issues.listForRepo,
        //   req,
        //   ({ data }) => data
        // )
        //
        // if (
        //   !allIssues.some((issue) => issue.title === 'CHANGELOG.md is missing')
        // ) {
        //   const issue: RestEndpointMethodTypes['issues']['create']['parameters'] =
        //     {
        //       owner,
        //       repo: repo.name,
        //       title: 'CHANGELOG.md is missing',
        //       body: 'You really should have a CHANGELOG.md'
        //     }
        //   await context.octokit.issues.create(issue)
        // }

        return
      }
    }

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
