import { RequestError } from '@octokit/request-error'
import { ProbotOctokit } from 'probot'
import { RestEndpointMethodTypes } from '@octokit/plugin-rest-endpoint-methods'
import { readFileSync } from 'fs'
import { join } from 'path'
import { Issue } from './model/Issue'

interface Context {
  octokit: InstanceType<typeof ProbotOctokit>
  payload: {
    organization?: {
      login: string
    }
    repository: {
      owner: {
        login: string
      }
      name: string
    }
  }
}

export class Repo {
  static fromContext(context: Context): Repo {
    const owner: string =
      context.payload.organization?.login ||
      context.payload.repository.owner.login ||
      ''
    return new Repo(context.octokit, owner, context.payload.repository.name)
  }

  constructor(
    private octokit: InstanceType<typeof ProbotOctokit>,
    public owner: string,
    public name: string
  ) {}

  public async hasChangeLogOn(branch: string): Promise<boolean> {
    try {
      await this.getChangeLogContent(branch)
      return true
    } catch (err) {
      if (!(err instanceof RequestError)) {
        throw err
      }
      // create an issue if CHANGELOG.md cannot be found
      if (err.status == 404) {
        return false
      }
      throw err
    }
  }

  public async getCommentsForIssue(issue: Issue) {
    const request: RestEndpointMethodTypes['issues']['listComments']['parameters'] =
      {
        owner: this.owner,
        repo: this.name,
        issue_number: issue.number
      }

    return this.octokit.paginate(
      this.octokit.issues.listComments,
      request,
      ({ data }) => data
    )
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

  public async getDefaultBranch(): Promise<string> {
    const repoParams: RestEndpointMethodTypes['repos']['get']['parameters'] = {
      owner: this.owner,
      repo: this.name
    }
    const repo = await this.octokit.repos.get(repoParams)
    return repo.data.default_branch
  }

  public async createPullRequest(origin: string): Promise<void> {
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

  async createIssueComment(issue: Issue, commentToAdd: string): Promise<void> {
    const issueComment: RestEndpointMethodTypes['issues']['createComment']['parameters'] =
      {
        owner: this.owner,
        repo: this.name,
        issue_number: issue.number,
        body: commentToAdd
      }
    await this.octokit.issues.createComment(issueComment)
  }
}
