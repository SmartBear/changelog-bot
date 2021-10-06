import { ProbotOctokit } from 'probot';
import { RestEndpointMethodTypes } from '@octokit/plugin-rest-endpoint-methods';
import { readFileSync } from 'fs';
import { join } from 'path';

export class Repo {
  constructor(
    private octokit: InstanceType<typeof ProbotOctokit>,
    private owner: string,
    public name: string
  ) { }

  public async getChangeLogContent(ref: string): Promise<string> {
    const { data } = await this.octokit.repos.getContent({
      path: 'CHANGELOG.md',
      owner: this.owner,
      repo: this.name,
      ref
    });
    // narrow type to content-file; `data` could be other types like a directory listing
    if (!('content' in data)) {
      throw new Error('CHANGELOG is not a file!');
    }
    return Buffer.from(data.content, 'base64').toString();
  }

  public async getDefaultBranch(): Promise<string> {
    const repoParams: RestEndpointMethodTypes['repos']['get']['parameters'] = {
      owner: this.owner,
      repo: this.name
    };
    const repo = await this.octokit.repos.get(repoParams);
    return repo.data.default_branch;
  }

  public async createPullRequest(origin: string) {
    const mainRef = await this.octokit.rest.git.getRef({
      repo: this.name,
      owner: this.owner,
      ref: `heads/${origin}`
    });
    const branchName = 'smartbear/changebot/add-changelog';
    const createBranchParams: RestEndpointMethodTypes['git']['createRef']['parameters'] = {
      ref: `refs/heads/${branchName}`,
      sha: mainRef.data.object.sha,
      owner: this.owner,
      repo: this.name
    };
    await this.octokit.rest.git.createRef(createBranchParams);

    const createFileParams: RestEndpointMethodTypes['repos']['createOrUpdateFileContents']['parameters'] = {
      owner: this.owner,
      repo: this.name,
      branch: branchName,
      path: 'CHANGELOG.md',
      message: 'A new and shiny changelog',
      content: readFileSync(join(__dirname, 'CHANGELOG.md')).toString(
        'base64'
      )
    };
    await this.octokit.repos.createOrUpdateFileContents(createFileParams);

    const prParameters: RestEndpointMethodTypes['pulls']['create']['parameters'] = {
      owner: this.owner,
      repo: this.name,
      title: 'Keep A ChangeLog!',
      head: branchName,
      base: origin,
      body: "You don't currently have a CHANGELOG.md file, this PR fixes that!"
    };

    await this.octokit.pulls.create(prParameters);
  }
}
